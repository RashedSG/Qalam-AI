import { afterEach, describe, expect, it, vi } from 'vitest'
import { openaiProvider } from './openaiProvider'
import { AiError } from './types'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('openaiProvider', () => {
  it('يستدعي دالة Netlify الآمنة ولا يتصل بـ OpenAI مباشرة', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { ok: true } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await openaiProvider.run('analyzeRequest', { idea: 'فكرة' }, { accessToken: 'token-123' })

    expect(result).toEqual({ ok: true })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/.netlify/functions/ai')
    expect(url).not.toContain('openai.com')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123')
    // لا يوجد أي مفتاح OpenAI في الطلب
    expect(JSON.stringify(init)).not.toMatch(/sk-/)
  })

  it('يحوّل 401 إلى خطأ "انتهت الجلسة"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'unauthenticated' } }), { status: 401 })),
    )
    await expect(openaiProvider.run('analyzeRequest', {})).rejects.toMatchObject({ code: 'unauthenticated' })
  })

  it('يحوّل 429 إلى خطأ تجاوز الحد', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })))
    await expect(openaiProvider.run('improveText', {})).rejects.toMatchObject({ code: 'rate_limited' })
  })

  it('يحوّل فشل الشبكة إلى خطأ شبكة برسالة عربية', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('failed to fetch') }))
    await expect(openaiProvider.run('improveText', {})).rejects.toBeInstanceOf(AiError)
    await expect(openaiProvider.run('improveText', {})).rejects.toMatchObject({ code: 'network' })
  })
})
