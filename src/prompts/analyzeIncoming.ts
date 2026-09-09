import type { Language } from '../types/domain'
import { PRIORITIES } from '../types/domain'
import { clampText, jsonInstruction, styleFor, userContextBlock, type PromptSpec, type UserContext } from './shared'

export interface AnalyzeIncomingInput {
  incomingText: string
  replyLanguage?: Language
  userContext?: UserContext
}

const SHAPE = `{
  "senderName": string,
  "senderEntity": string,
  "subject": string,
  "summary": string,
  "language": "ar" | "en",
  "keyPoints": string[],
  "requestedFromUser": [ { "id": string, "text": string, "dueDate": string, "requiresAnswer": boolean } ],
  "dates": string[],
  "urgency": one of [${PRIORITIES.join(' | ')}],
  "needsReply": boolean,
  "missingInformation": string[],
  "clarifyingQuestions": string[]
}`

export function buildAnalyzeIncomingPrompt(input: AnalyzeIncomingInput): PromptSpec {
  const language = input.replyLanguage ?? 'ar'

  const system = [
    'أنت محلل مراسلات واردة في بيئة عمل مؤسسية.',
    'مهمتك: قراءة مراسلة واردة واستخراج ما هو مطلوب من المستخدم بدقة، دون كتابة أي رد.',
    styleFor(language),
    'قواعد التحليل:',
    '- "requestedFromUser" أهم حقل: كل طلب أو سؤال موجّه للمستخدم يصبح عنصرًا مستقلًا.',
    '- امنح كل عنصر معرّفًا ثابتًا بالشكل "p1", "p2", "p3" بالترتيب.',
    '- "text" صياغة قصيرة وواضحة للمطلوب (لا تنسخ الفقرة كاملة).',
    '- "dueDate" التاريخ المرتبط بهذا الطلب تحديدًا إن ذُكر، وإلا "".',
    '- "clarifyingQuestions" أسئلة قصيرة موجهة للمستخدم عن المعلومات التي يحتاجها ليكتب ردًا كاملًا (مثل: "ما حالة الطلب؟"، "ما الموعد المتوقع للتوريد؟"). اجعلها محددة وقابلة للإجابة بجملة.',
    '- "senderName"/"senderEntity" فقط إن وردا صراحة في النص؛ لا تخمّن.',
    '- "language" لغة المراسلة الواردة نفسها.',
    '- إن لم تكن المراسلة تتطلب ردًا، اجعل needsReply=false واترك requestedFromUser فارغة.',
    jsonInstruction(SHAPE),
  ].join('\n\n')

  const user = [
    'نص المراسلة الواردة:',
    '"""',
    clampText(input.incomingText, 14000),
    '"""',
    userContextBlock(input.userContext),
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user, temperature: 0.15, json: true }
}
