/**
 * فحوص وصولية ساكنة.
 *
 * ⚠️ ما هنا لا يُغني عن اختبار بقارئ شاشة حقيقي — لا يقيس تباين الألوان ولا
 * ترتيب التنقّل ولا وضوح الصياغة. لكنه يمسك الأخطاء التي تتكرّر بلا انتباه:
 * زرٌّ بأيقونةٍ بلا اسم، وصورةٌ بلا بديل، وحقلٌ يقع عليه التنقّل بلا تعريف.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'test') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(full) && !/\.test\.tsx$/.test(full)) out.push(full)
  }
  return out
}

const files = walk(join(root, 'src'))
const sources = files.map((file) => [file.replace(`${root}/`, ''), readFileSync(file, 'utf8')] as const)

describe('الوصولية — فحوص ساكنة', () => {
  it('كل صورة تحمل بديلًا نصيًّا (ولو فارغًا للزخرفية)', () => {
    const offenders: string[] = []
    for (const [name, source] of sources) {
      for (const tag of source.match(/<img\b[^>]*>/gs) ?? []) {
        if (!/\balt=/.test(tag)) offenders.push(`${name}: ${tag.slice(0, 60)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('كل حقل مخفي بصريًّا إمّا مُعرَّف وإمّا مُخرَج من شجرة الوصولية', () => {
    // `sr-only` تُبقي العنصر في مسار التنقّل: قارئ الشاشة يقع عليه.
    const offenders: string[] = []
    for (const [name, source] of sources) {
      for (const tag of source.match(/<input\b[^>]*?\/?>/gs) ?? []) {
        if (!/sr-only/.test(tag)) continue
        const named = /aria-label|aria-labelledby|\{\.\.\.p\}/.test(tag)
        const hidden = /aria-hidden="true"/.test(tag) && /tabIndex=\{-1\}/.test(tag)
        if (!named && !hidden) offenders.push(`${name}: ${tag.slice(0, 80)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('كل جدول بيانات يحمل عنوانًا وعناوين أعمدة معرّفة النطاق', () => {
    const offenders: string[] = []
    for (const [name, source] of sources) {
      if (!/<table\b/.test(source)) continue
      if (!/<caption/.test(source)) offenders.push(`${name}: بلا <caption>`)
      for (const tag of source.match(/<th\b[^>]*>/gs) ?? []) {
        if (!/scope=/.test(tag)) offenders.push(`${name}: <th> بلا scope`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('الأيقونة داخل الزرّ زخرفيةٌ لا تُنطَق مرتين', () => {
    const offenders: string[] = []
    for (const [name, source] of sources) {
      // <Icon className="… size-N …" /> بلا aria-hidden ولا اسم صريح.
      for (const tag of source.match(/<[A-Z]\w*\s+className="[^"]*\bsize-[\d.]+\b[^"]*"\s*\/>/g) ?? []) {
        if (/aria-hidden|aria-label|title=/.test(tag)) continue
        if (/^<Spinner\b/.test(tag)) continue // يحمل aria-hidden في تعريفه
        offenders.push(`${name}: ${tag}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('كل صفحة تحمل عنوانًا رئيسيًّا واحدًا', () => {
    // صفحة تفاصيل المراسلة — أكثر الصفحات فتحًا — كانت بلا h1 إطلاقًا:
    // عنوانها يأتي من CardHeader وهو يُصدر h2. لم يظهر إلا بفحص الصفحة
    // المُصيَّرة في متصفح.
    const offenders: string[] = []
    for (const file of walk(join(root, 'src/pages'))) {
      const source = readFileSync(file, 'utf8')
      const declaresHeading =
        /<h1[\s>]/.test(source) ||          // عنوان مباشر
        /titleAs="h1"/.test(source) ||       // عنوان بطاقة مرفوع المستوى
        /<AuthLayout/.test(source)           // الغلاف يوفّره لصفحات الدخول
      if (!declaresHeading) offenders.push(file.replace(`${root}/`, ''))
    }
    expect(offenders).toEqual([])
  })

  it('التطبيق يعلن اللغة والاتجاه ويغيّرهما مع تغيّر اللغة', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    expect(html).toMatch(/<html lang="ar" dir="rtl">/)
    const i18n = readFileSync(join(root, 'src/contexts/I18nContext.tsx'), 'utf8')
    expect(i18n).toMatch(/root\.lang = lang/)
    expect(i18n).toMatch(/root\.dir = dir/)
  })

  it('توجد رابطة تخطٍّ إلى المحتوى ومعلَمٌ رئيسي يقابلها', () => {
    const shell = readFileSync(join(root, 'src/components/layout/AppShell.tsx'), 'utf8')
    expect(shell).toMatch(/href="#main"/)
    expect(shell).toMatch(/<main id="main"/)
  })

  it('حالات التحميل والخطأ مُعلَنة لا مرئية فقط', () => {
    const verify = readFileSync(join(root, 'src/pages/VerifyPage.tsx'), 'utf8')
    expect(verify).toMatch(/role="alert"/)
    expect(verify).toMatch(/role="status"/)
  })
})
