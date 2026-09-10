/**
 * التحويل الصوتي عبر خادم قلم.
 *
 * ⚠️ لماذا هو الافتراضي رغم أن واجهة المتصفح مجانية؟
 * واجهة المتصفح ترسل الصوت إلى خوادم مزوّد المتصفح — طرفٌ ثالث جديد لا نتحكم
 * به. OpenAI يرى نصوص المراسلات أصلًا، فإرسال الصوت إليه لا يفتح حدَّ ثقة
 * جديدًا. المفاضلة ليست بين «مجاني ومدفوع» بل بين حدَّي ثقة وحدٍّ واحد.
 */
import { VoiceError, type SttOptions, type SttProvider, type SttResult } from './types'

const FUNCTIONS_BASE =
  (import.meta.env.VITE_FUNCTIONS_BASE as string | undefined)?.replace(/\/$/, '') || '/.netlify/functions'

const ENDPOINT = `${FUNCTIONS_BASE}/voice`

/** أقل من هذا الحجم يعني ضغطة عابرة لا كلامًا. */
const MIN_AUDIO_BYTES = 1200

async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  // التحويل على دفعات: String.fromCharCode(...) على مصفوفة كبيرة يفيض المكدس.
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export const whisperStt: SttProvider = {
  id: 'whisper',
  label: 'خادم قلم',
  onDevice: false,

  isSupported() {
    return typeof MediaRecorder !== 'undefined' && typeof navigator?.mediaDevices?.getUserMedia === 'function'
  },

  async transcribe(audio: Blob, options: SttOptions): Promise<SttResult> {
    if (audio.size < MIN_AUDIO_BYTES) throw new VoiceError('too_short')

    let response: Response
    try {
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
        },
        body: JSON.stringify({
          audio: await toBase64(audio),
          mimeType: audio.type || 'audio/webm',
          language: options.language,
        }),
        signal: options.signal,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw new VoiceError('aborted')
      throw new VoiceError('network')
    }

    if (!response.ok) {
      if (response.status === 504) throw new VoiceError('timeout')
      throw new VoiceError('server')
    }

    const json = (await response.json()) as { data?: { text?: string } }
    const text = (json.data?.text ?? '').trim()
    if (!text) throw new VoiceError('silence')

    return { text, onDevice: false }
  },
}
