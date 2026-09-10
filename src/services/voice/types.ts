/**
 * عقد طبقة الصوت.
 *
 * التجريد ليس ترفًا: مزوّدو التحويل الصوتي يتغيّرون، وجودتهم للعربية تتفاوت،
 * وبعض المؤسسات تشترط ألا يغادر الصوت نطاقها. تبديل المزوّد يجب أن يكون ملفًا
 * جديدًا لا إعادة كتابة للواجهة.
 */

export type VoiceLanguage = 'ar' | 'en'

export interface SttResult {
  text: string
  /** هل المزوّد يعالج الصوت على الجهاز أم يرسله لطرف خارجي؟ يُعرض للمستخدم. */
  onDevice: boolean
}

export interface SttOptions {
  language: VoiceLanguage
  accessToken?: string | null
  signal?: AbortSignal
}

/** مزوّد تحويل الصوت إلى نص. */
export interface SttProvider {
  readonly id: string
  readonly label: string
  /** هل يعمل في هذا المتصفح الآن؟ */
  isSupported(): boolean
  /** هل يعالج الصوت على الجهاز؟ يحدد ما يُعرض للمستخدم عن خصوصيته. */
  readonly onDevice: boolean
  transcribe(audio: Blob, options: SttOptions): Promise<SttResult>
}

export interface SpeakOptions {
  language: VoiceLanguage
  rate?: number
  onEnd?: () => void
  onError?: () => void
}

/** مزوّد تحويل النص إلى صوت. */
export interface TtsProvider {
  readonly id: string
  readonly label: string
  readonly onDevice: boolean
  isSupported(): boolean
  speak(text: string, options: SpeakOptions): void
  stop(): void
  isSpeaking(): boolean
}

export type VoiceErrorCode =
  | 'permission_denied'
  | 'no_microphone'
  | 'not_supported'
  | 'silence'
  | 'too_short'
  | 'network'
  | 'server'
  | 'timeout'
  | 'aborted'
  | 'unknown'

export class VoiceError extends Error {
  readonly code: VoiceErrorCode

  constructor(code: VoiceErrorCode, message?: string) {
    super(message ?? VOICE_ERROR_MESSAGES[code])
    this.name = 'VoiceError'
    this.code = code
  }
}

export const VOICE_ERROR_MESSAGES: Record<VoiceErrorCode, string> = {
  permission_denied: 'لم يُسمح باستخدام الميكروفون. فعّله من إعدادات المتصفح ثم حاول مجددًا.',
  no_microphone: 'لم يُعثر على ميكروفون متصل.',
  not_supported: 'متصفحك لا يدعم التسجيل الصوتي. استخدم الكتابة بدلًا منه.',
  silence: 'لم أسمع شيئًا. حاول التحدث بصوت أوضح.',
  too_short: 'التسجيل قصير جدًا. اضغط مطولًا وتحدّث.',
  network: 'تعذّر الاتصال بالخدمة. تحقق من اتصالك.',
  server: 'تعذّر تحويل الصوت إلى نص. حاول مرة أخرى.',
  timeout: 'استغرق التحويل وقتًا أطول من المتوقع.',
  aborted: 'أُلغي التسجيل.',
  unknown: 'حدث خطأ غير متوقع أثناء التسجيل.',
}
