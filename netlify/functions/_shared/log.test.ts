import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyUpstreamStatus, log, sanitizeValue } from './log'

afterEach(() => vi.restoreAllMocks())

/** يلتقط السطر المكتوب ويعيده مُحلَّلًا. */
function capture(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const info = vi.spyOn(console, 'log').mockImplementation(() => {})
  fn()
  const call = spy.mock.calls[0] ?? warn.mock.calls[0] ?? info.mock.calls[0]
  return JSON.parse(String(call?.[0] ?? '{}')) as Record<string, unknown>
}

describe('تعقيم القيم', () => {
  it('يحجب مفتاح OpenAI', () => {
    expect(sanitizeValue('sk-proj-AbCdEf1234567890')).toBe('[redacted]')
  })

  it('يحجب رمز JWT ورأس Bearer', () => {
    expect(sanitizeValue('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0')).toBe('[redacted]')
    expect(sanitizeValue('Bearer abc.def.ghi')).toBe('[redacted]')
  })

  it('يحجب البريد الإلكتروني', () => {
    expect(sanitizeValue('user@example.com')).toBe('[redacted]')
  })

  it('يُسقط أي نص متعدد الأسطر — النص المتعدد يعني محتوى لا رمزًا', () => {
    expect(sanitizeValue('السيد المحترم\nنفيدكم بأن...')).toBe('[omitted]')
  })

  it('يُسقط أي نص أطول من حدّ الرمز القصير', () => {
    expect(sanitizeValue('ن'.repeat(200))).toBe('[omitted]')
  })

  it('يُبقي الأعداد والمنطقيات والرموز القصيرة كما هي', () => {
    expect(sanitizeValue(1234)).toBe(1234)
    expect(sanitizeValue(true)).toBe(true)
    expect(sanitizeValue('analyzeRequest')).toBe('analyzeRequest')
    expect(sanitizeValue(undefined)).toBeNull()
    expect(sanitizeValue(Number.NaN)).toBeNull()
  })
})

describe('سطر السجل', () => {
  it('يكتب JSON صالحًا يحمل الحدث فقط بلا نص حر', () => {
    const line = capture(() => log.error('ai.upstream_error', { task: 'improveText', status: 500 }))
    expect(line).toMatchObject({ svc: 'qalam', lvl: 'error', event: 'ai.upstream_error', task: 'improveText', status: 500 })
  })

  it('يُعقّم الحقول قبل الكتابة', () => {
    const line = capture(() => log.error('ai.unexpected_error', { token: 'sk-live-ABCDEFGH12345678' }))
    expect(JSON.stringify(line)).not.toContain('sk-live')
  })

  it('يتجاهل أسماء حقول غير مطابقة للنمط', () => {
    const line = capture(() => log.warn('ai.rate_limited', { 'user body': 'نص المراسلة' }))
    expect(Object.keys(line)).toEqual(['svc', 'lvl', 'event'])
  })

  it('يحدّ عدد الحقول فلا ينتفخ السطر', () => {
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, i]))
    const line = capture(() => log.info('ai.completed', many))
    expect(Object.keys(line).length).toBeLessThanOrEqual(15)
  })
})

describe('تصنيف أخطاء المزوّد', () => {
  it('يحوّل الحالة إلى رمز قصير بلا أي نص من المزوّد', () => {
    expect(classifyUpstreamStatus(401)).toBe('upstream_auth')
    expect(classifyUpstreamStatus(429)).toBe('upstream_rate_limited')
    expect(classifyUpstreamStatus(503)).toBe('upstream_unavailable')
    expect(classifyUpstreamStatus(400)).toBe('upstream_rejected')
  })
})
