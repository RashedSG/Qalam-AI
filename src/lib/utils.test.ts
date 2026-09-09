import { describe, expect, it } from 'vitest'
import { cn, countWords, deriveTitle, formatDate, scoreTone } from './utils'

describe('cn', () => {
  it('يدمج الأصناف ويحل التعارض لصالح الأخير', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4')
    const hidden = false as boolean
    expect(cn('text-sm', hidden && 'hidden', 'font-bold')).toBe('text-sm font-bold')
  })
})

describe('countWords', () => {
  it('يعد الكلمات العربية بشكل صحيح', () => {
    expect(countWords('بالإشارة إلى الموضوع أعلاه')).toBe(4)
  })
  it('يتجاهل المسافات الزائدة والأسطر', () => {
    expect(countWords('  كلمة\n\nكلمتان   ')).toBe(2)
  })
  it('يعيد صفرًا لنص فارغ', () => {
    expect(countWords('   ')).toBe(0)
  })
})

describe('deriveTitle', () => {
  it('يفضّل الموضوع عند وجوده', () => {
    expect(deriveTitle('متابعة طلب', 'نص المراسلة')).toBe('متابعة طلب')
  })
  it('يستخدم أول سطر غير فارغ عند غياب الموضوع', () => {
    expect(deriveTitle('', '\n\nالسطر الأول\nالسطر الثاني')).toBe('السطر الأول')
  })
  it('يعود إلى القيمة الافتراضية لنص فارغ', () => {
    expect(deriveTitle('', '   ')).toBe('مراسلة بدون عنوان')
  })
})

describe('formatDate', () => {
  it('يعيد شرطة لقيمة غير صالحة', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate('not-a-date')).toBe('—')
  })
  it('ينسّق تاريخًا صحيحًا', () => {
    expect(formatDate('2026-09-09T10:00:00Z', 'en')).toContain('2026')
  })
})

describe('scoreTone', () => {
  it('يصنّف الدرجات إلى ثلاث فئات', () => {
    expect(scoreTone(92)).toBe('good')
    expect(scoreTone(85)).toBe('good')
    expect(scoreTone(70)).toBe('warn')
    expect(scoreTone(64)).toBe('bad')
  })
})
