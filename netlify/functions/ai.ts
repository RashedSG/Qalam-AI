/**
 * قلم | QALAM — نقطة الاتصال الآمنة الوحيدة بـ OpenAI.
 *
 *   المتصفح → هذه الدالة → OpenAI → المتصفح
 *
 * ضمانات:
 * - OPENAI_API_KEY لا يغادر الخادم إطلاقًا.
 * - كل طلب يتطلب جلسة Supabase صالحة (المصادقة قبل أي عمل).
 * - حد معدّل دائم وذرّي في قاعدة البيانات قبل أي استدعاء خارجي.
 * - سقف زمني صريح لكل استدعاء خارجي.
 * - كل مدخل يُتحقق منه بـ Zod قبل بناء الـ prompt.
 * - كل مخرج يُتحقق منه بـ Zod، مع إعادة محاولة واحدة آمنة.
 * - لا يدخل السجل أي محتوى مراسلة ولا prompt ولا رسالة مزوّد خام.
 */
import type { Handler, HandlerEvent } from '@netlify/functions'
import { ConfigError, readEnv } from './_shared/env'
import { verifySupabaseUser } from './_shared/auth'
import { checkLocalBurst } from './_shared/rateLimit'
import { classifyUpstreamStatus, log } from './_shared/log'
import { beginAiRequest, finishAiRequest } from './_shared/usage'
import { extractJson, runPrompt, TimeoutError, UpstreamError } from './_shared/openai'
import { TASK_REGISTRY, type TaskName } from './_shared/registry'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

type ErrorCode =
  | 'method_not_allowed'
  | 'bad_request'
  | 'unauthenticated'
  | 'rate_limited'
  | 'invalid_response'
  | 'timeout'
  | 'server'

function fail(status: number, code: ErrorCode, message: string, extraHeaders: Record<string, string> = {}) {
  return {
    statusCode: status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
    body: JSON.stringify({ error: { code, message } }),
  }
}

function ok(data: unknown) {
  return { statusCode: 200, headers: JSON_HEADERS, body: JSON.stringify({ data }) }
}

/** رسالة الرفض تختلف بحسب الحد المُتجاوَز — أوضح للمستخدم وبلا تفاصيل داخلية. */
function rateLimitMessage(reason: string | null): string {
  if (reason === 'daily_quota') {
    return 'بلغت سقف الاستخدام اليومي. يمكنك المتابعة غدًا.'
  }
  return 'تم تجاوز عدد الطلبات المسموح بها. انتظر قليلًا ثم حاول مجددًا.'
}

interface RequestBody {
  provider?: string
  task?: string
  payload?: unknown
}

