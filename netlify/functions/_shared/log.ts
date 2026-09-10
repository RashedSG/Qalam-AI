/**
 * تسجيل مُعقَّم لدوال الخادم.
 *
 * القاعدة: لا يدخل السجل أي نص يكتبه المستخدم أو يعيده المزوّد — إطلاقًا.
 * لا محتوى مراسلة، ولا prompt، ولا مراسلة واردة، ولا مرفق، ولا رمز جلسة،
 * ولا مفتاح API، ولا رسالة خطأ خام من مزوّد خارجي.
 *
 * لذلك لا تقبل هذه الوحدة نصًا حرًّا: فقط `event` من مجموعة مغلقة،
 * وحقول قيمها أعداد أو منطقيات أو معرّفات قصيرة مُصنَّفة.
 * التعقيم هنا خط دفاع أخير لا رخصة لتمرير محتوى.
 */

/** أحداث معروفة مسبقًا — لا نص حر في اسم الحدث. */
export type LogEvent =
  | 'ai.config_error'
  | 'ai.unauthenticated'
  | 'ai.rate_limited'
  | 'ai.invalid_input'
  | 'ai.unknown_task'
  | 'ai.unsupported_provider'
  | 'ai.schema_invalid'
  | 'ai.upstream_error'
  | 'ai.timeout'
  | 'ai.parse_error'
  | 'ai.unexpected_error'
  | 'ai.completed'
  | 'ai.quota_check_failed'
  | 'ai.usage_record_failed'

type Scalar = string | number | boolean | null | undefined

/** أطوال قصيرة مقصودة: تكفي لمعرّف أو رمز خطأ، ولا تكفي لجملة مراسلة. */
const MAX_VALUE_LENGTH = 64
const MAX_FIELDS = 12

/**
 * أنماط ما يجب ألا يظهر في سجل أبدًا.
 * الترتيب مهم: الأكثر تحديدًا أولًا.
 */
const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g, // مفاتيح OpenAI
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, // رموز JWT
  /Bearer\s+\S+/gi,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, // بريد إلكتروني
]

/** يحتفظ بالمعرّفات والرموز القصيرة، ويُسقط كل ما عداها. */
export function sanitizeValue(value: Scalar): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value

  let out = String(value)
  for (const pattern of SECRET_PATTERNS) out = out.replace(pattern, '[redacted]')

  // أسطر جديدة تعني نصًا، لا رمزًا — نُسقط النص.
  if (/[\r\n]/.test(out)) return '[omitted]'
  if (out.length > MAX_VALUE_LENGTH) return '[omitted]'
  return out
}

export type LogFields = Record<string, Scalar>

function emit(level: 'info' | 'warn' | 'error', event: LogEvent, fields: LogFields = {}): void {
  const safe: Record<string, string | number | boolean | null> = {}
  let count = 0
  for (const [key, value] of Object.entries(fields)) {
    if (count >= MAX_FIELDS) break
    if (!/^[a-z][a-zA-Z0-9_]{0,31}$/.test(key)) continue
    safe[key] = sanitizeValue(value)
    count += 1
  }

  const line = JSON.stringify({ svc: 'qalam', lvl: level, event, ...safe })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.log(line)
}

export const log = {
  info: (event: LogEvent, fields?: LogFields) => emit('info', event, fields),
  warn: (event: LogEvent, fields?: LogFields) => emit('warn', event, fields),
  error: (event: LogEvent, fields?: LogFields) => emit('error', event, fields),
}

/**
 * يصنّف خطأ مزوّد خارجي إلى رمز قصير.
 * نص الخطأ الخام لا يُسجَّل ولا يُعاد للمتصفح: قد يحتوي صدى الـprompt.
 */
export function classifyUpstreamStatus(status: number): string {
  if (status === 401 || status === 403) return 'upstream_auth'
  if (status === 404) return 'upstream_not_found'
  if (status === 408) return 'upstream_timeout'
  if (status === 429) return 'upstream_rate_limited'
  if (status >= 500) return 'upstream_unavailable'
  if (status >= 400) return 'upstream_rejected'
  return 'upstream_unknown'
}
