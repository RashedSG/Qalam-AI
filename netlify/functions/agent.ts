/**
 * قلم | QALAM — نقطة الاتصال بوكيل قلم.
 *
 *   المتصفح → هذه الدالة → OpenAI (+ أدوات القاعدة بهوية المستخدم) → المتصفح
 *
 * ضمانات هذه الدالة:
 * - المصادقة قبل أي عمل، وحصة مستقلة عن حصة المهام البسيطة.
 * - كل أداة تُنفَّذ برمز جلسة المستخدم — لا service_role، فلا تجاوز لـRLS.
 * - كل محتوى خارجي (رسائل المستخدم ونتائج الأدوات) مُغلَّف كبيانات لا تعليمات.
 * - حدود صارمة: خطوات، استدعاءات، زمن، رموز.
 * - لا يدخل السجل نص رسالة ولا نتيجة أداة — أسماء ونتائج منطقية فقط.
 */
import type { Handler, HandlerEvent } from '@netlify/functions'
import { z } from 'zod'
import { ConfigError, readEnv } from './_shared/env'
import { verifySupabaseUser } from './_shared/auth'
import { checkLocalBurst } from './_shared/rateLimit'
import { log } from './_shared/log'
import { AgentError, DEFAULT_AGENT_LIMITS, runAgent, type AgentLimits } from './_shared/agentLoop'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function fail(status: number, code: string, message: string, extra: Record<string, string> = {}) {
  return {
    statusCode: status,
    headers: { ...JSON_HEADERS, ...extra },
    body: JSON.stringify({ error: { code, message } }),
  }
}

/** حد الرسائل يمنع تمرير محادثة ضخمة تلتهم السياق والميزانية. */
const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(20),
  /** وصف قصير للشاشة الحالية — لا محتوى مراسلة. */
  context: z.string().max(200).nullable().optional(),
})

interface RpcRow {
  allowed?: boolean
  reason?: string | null
  retry_after_seconds?: number | null
  run_id?: string | null
}

