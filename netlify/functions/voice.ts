/**
 * قلم | QALAM — تحويل الصوت إلى نص.
 *
 *   الميكروفون → المتصفح → هذه الدالة → Whisper → نص → المتصفح
 *
 * ⚠️ خصوصية — قرار معماري صريح:
 *   لا يُخزَّن الصوت الخام في أي موضع: لا في Storage، ولا في القاعدة، ولا في
 *   ملف مؤقت. يصل، يُحوَّل، ويُهمَل. المتغيّر الوحيد الذي حمله يخرج من النطاق
 *   بانتهاء الاستدعاء.
 *
 * ⚠️ لماذا Whisper لا Web Speech API؟
 *   واجهة المتصفح ترسل الصوت إلى خوادم مزوّد المتصفح — طرفٌ ثالث جديد لا
 *   نتحكم به ولم يوافق عليه المستخدم. OpenAI يرى نصوص المراسلات أصلًا، فإرسال
 *   الصوت إليه لا يضيف حدَّ ثقة جديدًا. واجهة المتصفح تبقى احتياطًا مُعلنًا.
 */
import type { Handler, HandlerEvent } from '@netlify/functions'
import { ConfigError, readEnv } from './_shared/env'
import { verifySupabaseUser } from './_shared/auth'
import { checkLocalBurst } from './_shared/rateLimit'
import { classifyUpstreamStatus, log } from './_shared/log'

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

/** ~٦٠ ثانية من opus. أطول من ذلك ليس أمرًا صوتيًا بل إملاءً يحتاج مسارًا آخر. */
const MAX_AUDIO_BYTES = 4 * 1024 * 1024

const ALLOWED_MIME = new Set([
  'audio/webm',
  'audio/webm;codecs=opus',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
])

function fail(status: number, code: string, message: string, extra: Record<string, string> = {}) {
  return {
    statusCode: status,
    headers: { ...JSON_HEADERS, ...extra },
    body: JSON.stringify({ error: { code, message } }),
  }
}

/** يختار امتدادًا يفهمه المزوّد من نوع MIME. */
function extensionFor(mime: string): string {
  if (mime.startsWith('audio/webm')) return 'webm'
  if (mime.startsWith('audio/ogg')) return 'ogg'
  if (mime.startsWith('audio/mp4')) return 'mp4'
  if (mime.startsWith('audio/mpeg')) return 'mp3'
  return 'wav'
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

  if (!checkLocalBurst(user.id)) {
    return fail(429, 'rate_limited', 'تم تجاوز عدد الطلبات المسموح بها. انتظر قليلًا ثم حاول مجددًا.', {
      'Retry-After': '10',
    })
  }

  let payload: { audio?: string; mimeType?: string; language?: string }
  try {
    payload = JSON.parse(event.body ?? '{}') as typeof payload
  } catch {
    return fail(400, 'bad_request', 'صيغة الطلب غير صحيحة.')
  }

  const mimeType = (payload.mimeType ?? 'audio/webm').split(';')[0].trim()
  if (!ALLOWED_MIME.has(mimeType) && !ALLOWED_MIME.has(payload.mimeType ?? '')) {
    log.warn('voice.invalid_format')
    return fail(400, 'bad_request', 'صيغة الصوت غير مدعومة.')
  }
  if (!payload.audio) {
    return fail(400, 'bad_request', 'لم يصل تسجيل صوتي.')
  }

  // ArrayBuffer صريح: نوع Buffer في Node قد يكون فوق SharedArrayBuffer،
  // وBlob لا يقبله. النسخ هنا رخيص ويجعل النوع محسومًا.
  let audio: ArrayBuffer
  try {
    const decoded = Buffer.from(payload.audio, 'base64')
    audio = decoded.buffer.slice(decoded.byteOffset, decoded.byteOffset + decoded.byteLength) as ArrayBuffer
  } catch {
    return fail(400, 'bad_request', 'تعذّر قراءة التسجيل.')
  }

  if (audio.byteLength === 0) {
    return fail(400, 'bad_request', 'التسجيل فارغ.')
  }
  if (audio.byteLength > MAX_AUDIO_BYTES) {
    log.warn('voice.too_large', { bytes: audio.byteLength })
    return fail(413, 'bad_request', 'التسجيل أطول من المسموح. سجّل مقطعًا أقصر.')
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(env.aiTimeoutMs, 45_000))

  try {
    const form = new FormData()
    form.append('file', new Blob([audio], { type: mimeType }), `speech.${extensionFor(mimeType)}`)
    form.append('model', env.whisperModel)
    // العربية مضبوطة صراحةً: الاكتشاف التلقائي يخلط العربية بالفارسية والأردية.
    form.append('language', payload.language === 'en' ? 'en' : 'ar')
    form.append('response_format', 'json')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.openaiApiKey}` },
      body: form,
      signal: controller.signal,
    })

    if (!res.ok) {
      // جسم الخطأ لا يُقرأ: قد يحمل صدى ما نُطق.
      const code = classifyUpstreamStatus(res.status)
      log.error('voice.upstream_error', { status: res.status, errorCode: code })
      if (res.status === 429) {
        return fail(429, 'rate_limited', 'الخدمة مزدحمة حاليًا. حاول بعد قليل.', { 'Retry-After': '30' })
      }
      return fail(502, 'server', 'تعذّر تحويل الصوت إلى نص. حاول مرة أخرى.')
    }

    const data = (await res.json()) as { text?: string }
    const text = (data.text ?? '').trim()

    // المدة وحجم الصوت فقط — لا النص المنطوق ولا أي جزء منه.
    log.info('voice.transcribed', {
      durationMs: Date.now() - startedAt,
      bytes: audio.byteLength,
      empty: text.length === 0,
    })

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ data: { text } }),
    }
  } catch {
    if (controller.signal.aborted) {
      log.error('voice.timeout')
      return fail(504, 'timeout', 'استغرق التحويل وقتًا أطول من المتوقع. حاول مرة أخرى.')
    }
    log.error('voice.upstream_error', { status: 0, errorCode: 'network' })
    return fail(502, 'server', 'تعذّر تحويل الصوت إلى نص. حاول مرة أخرى.')
  } finally {
    clearTimeout(timer)
    // الصوت لا يعيش أبعد من هذا الاستدعاء.
  }
}
