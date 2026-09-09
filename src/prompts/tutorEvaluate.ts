import type { CorrespondenceType, Language, LearningLevel, Tone } from '../types/domain'
import { CORRESPONDENCE_TYPES, TONES } from '../types/domain'
import { clampText, jsonInstruction, styleFor, type PromptSpec } from './shared'

/* -------------------------------------------------------------------------- */
/* توليد تمرين                                                                */
/* -------------------------------------------------------------------------- */
export interface TutorExerciseInput {
  level: LearningLevel
  language: Language
  department?: string
  /** سيناريوهات سابقة لتفادي التكرار. */
  recentScenarios?: string[]
}

const EXERCISE_SHAPE = `{
  "scenario": string,
  "expectedType": one of [${CORRESPONDENCE_TYPES.join(' | ')}],
  "expectedTone": one of [${TONES.join(' | ')}],
  "hints": string[]
}`

const LEVEL_GUIDE: Record<LearningLevel, string> = {
  beginner: 'موقف بسيط بمطلب واحد واضح (طلب إفادة، تأكيد موعد، شكر).',
  intermediate: 'موقف بمطلبين ومهلة زمنية، ويحتاج ترتيبًا منطقيًا للأفكار.',
  advanced: 'موقف حساس يحتاج نبرة دبلوماسية أو حزمًا مدروسًا (تأخر متكرر، اعتراض، تصعيد مهذب).',
  professional: 'موقف مركّب متعدد الأطراف والمواعيد، يحتاج موازنة بين الحزم والدبلوماسية وتغطية عدة نقاط.',
}