async function rpc(
  ctx: { supabaseUrl: string; supabaseAnonKey: string; accessToken: string },
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${ctx.supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: ctx.supabaseAnonKey,
      Authorization: `Bearer ${ctx.accessToken}`,
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) throw new Error(`rpc ${fn} failed with status ${res.status}`)
  return res.json()
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') return fail(405, 'method_not_allowed', 'Method not allowed.')

  let env
  try {
    env = readEnv()
  } catch (err) {
    if (err instanceof ConfigError) {
      log.error('ai.config_error', { missing: err.message.replace(/^[^:]*:\s*/, '') })
      return fail(500, 'server', 'الخدمة غير مهيأة بشكل صحيح. راجع إعدادات البيئة.')
    }
    throw err
  }

  const authHeader = event.headers.authorization ?? event.headers.Authorization
  const user = await verifySupabaseUser(authHeader, env.supabaseUrl, env.supabaseAnonKey)
  if (!user) {
    log.warn('ai.unauthenticated')
    return fail(401, 'unauthenticated', 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.')
  }

  const accessToken = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim()
  const rpcCtx = { supabaseUrl: env.supabaseUrl, supabaseAnonKey: env.supabaseAnonKey, accessToken }

  if (!checkLocalBurst(user.id)) {
    return fail(429, 'rate_limited', 'تم تجاوز عدد الطلبات المسموح بها. انتظر قليلًا ثم حاول مجددًا.', {
      'Retry-After': '10',
    })
  }

  let body: unknown
  try {
    body = JSON.parse(event.body ?? '{}')
  } catch {
    return fail(400, 'bad_request', 'صيغة الطلب غير صحيحة.')
  }

  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) {
    log.warn('ai.invalid_input', { task: 'agent' })
    return fail(400, 'bad_request', 'البيانات المُرسلة غير مكتملة أو غير صالحة.')
  }

  /* --------------------------- حجز التشغيل --------------------------- */
  let runId: string | null = null
  try {
    const rows = (await rpc(rpcCtx, 'begin_agent_run', {
      p_model: env.openaiModel,
      p_organization_id: null,
    })) as RpcRow[]
    const decision = Array.isArray(rows) ? rows[0] : undefined
    if (decision && decision.allowed === false) {
      log.warn('ai.rate_limited', { task: 'agent', reason: decision.reason })
      return fail(429, 'rate_limited', 'بلغت سقف استخدام المساعد. حاول لاحقًا.', {
        'Retry-After': String(decision.retry_after_seconds ?? 3600),
      })
    }
    runId = decision?.run_id ?? null
  } catch {
    // fail-open كما في حد المعدّل: تعذّر التتبّع لا يُسقط الخدمة، والمصادقة تمت.
    log.warn('ai.quota_check_failed', { task: 'agent' })
  }

  /* ---------------------------- الحدود ---------------------------- */
  const limits: AgentLimits = {
    ...DEFAULT_AGENT_LIMITS,
    // السقف الزمني للدالة نفسها أضيق: لا نتجاوز مهلة المنصة.
    timeoutMs: Math.min(DEFAULT_AGENT_LIMITS.timeoutMs, env.aiTimeoutMs),
  }

  const startedAt = Date.now()
  try {
    const result = await runAgent({
      history: parsed.data.messages,
      contextLabel: parsed.data.context ?? null,
      apiKey: env.openaiApiKey,
      model: env.openaiModel,
      toolCtx: { ...rpcCtx, timeoutMs: 8_000 },
      limits,
    })

    const durationMs = Date.now() - startedAt
    if (runId) {
      await rpc(rpcCtx, 'finish_agent_run', {
        p_run_id: runId,
        p_status: 'success',
        p_steps: result.steps,
        p_tool_calls: result.toolCalls,
        p_prompt_tokens: result.usage.promptTokens,
        p_completion_tokens: result.usage.completionTokens,
        p_total_tokens: result.usage.totalTokens,
        p_duration_ms: durationMs,
        p_error_code: null,
        p_injection_flags: result.injectionSignals,
      }).catch(() => log.warn('ai.usage_record_failed'))
    }

    log.info('ai.completed', {
      task: 'agent',
      durationMs,
      steps: result.steps,
      toolCalls: result.toolCalls.length,
      totalTokens: result.usage.totalTokens,
      injection: result.injectionSignals,
      stoppedBy: result.stoppedBy,
    })

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({
        data: {
          reply: result.reply,
          citations: result.citations,
          toolsUsed: result.toolCalls.map((call) => call.tool),
          stoppedBy: result.stoppedBy,
          // يُعرض للمستخدم: «هذا المحتوى حاول توجيهي» أوضح من إخفائه.
          injectionSignals: result.injectionSignals,
        },
      }),
    }
  } catch (err) {
    const code = err instanceof AgentError ? err.code : 'unexpected'
    log.error('ai.unexpected_error', { task: 'agent', kind: code })

    if (runId) {
      await rpc(rpcCtx, 'finish_agent_run', {
        p_run_id: runId,
        p_status: code === 'timeout' ? 'aborted' : 'error',
        p_steps: 0,
        p_tool_calls: [],
        p_duration_ms: Date.now() - startedAt,
        p_error_code: code,
      }).catch(() => log.warn('ai.usage_record_failed'))
    }

    if (code === 'timeout') {
      return fail(504, 'timeout', 'استغرقت العملية وقتًا أطول من المتوقع. جرّب سؤالًا أضيق.')
    }
    if (code === 'upstream_rate_limited') {
      return fail(429, 'rate_limited', 'الخدمة مزدحمة حاليًا. حاول مرة أخرى بعد قليل.', { 'Retry-After': '30' })
    }
    return fail(502, 'server', 'تعذّر إتمام العملية حاليًا. حاول مرة أخرى بعد قليل.')
  }
}
