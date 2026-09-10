/**
 * آلة حالة الجلسة الصوتية.
 *
 * الحالات: idle → listening → processing → (speaking) → idle
 * وأي حالة قد تنتقل إلى error، ومنها إلى idle عند المحاولة التالية.
 *
 * ⚠️ ثلاث قواعد مبنية هنا لا في الواجهة:
 *   ١) لا يتداخل النطق مع التسجيل — بدء الاستماع يُسكت المساعد فورًا.
 *   ٢) الأمر الحساس لا يذهب للوكيل أصلًا: يُردّ عليه ويُفتح مساره.
 *   ٣) كل رد صوتي له نصٌّ مقابل — الصوت إضافة لا بديل.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'
import { useI18n } from './useI18n'
import { askAgent, type AgentCitation, type AgentTurn } from '@/services/ai/agent'
import { AiError } from '@/services/ai'
import { getStt, getTts } from '@/services/voice/registry'
import { isRecordingSupported, startRecording, type RecorderHandle } from '@/services/voice/recorder'
import { detectIntent } from '@/services/voice/intents'
import { VoiceError } from '@/services/voice/types'

export type VoiceState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

export interface VoiceExchange {
  /** ما فُهم من كلام المستخدم — يُعرض دائمًا ليصحّحه إن أخطأ التحويل. */
  spoken: string
  reply: string
  citations: AgentCitation[]
  /** نيّة حساسة رُدَّ عليها ولم تُنفَّذ. */
  blockedIntent: string | null
}

/** تسجيل أقصر من هذا ضغطة عابرة لا كلام. */
const MIN_DURATION_MS = 400

export function useVoiceSession(options: { muted?: boolean } = {}) {
  const { accessToken } = useAuth()
  const { lang } = useI18n()
  const navigate = useNavigate()

  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [exchanges, setExchanges] = useState<VoiceExchange[]>([])
  const [partial, setPartial] = useState<string | null>(null)

  const recorderRef = useRef<RecorderHandle | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // مغادرة الصفحة تُحرّر الميكروفون وتُسكت النطق — لا شيء يبقى يعمل خلفنا.
      recorderRef.current?.cancel()
      abortRef.current?.abort()
      getTts().stop()
    }
  }, [])

  const supported = isRecordingSupported()

  const stopSpeaking = useCallback(() => {
    getTts().stop()
    setState((current) => (current === 'speaking' ? 'idle' : current))
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (options.muted || !text.trim()) {
        setState('idle')
        return
      }
      setState('speaking')
      getTts().speak(text, {
        language: lang === 'en' ? 'en' : 'ar',
        onEnd: () => mountedRef.current && setState('idle'),
        onError: () => mountedRef.current && setState('idle'),
      })
    },
    [lang, options.muted],
  )

  const startListening = useCallback(async () => {
    if (state === 'listening' || state === 'processing') return

    // النطق يتوقف قبل فتح الميكروفون: وإلا سجّلنا صوت المساعد نفسه.
    getTts().stop()
    setError(null)
    setPartial(null)

    try {
      recorderRef.current = await startRecording()
      setState('listening')
    } catch (err) {
      setError(err instanceof VoiceError ? err.message : 'تعذّر بدء التسجيل.')
      setState('error')
    }
  }, [state])

  const cancelListening = useCallback(() => {
    recorderRef.current?.cancel()
    recorderRef.current = null
    abortRef.current?.abort()
    setState('idle')
    setPartial(null)
  }, [])

  const stopListening = useCallback(async () => {
    const recorder = recorderRef.current
    if (!recorder || state !== 'listening') return
    recorderRef.current = null
    setState('processing')

    let spoken = ''
    try {
      const recording = await recorder.stop()
      if (recording.durationMs < MIN_DURATION_MS) throw new VoiceError('too_short')

      const controller = new AbortController()
      abortRef.current = controller

      const result = await getStt().transcribe(recording.blob, {
        language: lang === 'en' ? 'en' : 'ar',
        accessToken,
        signal: controller.signal,
      })
      spoken = result.text
      if (!mountedRef.current) return
      setPartial(spoken)
    } catch (err) {
      if (!mountedRef.current) return
      const message = err instanceof VoiceError ? err.message : 'تعذّر تحويل الصوت إلى نص.'
      setError(message)
      setState('error')
      return
    }

    /* ------------ الأمر الحساس لا يصل الوكيل أصلًا ------------ */
    const intent = detectIntent(spoken)
    if (intent.kind === 'sensitive') {
      const reply = intent.spokenResponse ?? ''
      setExchanges((prev) => [
        ...prev,
        { spoken, reply, citations: [], blockedIntent: String(intent.intent) },
      ])
      setPartial(null)
      speak(reply)
      // فتح الشاشة تنقّلٌ لا فعل: القرار يبقى للمستخدم على الشاشة.
      if (intent.path) navigate(intent.path)
      return
    }

    /* ------------------------ نيّة تنقّل ------------------------ */
    if (intent.kind === 'navigation' && intent.path) {
      const reply = intent.spokenResponse ?? ''
      setExchanges((prev) => [...prev, { spoken, reply, citations: [], blockedIntent: null }])
      setPartial(null)
      speak(reply)

      // ⚠️ التنقّل يحمل ما قاله المستخدم معه. بدونه يضيع الطلب كاملًا:
      // «جهّز لي كتاب لوزارة المالية نطلب البيانات قبل الخميس» تفتح شاشة
      // فارغة، فيضطر المستخدم لإعادة كتابة ما نطقه للتو.
      const seed =
        intent.intent === 'write'
          ? { idea: spoken }
          : intent.intent === 'reply'
            ? { incomingText: spoken }
            : undefined
      navigate(intent.path, seed ? { state: seed } : undefined)
      return
    }

    /* --------------------- سؤال عادي → الوكيل --------------------- */
    try {
      const history: AgentTurn[] = [
        ...exchanges.flatMap((exchange): AgentTurn[] => [
          { role: 'user', content: exchange.spoken },
          { role: 'assistant', content: exchange.reply },
        ]),
        { role: 'user', content: spoken },
      ]

      const controller = new AbortController()
      abortRef.current = controller
      const answer = await askAgent(history.slice(-10), {
        accessToken,
        context: 'محادثة صوتية',
        signal: controller.signal,
      })

      if (!mountedRef.current) return
      setExchanges((prev) => [
        ...prev,
        { spoken, reply: answer.reply, citations: answer.citations, blockedIntent: null },
      ])
      setPartial(null)
      speak(answer.reply)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof AiError ? err.message : 'تعذّر إتمام العملية حاليًا.')
      setState('error')
      setPartial(null)
    }
  }, [state, lang, accessToken, exchanges, speak, navigate])

  const reset = useCallback(() => {
    cancelListening()
    getTts().stop()
    setExchanges([])
    setError(null)
    setState('idle')
  }, [cancelListening])

  return {
    state,
    error,
    exchanges,
    /** ما فُهم قبل وصول الرد — يُعرض ليعرف المستخدم أن التحويل نجح. */
    partial,
    supported,
    /** هل يعالج مزوّد التحويل الصوت على الجهاز؟ يُعرض للمستخدم. */
    sttOnDevice: getStt().onDevice,
    ttsOnDevice: getTts().onDevice,
    startListening,
    stopListening,
    cancelListening,
    stopSpeaking,
    reset,
  }
}