export function buildTutorExercisePrompt(input: TutorExerciseInput): PromptSpec {
  const system = [
    'أنت مدرّب كتابة مراسلات مؤسسية.',
    'مهمتك: توليد تمرين واقعي واحد يطلب من المتدرب كتابة مخاطبة.',
    styleFor(input.language),
    `مستوى المتدرب: ${input.level} — ${LEVEL_GUIDE[input.level]}`,
    'قواعد:',
    '- "scenario" فقرة من ٢ إلى ٤ جمل تصف الموقف بضمير المخاطب ("سبق أن طلبتَ..."), وتنتهي بتكليف واضح ("اكتب مخاطبة رسمية لـ...").',
    '- الموقف واقعي من بيئة عمل مؤسسية (مالية، مشتريات، صيانة، مشاريع، موارد بشرية...).',
    '- لا تذكر الحل ولا الصيغة النموذجية إطلاقًا.',
    '- "hints" من ٢ إلى ٣ تلميحات عامة عن العناصر المطلوبة (وليست جملًا جاهزة للنسخ).',
    '- لا تخترع أسماء جهات حكومية حقيقية؛ استخدم مسميات عامة مثل "الإدارة المالية".',
    jsonInstruction(EXERCISE_SHAPE),
  ].join('\n\n')

  const user = [
    input.department ? `قسم المتدرب: ${input.department} — اجعل الموقف قريبًا من مجاله.` : '',
    `لغة التمرين: ${input.language}`,
    input.recentScenarios?.length
      ? `تجنّب تكرار هذه السيناريوهات السابقة:\n${input.recentScenarios.slice(0, 5).map((s) => `- ${s.slice(0, 140)}`).join('\n')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user: user || 'ولّد تمرينًا جديدًا.', temperature: 0.85, json: true }
}

/* -------------------------------------------------------------------------- */
/* تقييم إجابة المتدرب                                                        */
/* -------------------------------------------------------------------------- */
export interface TutorEvaluateInput {
  scenario: string
  userAnswer: string
  level: LearningLevel
  language: Language
  expectedType?: CorrespondenceType
  expectedTone?: Tone
}

const EVAL_SHAPE = `{
  "overallScore": number (0-100),
  "criteria": {
    "subjectClarity": number, "requestClarity": number, "formality": number, "language": number,
    "conciseness": number, "opening": number, "closing": number, "audienceFit": number
  },
  "strengths": string[],
  "improvements": string[],
  "explanation": string,
  "modelAnswer": string
}`

export function buildTutorEvaluatePrompt(input: TutorEvaluateInput): PromptSpec {
  const system = [
    'أنت مدرّب ومقيّم كتابة مراسلات مؤسسية. أسلوبك داعم لكن صريح ودقيق.',
    styleFor(input.language),
    'قيّم إجابة المتدرب على المعايير الثمانية (٠–١٠٠ لكل معيار):',
    '- subjectClarity: وضوح الموضوع.',
    '- requestClarity: تحديد المطلوب صراحة.',
    '- formality: مستوى الرسمية ومناسبته.',
    '- language: سلامة اللغة والإملاء والتراكيب.',
    '- conciseness: الاختصار دون إخلال.',
    '- opening: مناسبة المقدمة والتحية.',
    '- closing: مناسبة الخاتمة.',
    '- audienceFit: ملاءمة النص للمخاطَب.',
    '',
    'قواعد إلزامية:',
    '- "overallScore" قريب من متوسط المعايير الثمانية.',
    '- "strengths" من ٢ إلى ٤ نقاط قوة محددة مقتبسة من إجابة المتدرب نفسها.',
    '- "improvements" من ٢ إلى ٤ نقاط تحتاج تحسينًا، كل واحدة قابلة للتنفيذ.',
    '- "explanation" فقرة قصيرة تشرح المنطق وراء التقييم وأهم مبدأ يجب أن يتعلمه.',
    '- "modelAnswer" صيغة نموذجية كاملة للموقف — تُعرض بعد التقييم فقط.',
    '- كن واقعيًا: إجابة ناقصة لا تحصل على أكثر من ٦٥.',
    `- مستوى المتدرب: ${input.level} — قيّم بمعايير هذا المستوى.`,
    jsonInstruction(EVAL_SHAPE),
  ].join('\n\n')

  const user = [
    'التمرين:',
    '"""',
    clampText(input.scenario, 3000),
    '"""',
    '',
    'إجابة المتدرب:',
    '"""',
    clampText(input.userAnswer, 8000),
    '"""',
    input.expectedType ? `\nنوع المراسلة المتوقع: ${input.expectedType}` : '',
    input.expectedTone ? `النبرة المتوقعة: ${input.expectedTone}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return { system, user, temperature: 0.35, json: true }
}

/* -------------------------------------------------------------------------- */
/* شرح عبارة مؤسسية                                                           */
/* -------------------------------------------------------------------------- */
export interface ExplainPhraseInput {
  phrase: string
  language: Language
}

const PHRASE_SHAPE = `{
  "phrase": string,
  "meaning": string,
  "whenToUse": string,
  "whenNotToUse": string,
  "alternatives": string[],
  "example": string
}`

export function buildExplainPhrasePrompt(input: ExplainPhraseInput): PromptSpec {
  const system = [
    'أنت خبير في الصياغات المؤسسية العربية المستخدمة في المراسلات الرسمية.',
    'اشرح العبارة المطلوبة شرحًا عمليًا موجزًا.',
    styleFor(input.language),
    'قواعد:',
    '- "meaning" جملة إلى جملتين.',
    '- "whenToUse" السياق المناسب تحديدًا (المخاطَب، نوع المراسلة، درجة الرسمية).',
    '- "whenNotToUse" متى تكون العبارة في غير محلها أو مبالغًا فيها.',
    '- "alternatives" من ٢ إلى ٤ بدائل بدرجات رسمية مختلفة.',
    '- "example" جملة واحدة تُظهر الاستخدام الصحيح.',
    jsonInstruction(PHRASE_SHAPE),
  ].join('\n\n')

  return { system, user: `العبارة: "${input.phrase.slice(0, 300)}"`, temperature: 0.3, json: true }
}
