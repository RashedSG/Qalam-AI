import type { Language, Tone } from '../types/domain'
import type { IncomingAnalysis } from '../services/ai/schemas'
import { clampText, jsonInstruction, styleFor, userContextBlock, type PromptSpec, type UserContext } from './shared'

export interface GenerateReplyInput {
  incomingText: string
  analysis: IncomingAnalysis
  /** إجابات المستخدم على الأسئلة التوضيحية: السؤال → الإجابة */
  answers: Array<{ question: string; answer: string }>
  language: Language
  tone?: Tone
  userContext?: UserContext
}

const SHAPE = `{
  "language": "ar" | "en",
  "variants": [
    { "kind": "recommended", "title": string, "subject": string, "body": string, "wordCount": number },
    { "kind": "concise",     "title": string, "subject": string, "body": string, "wordCount": number },
    { "kind": "more_formal", "title": string, "subject": string, "body": string, "wordCount": number }
  ],
  "coverage": [ { "pointId": string, "point": string, "covered": boolean, "note": string } ]
}`

export function buildGenerateReplyPrompt(input: GenerateReplyInput): PromptSpec {
  const system = [
    'أنت كاتب ردود مؤسسية محترف.',
    'مهمتك: كتابة رد رسمي يغطي كل نقطة طلبها المرسل، بثلاث صيغ مختلفة فعليًا.',
    styleFor(input.language),
    'الصيغ الثلاث:',
    '1) "recommended" — رد متوازن كامل يغطي كل النقاط بوضوح (١٢٠–١٨٠ كلمة).',
    '2) "concise" — رد مباشر مختصر (٥٠–٩٠ كلمة) يحافظ على تغطية كل النقاط لكن بجمل قصيرة.',
    '3) "more_formal" — رد بصيغة خطاب رسمي كامل (١٨٠–٢٦٠ كلمة) بمقدمة مرجعية وخاتمة موسّعة.',
    'قواعد إلزامية:',
    '- كل نقطة في "requestedFromUser" يجب أن يُجاب عنها في كل صيغة. إن لم تتوفر معلومة من المستخدم، أدرج عنصرًا نائبًا واضحًا مثل [يُستكمل: الموعد المتوقع] ولا تخترع إجابة.',
    '- "coverage" يجب أن يحتوي عنصرًا لكل pointId من التحليل، ويصف تغطية الصيغة "recommended" تحديدًا.',
    '- ضع covered=false فقط إن تعذّر فعلًا تناول النقطة، مع note يوضح المعلومة الناقصة.',
    '- "body" جاهز للنسخ، بدون Markdown.',
    '- لا تلتزم بأي وعد أو التزام لم يذكره المستخدم صراحة في إجاباته.',
    jsonInstruction(SHAPE),
  ].join('\n\n')

  const a = input.analysis
  const points = a.requestedFromUser.length
    ? a.requestedFromUser
        .map((p) => `  • [${p.id}] ${p.text}${p.dueDate ? ` (الموعد: ${p.dueDate})` : ''}`)
        .join('\n')
    : '  • (لا توجد طلبات صريحة — اكتب ردًا مؤسسيًا مناسبًا بالإفادة والشكر)'

  const answered = input.answers.length
    ? input.answers.map((x) => `  • ${x.question}\n    الإجابة: ${x.answer || '(لم يجب المستخدم)'}`).join('\n')
    : '  • (لم يقدّم المستخدم معلومات إضافية)'

  const user = [
    'المراسلة الواردة:',
    '"""',
    clampText(input.incomingText, 10000),
    '"""',
    '',
    'ملخص التحليل:',
    `- الموضوع: ${a.subject || '(غير محدد)'}`,
    `- المرسل: ${a.senderName || '(غير محدد)'}${a.senderEntity ? ` — ${a.senderEntity}` : ''}`,
    `- مستوى الاستعجال: ${a.urgency}`,
    '- النقاط المطلوب الرد عليها:',
    points,
    '',
    'المعلومات التي قدّمها المستخدم:',
    answered,
    '',
    `لغة الرد المطلوبة: ${input.language}`,
    input.tone ? `النبرة المطلوبة: ${input.tone}` : '',
    userContextBlock(input.userContext),
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user, temperature: 0.5, json: true }
}