export const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return fail(405, 'method_not_allowed', 'Method not allowed.')
  }

  let env
  try {
    env = readEnv()
  } catch (err) {
    if (err instanceof ConfigError) {
      // أسماء المتغيرات الناقصة فقط — لا قيم.
      log.error('ai.config_error', { missing: err.message.replace(/^[^:]*:\s*/, '') })
      return fail(500, 'server', 'الخدمة غير مهيأة بشكل صحيح. راجع إعدادات البيئة.')
    }
    throw err
  }

  /* ------------------------------ المصادقة ------------------------------ */
  const authHeader = event.headers.authorization ?? event.headers.Authorization
  const user = await verifySupabaseUser(authHeader, env.supabaseUrl, env.supabaseAnonKey)
  if (!user) {
    log.warn('ai.unauthenticated')
    return fail(401, 'unauthenticated', 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.')
  }

  const accessToken = (authHeader ?? '').replace(/^Bearer\s+/i, '').trim()

  /* ---------------------------- تحليل الطلب ----------------------------- */
  let body: RequestBody
  try {
    body = JSON.parse(event.body ?? '{}') as RequestBody
  } catch {
    return fail(400, 'bad_request', 'صيغة الطلب غير صحيحة.')
  }

  const taskName = body.task as TaskName | undefined
  if (!taskName || !Object.prototype.hasOwnProperty.call(TASK_REGISTRY, taskName)) {
    log.warn('ai.unknown_task')
    return fail(400, 'bad_request', 'العملية المطلوبة غير معروفة.')
  }

  // V1: OpenAI فقط. طبقة التجريد جاهزة لإضافة مزودين آخرين هنا لاحقًا.
  const provider = body.provider ?? 'openai'
  if (provider !== 'openai') {
    log.warn('ai.unsupported_provider')
    return fail(400, 'bad_request', 'مزود الذكاء الاصطناعي غير مدعوم.')
  }

  const definition = TASK_REGISTRY[taskName]
  const inputResult = definition.inputSchema.safeParse(body.payload)
  if (!inputResult.success) {
    // اسم المهمة فقط — لا أي جزء من مدخلات المستخدم.
    log.warn('ai.invalid_input', { task: taskName })
    return fail(400, 'bad_request', 'البيانات المُرسلة غير مكتملة أو غير صالحة.')
  }

  /* ---------------------------- حد المعدّل ----------------------------- */
  // حاجز محلي رخيص أولًا، ثم الحد الدائم الذرّي في القاعدة.
  if (!checkLocalBurst(user.id)) {
    log.warn('ai.rate_limited', { task: taskName, reason: 'local_burst' })
    return fail(429, 'rate_limited', rateLimitMessage(null), { 'Retry-After': '10' })
  }

  const rpcCtx = {
    supabaseUrl: env.supabaseUrl,
    supabaseAnonKey: env.supabaseAnonKey,
    accessToken,
  }

  const quota = await beginAiRequest(rpcCtx, taskName, provider, env.openaiModel)
  if (!quota.allowed) {
    log.warn('ai.rate_limited', { task: taskName, reason: quota.reason })
    return fail(429, 'rate_limited', rateLimitMessage(quota.reason), {
      'Retry-After': String(quota.retryAfterSeconds),
    })
  }

  /* --------------------------- تنفيذ مع إعادة محاولة --------------------- */
  const build = definition.build as (input: unknown) => ReturnType<typeof definition.build>
  const spec = build(inputResult.data)
  const startedAt = Date.now()

  const attempt = async (strict: boolean) => {
    const effectiveSpec = strict
      ? {
          ...spec,
          temperature: Math.min(spec.temperature, 0.2),
          system: `${spec.system}\n\nتنبيه: المحاولة السابقة أنتجت JSON غير صالح. أعد الإجابة بكائن JSON صالح فقط، بلا أي نص إضافي.`,
        }
      : spec
    const { content, usage } = await runPrompt(effectiveSpec, env.openaiApiKey, env.openaiModel, {
      timeoutMs: env.aiTimeoutMs,
    })
    return { parsed: definition.outputSchema.safeParse(extractJson(content)), usage }
  }

  /** يحسم صف التتبّع ثم يعيد استجابة الخطأ — حتى لا يبقى صف 'pending' معلّقًا. */
  const failTracked = async (
    errorCode: string,
    status: number,
    code: ErrorCode,
    message: string,
    extraHeaders: Record<string, string> = {},
  ) => {
    await finishAiRequest(rpcCtx, quota.requestId, {
      status: 'error',
      durationMs: Date.now() - startedAt,
      errorCode,
    })
    return fail(status, code, message, extraHeaders)
  }

  try {
    let { parsed, usage } = await attempt(false)
    if (!parsed.success) {
      // إعادة محاولة واحدة آمنة قبل إظهار خطأ للمستخدم.
      const retry = await attempt(true)
      parsed = retry.parsed
      usage = retry.usage
    }

    if (!parsed.success) {
      log.error('ai.schema_invalid', { task: taskName, retried: true })
      return await failTracked(
        'schema_invalid',
        502,
        'invalid_response',
        'تعذّر فهم نتيجة المعالجة. حاول مرة أخرى.',
      )
    }

    const durationMs = Date.now() - startedAt
    await finishAiRequest(rpcCtx, quota.requestId, {
      status: 'success',
      durationMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
    })
    log.info('ai.completed', { task: taskName, durationMs, totalTokens: usage.totalTokens })

    return ok(parsed.data)
  } catch (err) {
    if (err instanceof TimeoutError) {
      log.error('ai.timeout', { task: taskName, timeoutMs: err.timeoutMs })
      return await failTracked('timeout', 504, 'timeout', 'استغرقت العملية وقتًا أطول من المتوقع. حاول مرة أخرى.')
    }

    if (err instanceof UpstreamError) {
      // رمز مُصنَّف فقط — لا جسم استجابة المزوّد، فقد يحتوي صدى الـprompt.
      const errorCode = classifyUpstreamStatus(err.status)
      log.error('ai.upstream_error', { task: taskName, status: err.status, errorCode })
      if (err.status === 429) {
        return await failTracked(errorCode, 429, 'rate_limited', 'الخدمة مزدحمة حاليًا. حاول مرة أخرى بعد قليل.', {
          'Retry-After': '30',
        })
      }
      return await failTracked(errorCode, 502, 'server', 'تعذّر إتمام العملية حاليًا. حاول مرة أخرى بعد قليل.')
    }

    if (err instanceof SyntaxError) {
      log.error('ai.parse_error', { task: taskName })
      return await failTracked('parse_error', 502, 'invalid_response', 'تعذّر فهم نتيجة المعالجة. حاول مرة أخرى.')
    }

    // لا نُسجّل err.message: قد يحتوي محتوى مستخدم أو تفاصيل داخلية.
    log.error('ai.unexpected_error', { task: taskName, kind: (err as Error)?.name })
    return await failTracked('unexpected', 500, 'server', 'حدث خطأ غير متوقع. حاول مرة أخرى.')
  }
}
