import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractJson, runPrompt, TimeoutError, UpstreamError } from './openai'

const spec = { system: 'نظام', user: 'مستخدم', temperature: 0.3, json: true }

afterEach(() => vi.restoreAllMocks())

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const fn = vi.fn(impl as never)
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('السقف الزمني', () => {
  it('يرمي TimeoutError عند تجاوز المهلة، ولا يعلّق الدالة', async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          // طلب لا يستجيب أبدًا — يُنهيه AbortController وحده.
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )

    await expect(runPrompt(spec, 'sk-test', 'gpt-4o', { timeoutMs: 30 })).rejects.toBeInstanceOf(TimeoutError)
  })

  it('يمرّر إشارة الإلغاء الخارجية ويميّزها عن انتهاء المهلة', async () => {
    const external = new AbortController()
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )

    const promise = runPrompt(spec, 'sk-test', 'gpt-4o', { timeoutMs: 10_000, signal: external.signal })
    external.abort()
    // إلغاء المستخدم ليس انتهاء مهلة.
    await expect(promise).rejects.not.toBeInstanceOf(TimeoutError)
  })

  it('ينظّف المؤقّت بعد نجاح الطلب', async () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    mockFetch(() => jsonResponse({ choices: [{ message: { content: '{"ok":true}' } }] }))
    await runPrompt(spec, 'sk-test', 'gpt-4o', { timeoutMs: 5_000 })
    expect(clearSpy).toHaveBeenCalled()
  })
})

describe('عدم تسريب رد المزوّد', () => {
  it('لا تحمل رسالة الخطأ أي جزء من جسم استجابة المزوّد', async () => {
    // جسم خطأ حقيقي من OpenAI قد يردّ صدى الـprompt.
    const leaked = 'السيد مدير الإدارة المالية المحترم، نفيدكم بأن الطلب رقم ٤٤١'
    mockFetch(() => jsonResponse({ error: { message: leaked } }, 400))

    await expect(runPrompt(spec, 'sk-test', 'gpt-4o')).rejects.toSatisfy((err: unknown) => {
      const e = err as UpstreamError
      expect(e).toBeInstanceOf(UpstreamError)
      expect(e.message).not.toContain(leaked)
      expect(e.message).not.toContain('المالية')
      expect(e.status).toBe(400)
      return true
    })
  })

  it('لا يقرأ جسم الاستجابة الفاشلة إطلاقًا', async () => {
    const response = jsonResponse({ error: { message: 'محتوى' } }, 500)
    const textSpy = vi.spyOn(response, 'text')
    const jsonSpy = vi.spyOn(response, 'json')
    mockFetch(() => response)

    await expect(runPrompt(spec, 'sk-test', 'gpt-4o')).rejects.toBeInstanceOf(UpstreamError)
    expect(textSpy).not.toHaveBeenCalled()
    expect(jsonSpy).not.toHaveBeenCalled()
  })
})

describe('قراءة الاستخدام', () => {
  it('يستخرج عدد الرموز عند توفره', async () => {
    mockFetch(() =>
      jsonResponse({
        choices: [{ message: { content: '{"a":1}' } }],
        usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
      }),
    )
    const result = await runPrompt(spec, 'sk-test', 'gpt-4o')
    expect(result.usage).toEqual({ promptTokens: 120, completionTokens: 45, totalTokens: 165 })
    expect(result.content).toBe('{"a":1}')
  })

  it('يتحمّل غياب حقل usage', async () => {
    mockFetch(() => jsonResponse({ choices: [{ message: { content: '{}' } }] }))
    const result = await runPrompt(spec, 'sk-test', 'gpt-4o')
    expect(result.usage).toEqual({ promptTokens: null, completionTokens: null, totalTokens: null })
  })

  it('يرفض إكمالًا فارغًا', async () => {
    mockFetch(() => jsonResponse({ choices: [] }))
    await expect(runPrompt(spec, 'sk-test', 'gpt-4o')).rejects.toBeInstanceOf(UpstreamError)
  })
})

describe('استخراج JSON', () => {
  it('يقرأ JSON مُحاطًا بعلامات شيفرة', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('يقرأ JSON محاطًا بنص زائد', () => {
    expect(extractJson('تفضل: {"a":2} انتهى')).toEqual({ a: 2 })
  })

  it('يرمي SyntaxError عند غياب JSON', () => {
    expect(() => extractJson('لا يوجد كائن هنا')).toThrow(SyntaxError)
  })
})
