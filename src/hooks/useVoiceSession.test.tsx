/**
 * بوابة المرحلة ٦ تنص على اختبار: رفض الميكروفون، السماح، الكلام العربي،
 * الصمت، فشل الشبكة، فشل الذكاء الاصطناعي، المقاطعة، الأوامر غير المصرّح بها،
 * والكلام الطويل. كلها هنا.
 */
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useVoiceSession } from './useVoiceSession'

/* ------------------------- تجهيز البيئة ------------------------- */

const navigateSpy = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateSpy }
})

vi.mock('./useAuth', () => ({ useAuth: () => ({ accessToken: 'jwt', user: { id: 'u1' } }) }))
vi.mock('./useI18n', () => ({ useI18n: () => ({ lang: 'ar', t: (k: string) => k }) }))

const askAgentMock = vi.fn()
vi.mock('@/services/ai/agent', () => ({ askAgent: (...args: unknown[]) => askAgentMock(...args) }))

const transcribeMock = vi.fn()
const speakMock = vi.fn()
const ttsStopMock = vi.fn()
vi.mock('@/services/voice/registry', () => ({
  getStt: () => ({ id: 'test', label: 'test', onDevice: false, isSupported: () => true, transcribe: transcribeMock }),
  getTts: () => ({
    id: 'test',
    label: 'test',
    onDevice: true,
    isSupported: () => true,
    speak: speakMock,
    stop: ttsStopMock,
    isSpeaking: () => false,
  }),
}))

const startRecordingMock = vi.fn()
const supportedMock = vi.fn(() => true)
vi.mock('@/services/voice/recorder', () => ({
  isRecordingSupported: () => supportedMock(),
  startRecording: (...args: unknown[]) => startRecordingMock(...args),
}))

const { VoiceError } = await vi.importActual<typeof import('@/services/voice/types')>('@/services/voice/types')

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>

/** مسجّل ناجح يعيد تسجيلًا بمدة محددة. */
function mockRecorder(durationMs = 2000) {
  const cancel = vi.fn()
  startRecordingMock.mockResolvedValue({
    stop: vi.fn().mockResolvedValue({ blob: new Blob(['x'], { type: 'audio/webm' }), durationMs }),
    cancel,
  })
  return { cancel }
}

async function listenAndStop(result: { current: ReturnType<typeof useVoiceSession> }) {
  await act(async () => {
    await result.current.startListening()
  })
  await act(async () => {
    await result.current.stopListening()
  })
}

beforeEach(() => {
  navigateSpy.mockReset()
  askAgentMock.mockReset()
  transcribeMock.mockReset()
  speakMock.mockReset()
  ttsStopMock.mockReset()
  startRecordingMock.mockReset()
  supportedMock.mockReturnValue(true)
  askAgentMock.mockResolvedValue({ reply: 'إجابة', citations: [], toolsUsed: [], stoppedBy: 'completed', injectionSignals: 0 })
})

afterEach(() => vi.clearAllMocks())

/* ========================== صلاحية الميكروفون ========================== */

