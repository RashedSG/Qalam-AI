import type { CorrespondenceType, Formality, Language, Priority } from '../types/domain'
import { CORRESPONDENCE_TYPES, PRIORITIES, TONES } from '../types/domain'
import { clampText, jsonInstruction, styleFor, userContextBlock, type PromptSpec, type UserContext } from './shared'

export interface AnalyzeRequestInput {
  idea: string
  language?: Language
  recipient?: string
  correspondenceType?: CorrespondenceType | ''
  formality?: Formality | ''
  priority?: Priority | ''
  userContext?: UserContext
}

const SHAPE = `{
  "recipientDepartment": string,
  "recipientTitle": string,
  "correspondenceType": one of [${CORRESPONDENCE_TYPES.join(' | ')}],
  "subject": string,
  "tone": one of [${TONES.join(' | ')}],
  "priority": one of [${PRIORITIES.join(' | ')}],
  "language": "ar" | "en",
  "intent": string,
  "keyPoints": string[],
  "deadline": string,
  "missingInformation": string[]
}`

export function buildAnalyzeRequestPrompt(input: AnalyzeRequestInput): PromptSpec {
  const language = input.language ?? 'ar'

  const system = [
    'أنت محلل مراسلات مؤسسية خبير في بيئة العمل العربية والإماراتية.',
    'مهمتك: قراءة فكرة المستخدم المكتوبة بأي مستوى لغوي (لهجة يومية أو فصحى أو إنجليزية) واستخراج نية المراسلة وعناصرها.',
    'أنت لا تكتب المراسلة في هذه المرحلة — أنت تُحلل فقط.',
    styleFor(language),
    'قواعد التحليل:',
    '- "subject" يجب أن يكون موضوعًا قصيرًا صالحًا لسطر الموضوع (٣ إلى ١٠ كلمات).',
    '- "intent" جملة واحدة تصف المطلوب فعليًا من المخاطَب.',
    '- "keyPoints" النقاط التي يجب أن تظهر في المراسلة.',
    '- "missingInformation" أسئلة قصيرة عن معلومات ناقصة تمنع كتابة مراسلة دقيقة (مثل رقم الطلب أو التاريخ). اتركها فارغة إن كانت الفكرة كافية.',
    '- لا تخترع أسماء جهات أو أرقامًا غير مذكورة.',
    jsonInstruction(SHAPE),
  ].join('\n\n')

  const hints: string[] = []
  if (input.recipient) hints.push(`الجهة المخاطَبة التي حددها المستخدم: ${input.recipient}`)
  if (input.correspondenceType) hints.push(`نوع المراسلة المحدد مسبقًا: ${input.correspondenceType}`)
  if (input.formality) hints.push(`درجة الرسمية المطلوبة: ${input.formality}`)
  if (input.priority) hints.push(`الأولوية المحددة: ${input.priority}`)
  hints.push(`لغة المراسلة المطلوبة: ${language}`)

  const user = [
    'فكرة المستخدم:',
    '"""',
    clampText(input.idea, 6000),
    '"""',
    userContextBlock(input.userContext),
    'اعتبارات إضافية (إن وُجدت، فهي مُلزِمة):',
    hints.map((h) => `- ${h}`).join('\n'),
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user, temperature: 0.2, json: true }
}
