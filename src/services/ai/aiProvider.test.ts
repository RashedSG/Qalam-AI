import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getAiProvider, listAiProviders, registerAiProvider, setActiveAiProvider } from './aiProvider'
import type { AiProvider } from './types'

const runMock = vi.fn(async () => ({ from: 'claude' }))

const fakeClaude: AiProvider = {
  id: 'anthropic',
  label: 'Claude',
  run: <TResult,>() => runMock() as Promise<TResult>,
}

beforeEach(() => {
  setActiveAiProvider('openai')
})

describe('AI provider registry', () => {
  it('يستخدم OpenAI افتراضيًا', () => {
    expect(getAiProvider().id).toBe('openai')
  })

  it('يسمح بإضافة مزود جديد وتفعيله دون تعديل المكوّنات', async () => {
    registerAiProvider(fakeClaude)
    setActiveAiProvider('anthropic')

    expect(getAiProvider().id).toBe('anthropic')
    await expect(getAiProvider().run('improveText', {})).resolves.toEqual({ from: 'claude' })
    expect(listAiProviders().map((p) => p.id)).toContain('anthropic')

    setActiveAiProvider('openai')
  })

  it('يرفض تفعيل مزود غير مسجّل', () => {
    expect(() => setActiveAiProvider('gemini')).toThrow()
  })
})
