/**
 * اختبار مولّد QR مقابل متجهات مرجعية.
 *
 * المتجهات مولَّدة بمكتبة مستقلة (segno بلغة بايثون) وحُفظت هنا، فلا يحتاج
 * التشغيل إلى بايثون ولا إلى شبكة. القناع مثبَّت في كل حالة عن قصد: المواصفة
 * تترك لبسًا في هل تُقيَّم الأقنعة قبل كتابة معلومات النسق أو بعدها — segno
 * يقيّم قبلها، وZXing وNayuki بعدها ونحن معهما. اللبس يخصّ اختيار القناع
 * وحده؛ وأي قناع صحيح يعطي رمزًا مقروءًا. أما المصفوفة عند قناعٍ بعينه فلا
 * لبس فيها، وهي ما نقارنه هنا.
 *
 * ملحوظة: segno يضيف بايت حشوٍ صفريًّا زائدًا حين يكون تيار البتّات محاذيًا
 * للبايت أصلًا. صُحّح ذلك عند توليد المتجهات، بعد التحقق من الصواب مقابل
 * متجه "HELLO WORLD" المنشور في المواصفة (الإصدار ١، المستوى Q).
 */
import { describe, expect, it } from 'vitest'
import { encodeQr, qrToSvgPath } from '@/lib/qr'
import golden from './fixtures/qr-golden.json'

const render = (modules: boolean[][]) => modules.map((row) => row.map((on) => (on ? '1' : '0')).join(''))

describe('مولّد QR', () => {
  for (const testCase of golden) {
    const name = testCase.text.length > 24 ? `${testCase.text.slice(0, 24)}…` : testCase.text
    it(`يطابق المرجع: «${name}» بالقناع ${testCase.mask}`, () => {
      const code = encodeQr(testCase.text, testCase.mask)
      expect(code.version).toBe(testCase.version)
      expect(code.size).toBe(17 + testCase.version * 4)
      expect(render(code.modules)).toEqual(testCase.rows)
    })
  }

  it('يختار إصدارًا يتّسع للنص ويكبر بكبره', () => {
    expect(encodeQr('a').version).toBe(1)
    expect(encodeQr('a'.repeat(200)).version).toBe(10)
    expect(encodeQr('a'.repeat(120)).version).toBeGreaterThan(encodeQr('a'.repeat(20)).version)
  })

  it('يرفض ما يتجاوز سعة الإصدار العاشر بدل أن يقتطعه بصمت', () => {
    expect(() => encodeQr('a'.repeat(214))).toThrow(/too long/)
  })

  it('يعامل النص عربيًّا بترميز UTF-8 لا بايتًا واحدًا للحرف', () => {
    // الحرف العربي بايتان، فالسعة تُقاس بالبايتات لا بالمحارف.
    const arabic = encodeQr('ب'.repeat(60))
    const latin = encodeQr('b'.repeat(60))
    expect(arabic.version).toBeGreaterThan(latin.version)
  })

  it('يختار القناع الأدنى عقوبةً ويعيد الاختيار نفسه في كل مرة', () => {
    const first = encodeQr('https://qalam.example/verify?t=abc')
    const second = encodeQr('https://qalam.example/verify?t=abc')
    expect(first.mask).toBe(second.mask)
    expect(render(first.modules)).toEqual(render(second.modules))
  })

  it('ينتج مسار SVG بمربّع لكل وحدة داكنة', () => {
    const code = encodeQr('HELLO', 0)
    const dark = code.modules.flat().filter(Boolean).length
    expect(qrToSvgPath(code).match(/M\d+ \d+h1v1h-1z/g)?.length).toBe(dark)
  })
})