describe('صلاحية الميكروفون', () => {
  it('الرفض يُعرض كخطأ مفهوم لا كانهيار', async () => {
    startRecordingMock.mockRejectedValue(new VoiceError('permission_denied'))
    const { result } = renderHook(() => useVoiceSession(), { wrapper })

    await act(async () => {
      await result.current.startListening()
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toMatch(/الميكروفون/)
  })

  it('غياب الميكروفون يُميَّز عن رفض الصلاحية', async () => {
    startRecordingMock.mockRejectedValue(new VoiceError('no_microphone'))
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await act(async () => {
      await result.current.startListening()
    })
    expect(result.current.error).toMatch(/لم يُعثر على ميكروفون/)
  })

  it('متصفح لا يدعم التسجيل يُعلن ذلك قبل المحاولة', () => {
    supportedMock.mockReturnValue(false)
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    expect(result.current.supported).toBe(false)
  })

  it('السماح ينقل الحالة إلى الاستماع', async () => {
    mockRecorder()
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await act(async () => {
      await result.current.startListening()
    })
    expect(result.current.state).toBe('listening')
  })
})

/* ============================ الكلام العربي ============================ */

describe('الكلام العربي', () => {
  it('سؤال عادي يذهب للوكيل ويُنطق رده', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'لخّص لي آخر كتاب وارد', onDevice: false })
    askAgentMock.mockResolvedValue({
      reply: 'الكتاب يطلب بيانات قبل الخميس.',
      citations: [{ correspondenceId: 'c1', subject: 'طلب بيانات', reference: 'R/1' }],
      toolsUsed: ['search_correspondence'],
      stoppedBy: 'completed',
      injectionSignals: 0,
    })

    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    await waitFor(() => expect(result.current.exchanges).toHaveLength(1))
    expect(result.current.exchanges[0].spoken).toBe('لخّص لي آخر كتاب وارد')
    expect(result.current.exchanges[0].reply).toMatch(/الخميس/)
    expect(result.current.exchanges[0].citations).toHaveLength(1)
    expect(speakMock).toHaveBeenCalled()
  })

  it('كل رد صوتي له نصٌّ مقابل — الصوت إضافة لا بديل', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'ما المطلوب في هذا الكتاب', onDevice: false })
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    await waitFor(() => expect(result.current.exchanges).toHaveLength(1))
    // ما يُنطق هو نفسه ما يُعرض — لا رد صوتي بلا نص.
    expect(speakMock.mock.calls[0][0]).toBe(result.current.exchanges[0].reply)
  })

  it('كتم الصوت يمنع النطق ويبقي النص', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'سؤال', onDevice: false })
    const { result } = renderHook(() => useVoiceSession({ muted: true }), { wrapper })
    await listenAndStop(result)

    await waitFor(() => expect(result.current.exchanges).toHaveLength(1))
    expect(speakMock).not.toHaveBeenCalled()
    expect(result.current.exchanges[0].reply).toBeTruthy()
  })
})

/* ======================= الأوامر الحساسة ======================= */

describe('الأوامر الحساسة لا تُنفَّذ بالصوت', () => {
  it('«اعتمد الكتاب» لا تصل الوكيل أصلًا', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'اعتمد الكتاب', onDevice: false })
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    await waitFor(() => expect(result.current.exchanges).toHaveLength(1))
    expect(askAgentMock, 'الأمر الحساس لا يُمرَّر للوكيل').not.toHaveBeenCalled()
    expect(result.current.exchanges[0].blockedIntent).toBe('approve')
    expect(result.current.exchanges[0].reply).toMatch(/لا أتخذه نيابةً عنك/)
    // يفتح الشاشة ولا ينفّذ.
    expect(navigateSpy).toHaveBeenCalledWith('/my-work')
  })

  it('«احذف» لا تفتح شاشة تنفيذ ولا تستدعي شيئًا', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'احذف هذي المراسلة', onDevice: false })
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    await waitFor(() => expect(result.current.exchanges).toHaveLength(1))
    expect(askAgentMock).not.toHaveBeenCalled()
    expect(navigateSpy, 'الحذف لا يُفتح بالصوت').not.toHaveBeenCalled()
  })

  it('نيّة التنقّل تفتح الشاشة وتحمل معها ما قاله المستخدم', async () => {
    mockRecorder()
    const spoken = 'اكتب لي كتاب لوزارة المالية نطلب البيانات قبل الخميس'
    transcribeMock.mockResolvedValue({ text: spoken, onDevice: false })
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    // بدون تمرير النص تُفتح شاشة فارغة ويضيع ما نطقه المستخدم للتو.
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith('/write', { state: { idea: spoken } }))
    expect(askAgentMock).not.toHaveBeenCalled()
  })

  it('نيّة الرد تمرّر النص المنطوق كنص وارد', async () => {
    mockRecorder()
    const spoken = 'جهّز لي رد على كتاب وزارة المالية'
    transcribeMock.mockResolvedValue({ text: spoken, onDevice: false })
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    await waitFor(() =>
      expect(navigateSpy).toHaveBeenCalledWith('/reply', { state: { incomingText: spoken } }),
    )
  })
})

/* ========================= الحالات الحدّية ========================= */

describe('الصمت والكلام القصير', () => {
  it('تسجيل قصير جدًا يُرفض قبل إنفاق طلب', async () => {
    mockRecorder(120)
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    expect(transcribeMock, 'لا نرسل ضغطة عابرة إلى الخادم').not.toHaveBeenCalled()
    expect(result.current.state).toBe('error')
    expect(result.current.error).toMatch(/قصير/)
  })

  it('الصمت يُعرض كرسالة مفهومة', async () => {
    mockRecorder()
    transcribeMock.mockRejectedValue(new VoiceError('silence'))
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    expect(result.current.state).toBe('error')
    expect(result.current.error).toMatch(/لم أسمع/)
    expect(askAgentMock).not.toHaveBeenCalled()
  })
})

