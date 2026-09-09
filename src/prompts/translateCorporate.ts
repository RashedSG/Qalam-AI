import type { Language } from '../types/domain'
import { clampText, jsonInstruction, type PromptSpec } from './shared'

export interface TranslateCorporateInput {
  text: string
  targetLanguage: Language
}

const SHAPE = `{
  "translated": string,
  "targetLanguage": "ar" | "en",
  "terminologyNotes": string[]
}`

export function buildTranslateCorporatePrompt(input: TranslateCorporateInput): PromptSpec {
  const toArabic = input.targetLanguage === 'ar'

  const system = [
    'أنت مترجم مراسلات مؤسسية، لا مترجم حرفي.',
    toArabic
      ? 'ترجم إلى العربية الفصحى المؤسسية المستخدمة في المراسلات الرسمية في بيئة العمل الإماراتية.'
      : 'Translate into professional corporate English as used in UAE business and government correspondence.',
    'قواعد الترجمة المؤسسية:',
    '- انقل المعنى والوظيفة التواصلية، لا الكلمات.',
    '- حافظ على درجة الرسمية ونبرة النص الأصلي (رسمي يبقى رسميًا، حازم يبقى حازمًا).',
    '- استخدم المقابل المؤسسي المتعارف عليه للمصطلحات، لا الترجمة القاموسية.',
    '  مثال: "Kindly be informed" ↔ "نفيدكم علمًا"، "for your kind action" ↔ "لاتخاذ ما يلزم"، "Further to" ↔ "بالإشارة إلى".',
    '- حافظ على بنية المراسلة: التحية، المرجع، الجسم، المطلوب، الخاتمة، التوقيع.',
    '- لا تترجم الأسماء الشخصية وأسماء الجهات ترجمة حرفية إن كان لها اسم متعارف عليه؛ وإن لم يوجد، أبقِها كما وردت.',
    '- حافظ على الأرقام والتواريخ والعناصر النائبة مثل [التاريخ] كما هي.',
    '- لا تضف ولا تحذف معلومات.',
    '- "terminologyNotes": من صفر إلى أربع ملاحظات قصيرة عن خيارات مصطلحية مهمة اتخذتها. اتركها [] إن لم تكن هناك ملاحظات جوهرية.',
    jsonInstruction(SHAPE),
  ].join('\n\n')

  const user = [
    `اللغة الهدف: ${input.targetLanguage}`,
    'النص المصدر:',
    '"""',
    clampText(input.text, 12000),
    '"""',
  ].join('\n')

  return { system, user, temperature: 0.3, json: true }
}
