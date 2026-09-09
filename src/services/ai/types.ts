/**
 * عقد طبقة الذكاء الاصطناعي.
 * الواجهة لا تعرف أبدًا أي مزود يُستخدم — تتعامل مع AiProvider فقط.
 */

export const AI_TASKS = [
  'analyzeRequest',
  'generateCorrespondence',
  'analyzeIncoming',
  'generateReply',
  'improveText',
  'translateCorporate',
  'reviewBeforeSend',
  'tutorExercise',
  'tutorEvaluate',
  'explainPhrase',
] as const

export type AiTask = (typeof AI_TASKS)[number]

export type AiProviderId = 'openai' | 'anthropic' | 'gemini'

export interface AiCallOptions {
  signal?: AbortSignal
  /** رمز جلسة Supabase — مطلوب للمصادقة على الدالة الآمنة. */
  accessToken?: string | null
}

/**
 * كل مزود ينفّذ هذه الواجهة. إضافة Claude أو Gemini لاحقًا = ملف جديد
 * يُسجَّل في aiProvider.ts، بدون أي تعديل على المكوّنات أو الصفحات.
 */
export interface AiProvider {
  readonly id: AiProviderId
  readonly label: string
  run<TResult>(task: AiTask, payload: unknown, options?: AiCallOptions): Promise<TResult>
}

export type AiErrorCode =
  | 'unauthenticated'
  | 'rate_limited'
  | 'invalid_response'
  | 'network'
  | 'server'
  | 'aborted'
  | 'unknown'

/** خطأ موحّد برسالة عربية جاهزة للعرض — لا يحمل أي تفاصيل تقنية حساسة. */
export class AiError extends Error {
  readonly code: AiErrorCode

  constructor(code: AiErrorCode, message?: string) {
    super(message ?? AI_ERROR_MESSAGES[code])
    this.name = 'AiError'
    this.code = code
  }
}

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  unauthenticated: 'انتهت جلستك. يرجى تسجيل الدخول مرة أخرى.',
  rate_limited: 'تم تجاوز عدد الطلبات المسموح بها. انتظر قليلًا ثم حاول مجددًا.',
  invalid_response: 'تعذّر فهم نتيجة المعالجة. حاول مرة أخرى.',
  network: 'تعذّر الاتصال بالخدمة. تحقق من اتصالك بالإنترنت.',
  server: 'تعذّر إتمام العملية حاليًا. حاول مرة أخرى بعد قليل.',
  aborted: 'تم إلغاء العملية.',
  unknown: 'حدث خطأ غير متوقع. حاول مرة أخرى.',
}
