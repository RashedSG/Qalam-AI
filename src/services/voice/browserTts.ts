/**
 * النطق عبر المتصفح.
 *
 * ⚠️ هذا هو الافتراضي عن قصد: تركيب الصوت يتم على الجهاز، فلا يغادر نص الرد
 * المتصفح إطلاقًا. مزوّد سحابي أفضل صوتًا، لكنه يعني إرسال نص المراسلة مرة
 * أخرى إلى الشبكة لأجل الجمال — مقايضة لا تستحق في نظام مراسلات.
 */
import type { SpeakOptions, TtsProvider } from './types'

/** يختار صوتًا يطابق اللغة، ويُفضّل العربية الفصحى ثم أي صوت عربي. */
function pickVoice(language: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? []
  if (voices.length === 0) return null
  const prefix = language === 'ar' ? 'ar' : 'en'
  return (
    voices.find((voice) => voice.lang?.toLowerCase().startsWith(`${prefix}-sa`)) ??
    voices.find((voice) => voice.lang?.toLowerCase().startsWith(prefix)) ??
    null
  )
}

export const browserTts: TtsProvider = {
  id: 'browser',
  label: 'المتصفح (على الجهاز)',
  onDevice: true,

  isSupported() {
    return typeof window !== 'undefined' && typeof window.speechSynthesis !== 'undefined'
  },

  speak(text: string, options: SpeakOptions) {
    if (!this.isSupported() || !text.trim()) {
      options.onEnd?.()
      return
    }

    // إيقاف أي نطق سابق: تداخل صوتين يجعل كليهما غير مفهوم.
    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = options.language === 'ar' ? 'ar-SA' : 'en-US'
    utterance.rate = options.rate ?? 1
    const voice = pickVoice(options.language)
    if (voice) utterance.voice = voice

    utterance.onend = () => options.onEnd?.()
    utterance.onerror = () => options.onError?.()

    window.speechSynthesis.speak(utterance)
  },

  stop() {
    if (this.isSupported()) window.speechSynthesis.cancel()
  },

  isSpeaking() {
    return this.isSupported() && window.speechSynthesis.speaking
  },
}
