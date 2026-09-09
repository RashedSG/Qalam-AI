/**
 * أسس مشتركة لكل وحدات الـ Prompt.
 * ملاحظة أمنية: هذه الملفات تُستخدم داخل دوال Netlify فقط (Server-side).
 * لا تستوردها من مكوّنات الواجهة حتى لا تُشحن إلى المتصفح.
 */
import type { Language } from '../types/domain'

export interface PromptSpec {
  system: string
  user: string
  /** درجة الحرارة المناسبة للمهمة (تحليل = منخفضة، صياغة = متوسطة). */
  temperature: number
  /** هل نطلب JSON مهيكل من النموذج. */
  json: boolean
}

/** دليل الأسلوب المؤسسي العربي — محايد ولا ينتحل هوية أي جهة. */
export const ARABIC_CORPORATE_STYLE = `
دليل الأسلوب المؤسسي العربي (بيئة الأعمال والجهات في دولة الإمارات):
- اكتب عربية فصحى معاصرة، رسمية، واضحة، مهذبة، ومختصرة دون تكلّف.
- استخدم صيغة الجمع المؤسسي ("نفيدكم"، "نأمل") بدل صيغة المتكلم المفرد.
- ابدأ بجملة مرجعية عند وجود سياق سابق، مثل: "بالإشارة إلى الموضوع أعلاه".
- حدّد المطلوب بوضوح وفي جملة مستقلة، ولا تترك القارئ يستنتجه.
- اذكر التواريخ والمواعيد صراحة عند وجودها.
- اختم بعبارة مناسبة للسياق مثل "وتفضلوا بقبول فائق الاحترام والتقدير".
- لا تُفرط في عبارات المجاملة مثل "يرجى التكرم" — استخدمها عند مناسبتها فقط.
- تجنّب الحشو والتكرار والجمل الطويلة المتشعبة.
- تجنّب العبارات الحادة أو الاتهامية؛ استبدلها بصياغة مهنية محايدة.

قيود إلزامية:
- لا تنتحل هوية أي جهة حكومية أو شركة، ولا تُنشئ شعارات أو أختامًا أو أرقام معاملات.
- لا تدّعِ أن النص معتمد رسميًا من أي جهة.
- لا تخترع حقائق أو أسماء أو أرقامًا غير موجودة في مدخلات المستخدم؛ إن نقصت معلومة اتركها كعنصر نائب واضح مثل [التاريخ] أو أدرجها في missingInformation.
`.trim()

export const ENGLISH_CORPORATE_STYLE = `
Corporate English style guide (UAE business and government environment):
- Write clear, professional, concise business English.
- Open with a reference sentence when prior context exists ("Further to the above subject...").
- State the required action explicitly in its own sentence.
- Mention dates and deadlines explicitly when present.
- Close professionally ("Yours sincerely," / "Best regards,").
- Avoid aggressive or accusatory phrasing; keep it neutral and professional.
- Never fabricate facts, names, numbers, reference numbers, seals or logos.
- Never claim official endorsement by any entity.
- Use clear placeholders such as [DATE] when information is missing.
`.trim()

export function styleFor(language: Language): string {
  return language === 'ar' ? ARABIC_CORPORATE_STYLE : ENGLISH_CORPORATE_STYLE
}

/** التعليمة الثابتة لكل مهمة تُرجع JSON. */
export function jsonInstruction(shape: string): string {
  return [
    'أعد الإجابة ككائن JSON صالح فقط، بدون أي نص خارج JSON وبدون علامات ```.',
    'التزم حرفيًا بهذا الشكل والمفاتيح والأنواع:',
    shape,
    'إن لم تتوفر قيمة لحقل نصي فاستخدم "" وللمصفوفة استخدم [].',
  ].join('\n')
}

/** يقصّ نصًا طويلًا مع الحفاظ على البداية والنهاية. */
export function clampText(text: string, max = 12000): string {
  const t = text.trim()
  if (t.length <= max) return t
  const head = t.slice(0, Math.floor(max * 0.7))
  const tail = t.slice(-Math.floor(max * 0.25))
  return `${head}\n\n[... تم اختصار جزء من النص ...]\n\n${tail}`
}

/** سياق المستخدم الاختياري (القسم، المسمى، الأسلوب المفضل). */
export interface UserContext {
  fullName?: string
  department?: string
  jobTitle?: string
  writingStyle?: string
  preferredLanguage?: Language
}

export function userContextBlock(ctx?: UserContext): string {
  if (!ctx) return ''
  const lines: string[] = []
  if (ctx.fullName) lines.push(`اسم المرسل: ${ctx.fullName}`)
  if (ctx.jobTitle) lines.push(`المسمى الوظيفي: ${ctx.jobTitle}`)
  if (ctx.department) lines.push(`قسم المرسل: ${ctx.department}`)
  if (ctx.writingStyle) lines.push(`الأسلوب المفضل: ${ctx.writingStyle}`)
  if (!lines.length) return ''
  return `\nمعلومات المرسل (استخدمها في التوقيع والسياق فقط، ولا تخترع غيرها):\n${lines.join('\n')}\n`
}