describe('الأعطال', () => {
  it('فشل الشبكة أثناء التحويل', async () => {
    mockRecorder()
    transcribeMock.mockRejectedValue(new VoiceError('network'))
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)
    expect(result.current.error).toMatch(/الاتصال/)
    expect(result.current.state).toBe('error')
  })

  it('فشل الوكيل بعد نجاح التحويل — لا يضيع ما فُهم', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'سؤال طويل', onDevice: false })
    askAgentMock.mockRejectedValue(new Error('boom'))
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    await waitFor(() => expect(result.current.state).toBe('error'))
    expect(result.current.error).toBeTruthy()
  })

  it('انتهاء المهلة يُعرض كرسالة خاصة به', async () => {
    mockRecorder()
    transcribeMock.mockRejectedValue(new VoiceError('timeout'))
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)
    expect(result.current.error).toMatch(/وقتًا أطول/)
  })
})

describe('المقاطعة', () => {
  it('بدء الاستماع يُسكت المساعد قبل فتح الميكروفون', async () => {
    mockRecorder()
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await act(async () => {
      await result.current.startListening()
    })
    // وإلا سجّلنا صوت المساعد نفسه.
    expect(ttsStopMock).toHaveBeenCalled()
  })

  it('إيقاف النطق يدويًا يعيد الحالة إلى السكون', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'سؤال', onDevice: false })
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    await waitFor(() => expect(result.current.state).toBe('speaking'))
    act(() => result.current.stopSpeaking())
    expect(result.current.state).toBe('idle')
  })

  it('إلغاء التسجيل يُحرّر الميكروفون ولا يرسل شيئًا', async () => {
    const { cancel } = mockRecorder()
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await act(async () => {
      await result.current.startListening()
    })
    act(() => result.current.cancelListening())

    expect(cancel).toHaveBeenCalled()
    expect(result.current.state).toBe('idle')
    expect(transcribeMock).not.toHaveBeenCalled()
  })

  it('مغادرة الصفحة تُحرّر الميكروفون وتُسكت النطق', async () => {
    const { cancel } = mockRecorder()
    const { result, unmount } = renderHook(() => useVoiceSession(), { wrapper })
    await act(async () => {
      await result.current.startListening()
    })
    unmount()
    expect(cancel).toHaveBeenCalled()
    expect(ttsStopMock).toHaveBeenCalled()
  })
})

describe('الكلام الطويل', () => {
  it('نص طويل يُمرَّر كاملًا للوكيل', async () => {
    mockRecorder(50_000)
    const long = 'الجهة المعنية تطلب توضيحًا عن البند الثالث في الاتفاقية '.repeat(40)
    transcribeMock.mockResolvedValue({ text: long, onDevice: false })

    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)

    await waitFor(() => expect(askAgentMock).toHaveBeenCalled())
    const history = askAgentMock.mock.calls[0][0] as Array<{ content: string }>
    expect(history.at(-1)!.content).toBe(long)
  })

  it('المحادثة الطويلة تُقصّ فلا تنتفخ الميزانية', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'سؤال', onDevice: false })
    const { result } = renderHook(() => useVoiceSession(), { wrapper })

    for (let i = 0; i < 8; i += 1) {
      await listenAndStop(result)
      await waitFor(() => expect(result.current.exchanges).toHaveLength(i + 1))
    }

    const lastHistory = askAgentMock.mock.calls.at(-1)![0] as unknown[]
    expect(lastHistory.length).toBeLessThanOrEqual(10)
  })
})

describe('إعادة الضبط', () => {
  it('تمسح المحادثة وتُسكت كل شيء', async () => {
    mockRecorder()
    transcribeMock.mockResolvedValue({ text: 'سؤال', onDevice: false })
    const { result } = renderHook(() => useVoiceSession(), { wrapper })
    await listenAndStop(result)
    await waitFor(() => expect(result.current.exchanges).toHaveLength(1))

    act(() => result.current.reset())
    expect(result.current.exchanges).toEqual([])
    expect(result.current.state).toBe('idle')
    expect(result.current.error).toBeNull()
  })
})
