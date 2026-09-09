import type { Language } from '../types/domain'
import type { RequestAnalysis } from '../services/ai/schemas'
import { clampText, jsonInstruction, styleFor, userContextBlock, type PromptSpec, type UserContext } from './shared'

export interface GenerateCorrespondenceInput {
  idea: string
  analysis: RequestAnalysis
  userContext?: UserContext
}

const SHAPE = `{
  "language": "ar" | "en",
  "variants": [
    { "kind": "recommended", "title": string, "subject": string, "body": string, "wordCount": number },
    { "kind": "concise",     "title": string, "subject": string, "body": string, "wordCount": number },
    { "kind": "more_formal", "title": string, "subject": string, "body": string, "wordCount": number }
  ]
}`

export function buildGenerateCorrespondencePrompt(input: GenerateCorrespondenceInput): PromptSpec {
  const language: Language = input.analysis.language

  const system = [
    'أنت كاتب مراسلات مؤسسية محترف في بيئة العمل الإماراتية.',
    'مهمتك: كتابة ثلاث صيغ مختلفة فعليًا لنفس المراسلة.',
    styleFor(language),
    'الصيغ الثلاث يجب أن تختلف اختلافًا حقيقيًا وليس سطحيًا:',
    '1) "recommended" — الصيغة المقترحة المتوازنة: كاملة العناصر، تقارب ١٢٠–١٨٠ كلمة، بنية واضحة (مرجع → سياق → المطلوب → الموعد → خاتمة).',
    '2) "concise" — صيغة مختصرة جدًا: ٤٠–٧٠ كلمة، جملتان إلى ثلاث، تحذف السياق غير الضروري وتُبقي المطلوب والموعد فقط، وتصلح للبريد الإلكتروني السريع.',
    '3) "more_formal" — صيغة أعلى رسمية: ١٨٠–٢٦٠ كلمة، بنية خطاب رسمي كامل، عبارات مجاملة مؤسسية مناسبة، تفصيل أوضح للسياق والمسوغات، وخاتمة رسمية موسّعة.',
    'قواعد إلزامية:',
    '- "body" نص المراسلة جاهز للنسخ، بفقرات مفصولة بسطر فارغ، بدون Markdown وبدون عناوين مثل "الصيغة المقترحة".',
    '- ابدأ الجسم بالتحية المناسبة وانتهِ بالخاتمة والتوقيع إن توفر اسم المرسل.',
    '- استخدم عناصر نائبة واضحة مثل [التاريخ] أو [رقم الطلب] لأي معلومة غير متوفرة — ولا تخترعها.',
    '- "wordCount" عدد كلمات "body" تقريبيًا.',
    '- التزم بلغة المراسلة المحددة في التحليل.',
    jsonInstruction(SHAPE),
  ].join('\n\n')

  const a = input.analysis
  const user = [
    'الفكرة الأصلية للمستخدم:',
    '"""',
    clampText(input.idea, 6000),
    '"""',
    '',
    'نتيجة التحليل المعتمدة (بعد مراجعة المستخدم — التزم بها):',
    `- الجهة المخاطَبة: ${a.recipientDepartment}${a.recipientTitle ? ` (${a.recipientTitle})` : ''}`,
    `- نوع المراسلة: ${a.correspondenceType}`,
    `- الموضوع: ${a.subject}`,
    `- النبرة: ${a.tone}`,
    `- الأولوية: ${a.priority}`,
    `- اللغة: ${a.language}`,
    `- المطلوب: ${a.intent}`,
    a.deadline ? `- الموعد النهائي: ${a.deadline}` : '',
    a.keyPoints.length ? `- النقاط الواجب تغطيتها:\n${a.keyPoints.map((p) => `  • ${p}`).join('\n')}` : '',
    userContextBlock(input.userContext),
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user, temperature: 0.6, json: true }
}
