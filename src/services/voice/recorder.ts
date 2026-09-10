/**
 * تسجيل صوتي من الميكروفون.
 *
 * ⚠️ خصوصية: التسجيل يعيش في الذاكرة فقط. لا يُكتب في IndexedDB ولا
 * localStorage ولا يُرفع إلى Storage. ينتهي بانتهاء الاستدعاء الذي أنتجه.
 *
 * ⚠️ الصلاحية تُطلب هنا — عند بدء التسجيل — لا عند تحميل الصفحة. طلبها مبكرًا
 * يُخيف المستخدم ويُعلّم المتصفح رفضًا دائمًا يصعب التراجع عنه.
 */
import { VoiceError } from './types'

/** أنواع نُفضّلها بالترتيب: opus أصغر حجمًا وأوضح لكلام. */
const PREFERRED_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
]

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  for (const type of PREFERRED_TYPES) {
    if (MediaRecorder.isTypeSupported?.(type)) return type
  }
  return ''
}

export interface Recording {
  blob: Blob
  durationMs: number
}

export interface RecorderHandle {
  /** ينهي التسجيل ويعيد ما سُجِّل. */
  stop: () => Promise<Recording>
  /** يُلغي بلا إنتاج نتيجة — يُحرّر الميكروفون فورًا. */
  cancel: () => void
}

export function isRecordingSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'
  )
}

/** يبدأ التسجيل بعد طلب الصلاحية. يرمي VoiceError مُصنَّفًا عند الرفض. */
export async function startRecording(): Promise<RecorderHandle> {
  if (!isRecordingSupported()) throw new VoiceError('not_supported')

  let stream: MediaStream
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  } catch (err) {
    const name = (err as { name?: string })?.name
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new VoiceError('permission_denied')
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') throw new VoiceError('no_microphone')
    throw new VoiceError('unknown')
  }

  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  const chunks: Blob[] = []
  const startedAt = Date.now()

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  recorder.start()

  /** تحرير الميكروفون فورًا: مؤشر التسجيل في المتصفح يجب أن ينطفئ متى توقفنا. */
  const release = () => {
    for (const track of stream.getTracks()) track.stop()
  }

  return {
    stop: () =>
      new Promise<Recording>((resolve) => {
        recorder.onstop = () => {
          release()
          resolve({
            blob: new Blob(chunks, { type: mimeType || 'audio/webm' }),
            durationMs: Date.now() - startedAt,
          })
        }
        if (recorder.state === 'inactive') {
          release()
          resolve({ blob: new Blob(chunks, { type: mimeType || 'audio/webm' }), durationMs: 0 })
          return
        }
        recorder.stop()
      }),

    cancel: () => {
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } finally {
        release()
        chunks.length = 0
      }
    },
  }
}
