/**
 * حد المعدّل وتتبّع الاستخدام — كلاهما في قاعدة البيانات.
 *
 * لماذا لا في ذاكرة الدالة؟ دوال Netlify عديمة الحالة وتُنشأ منها نسخ متعددة
 * متوازية، فعدّاد الذاكرة لا يحمي شيئًا عمليًا. القاعدة هي الحالة المشتركة
 * الوحيدة الموجودة أصلًا — بلا خدمة جديدة ولا سرّ جديد.
 *
 * مبدأ أقل صلاحية: نستدعي الإجراءات برمز جلسة المستخدم نفسه ومفتاح anon،
 * لا بـ service_role. الدالة لا تستطيع رؤية ولا تعديل بيانات مستخدم آخر.
 */
import { classifyUpstreamStatus, log } from './log'

export interface QuotaDecision {
  allowed: boolean
  /** 'burst' | 'per_minute' | 'daily_quota' عند الرفض. */
  reason: string | null
  retryAfterSeconds: number
  /** معرّف الصف المحجوز — يُمرَّر لاحقًا إلى finishAiRequest. */
  requestId: string | null
  remainingToday: number | null
}

interface RpcContext {
  supabaseUrl: string
  supabaseAnonKey: string
  accessToken: string
}

async function callRpc(ctx: RpcContext, fn: string, args: Record<string, unknown>): Promise<unknown> {
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

/**
 * يحجز طلبًا إن سمح الحد.
 *
 * إن تعذّر الوصول إلى القاعدة نسمح بالطلب (fail-open) ونسجّل الحدث:
 * إسقاط كل طلبات المستخدمين لأن عدّاد الحد متعذّر يحوّل خللًا جزئيًا إلى
 * انقطاع كامل. المصادقة — وهي الحاجز الأمني الفعلي — تحققت قبل هذه النقطة،
 * وسقف OpenAI نفسه يبقى خط الحماية الأخير للتكلفة.
 */
export async function beginAiRequest(
  ctx: RpcContext,
  task: string,
  provider: string,
  model: string,
): Promise<QuotaDecision> {
  try {
    const rows = (await callRpc(ctx, 'begin_ai_request', {
      p_task: task,
      p_provider: provider,
      p_model: model,
    })) as Array<{
      allowed: boolean
      reason: string | null
      retry_after_seconds: number | null
      request_id: string | null
      remaining_today: number | null
    }>

    const row = Array.isArray(rows) ? rows[0] : undefined
    if (!row) throw new Error('begin_ai_request returned no row')

    return {
      allowed: Boolean(row.allowed),
      reason: row.reason ?? null,
      retryAfterSeconds: row.retry_after_seconds ?? 60,
      requestId: row.request_id ?? null,
      remainingToday: row.remaining_today ?? null,
    }
  } catch {
    log.warn('ai.quota_check_failed', { task })
    return { allowed: true, reason: null, retryAfterSeconds: 0, requestId: null, remainingToday: null }
  }
}

export interface FinishInput {
  status: 'success' | 'error'
  durationMs: number
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  errorCode?: string | null
}

/** يحسم الصف المحجوز. الفشل هنا لا يُفشل طلب المستخدم — التتبّع ليس حاجزًا. */
export async function finishAiRequest(
  ctx: RpcContext,
  requestId: string | null,
  input: FinishInput,
): Promise<void> {
  if (!requestId) return
  try {
    await callRpc(ctx, 'finish_ai_request', {
      p_id: requestId,
      p_status: input.status,
      p_duration_ms: input.durationMs,
      p_prompt_tokens: input.promptTokens ?? null,
      p_completion_tokens: input.completionTokens ?? null,
      p_total_tokens: input.totalTokens ?? null,
      p_error_code: input.errorCode ?? null,
    })
  } catch {
    log.warn('ai.usage_record_failed')
  }
}

export { classifyUpstreamStatus }
