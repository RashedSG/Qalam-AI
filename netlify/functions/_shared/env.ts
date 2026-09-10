/** قراءة متغيرات البيئة الخادمية مع تحقق مبكر وواضح. */

export interface ServerEnv {
  openaiApiKey: string
  openaiModel: string
  supabaseUrl: string
  supabaseAnonKey: string
  /** سقف زمني لكل استدعاء خارجي. قابل للضبط دون تعديل كود. */
  aiTimeoutMs: number
  /** نموذج تحويل الصوت إلى نص. */
  whisperModel: string
}

const DEFAULT_AI_TIMEOUT_MS = 45_000
const MIN_AI_TIMEOUT_MS = 5_000
const MAX_AI_TIMEOUT_MS = 120_000

/** يقرأ سقفًا زمنيًا صالحًا، ويعود للافتراضي عند أي قيمة غير منطقية. */
function readTimeoutMs(raw: string | undefined): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_AI_TIMEOUT_MS
  return Math.min(Math.max(Math.trunc(parsed), MIN_AI_TIMEOUT_MS), MAX_AI_TIMEOUT_MS)
}

export class ConfigError extends Error {}

export function readEnv(): ServerEnv {
  const openaiApiKey = process.env.OPENAI_API_KEY ?? ''
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

  const missing: string[] = []
  if (!openaiApiKey) missing.push('OPENAI_API_KEY')
  if (!supabaseUrl) missing.push('SUPABASE_URL')
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY')

  if (missing.length) {
    // لا نكشف القيم — فقط أسماء المتغيرات الناقصة، وفي سجل الخادم فقط.
    throw new ConfigError(`Missing server environment variables: ${missing.join(', ')}`)
  }

  return {
    openaiApiKey,
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    supabaseUrl: supabaseUrl.replace(/\/$/, ''),
    supabaseAnonKey,
    aiTimeoutMs: readTimeoutMs(process.env.AI_TIMEOUT_MS),
    whisperModel: process.env.WHISPER_MODEL || 'whisper-1',
  }
}
