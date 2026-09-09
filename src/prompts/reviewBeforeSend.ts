import type { Language } from '../types/domain'
import type { IncomingAnalysis } from '../services/ai/schemas'
import { clampText, jsonInstruction, styleFor, type PromptSpec } from './shared'

export interface ReviewBeforeSendInput {
  text: string
  language?: Language
  /** عند مراجعة رد على مراسلة واردة: نمرر تحليلها للتحقق من تغطية كل النقاط. */
  incomingAnalysis?: IncomingAnalysis | null
}

const SHAPE = `{
  "overallScore": number (0-100),
  "scores": {
    "clarity": number, "formality": number, "language": number,
    "conciseness": number, "completeness": number
  },
  "verdict": "ready" | "needs_review",
  "checks": [ { "key": string, "label": string, "status": "pass" | "warn" | "fail", "detail": string } ],
  "suggestions": string[],
  "coverage": [ { "pointId": string, "point": string, "covered": boolean, "note": string } ]
}`

/** الفحوص الإلزامية — نفس المفاتيح تُستخدم في الواجهة. */
export const REVIEW_CHECK_KEYS = [
  'subject_clear',
  'request_clear',
  'recipient_appropriate',
  'tone_appropriate',
  'harsh_language',
  'missing_information',
  'dates_present',
  'attachment_reference',
  'unintended_commitments',
  'repetition',
  'excessive_length',
  'covers_all_points',
] as const

export function buildReviewBeforeSendPrompt(input: ReviewBeforeSendInput): PromptSpec {
  const language = input.language ?? 'ar'

  const system = [
    'أنت مراجع مراسلات مؤسسية دقيق. مهمتك فحص مراسلة قبل إرسالها.',
    styleFor(language),
    'نفّذ هذه الفحوص بالضبط، وبهذه المفاتيح (key) وبهذا الترتيب:',
    '- subject_clear: هل الموضوع واضح ومحدد؟',
    '- request_clear: هل المطلوب من المخاطَب واضح وصريح؟',
    '- recipient_appropriate: هل المخاطَب مناسب لمضمون الرسالة ومستواها؟',
    '- tone_appropriate: هل النبرة مناسبة للسياق والمخاطَب؟',
    '- harsh_language: هل توجد عبارات حادة أو اتهامية؟ (pass = لا توجد)',
    '- missing_information: هل توجد معلومات ناقصة أو عناصر نائبة لم تُملأ؟ (pass = لا يوجد نقص)',
    '- dates_present: هل ذُكر تاريخ أو موعد واضح عند الحاجة إليه؟',
    '- attachment_reference: هل ذُكر مرفق دون إشارة واضحة إليه أو العكس؟ (pass = لا تعارض)',
    '- unintended_commitments: هل توجد وعود أو التزامات قد تكون غير مقصودة؟ (pass = لا توجد)',
    '- repetition: هل يوجد تكرار غير ضروري؟ (pass = لا يوجد)',
    '- excessive_length: هل النص أطول من اللازم؟ (pass = الطول مناسب)',
    '- covers_all_points: هل تمت الإجابة عن كل نقاط المراسلة الواردة؟ (استخدم "غير منطبق" في detail إن لم تكن هذه مراسلة رد)',
    '',
    'قواعد التقييم:',
    '- "label" وصف قصير بلغة المستخدم لكل فحص.',
    '- "detail" جملة واحدة تشرح النتيجة، وتُشير إلى الموضع عند وجود مشكلة.',
    '- الدرجات من ٠ إلى ١٠٠. "overallScore" يجب أن يكون قريبًا من متوسط الدرجات الخمس.',
    '- "verdict" = "ready" فقط إذا كان overallScore ≥ 85 ولا يوجد أي فحص بحالة "fail".',
    '- "suggestions" من ٢ إلى ٥ اقتراحات عملية قابلة للتطبيق مباشرة.',
    '- كن صارمًا وواقعيًا: لا تمنح درجات عالية لنص ناقص أو غامض.',
    '',
    'تنبيه إلزامي: هذه مراجعة لغوية ومهنية مساعدة فقط، وليست مراجعة قانونية ولا ضمانًا لأي أثر نظامي. لا تدّعِ خلاف ذلك.',
    jsonInstruction(SHAPE),
  ].join('\n\n')

  const parts = ['نص المراسلة المراد مراجعتها:', '"""', clampText(input.text, 12000), '"""']

  if (input.incomingAnalysis && input.incomingAnalysis.requestedFromUser.length) {
    parts.push(
      '',
      'هذا النص هو رد على مراسلة واردة. النقاط التي طلبها المرسل:',
      input.incomingAnalysis.requestedFromUser
        .map((p) => `- [${p.id}] ${p.text}${p.dueDate ? ` (الموعد: ${p.dueDate})` : ''}`)
        .join('\n'),
      '',
      'املأ "coverage" بعنصر لكل pointId أعلاه، وحدّد هل غطاه النص فعلًا.',
    )
  } else {
    parts.push('', 'هذه ليست مراسلة رد — اترك "coverage" مصفوفة فارغة.')
  }

  return { system, user: parts.join('\n'), temperature: 0.2, json: true }
}
