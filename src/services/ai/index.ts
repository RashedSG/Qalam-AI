/**
 * واجهة الذكاء الاصطناعي عالية المستوى — هذا هو ما تستخدمه الصفحات.
 * كل دالة: تستدعي المزود النشط ثم تتحقق من الشكل بـ Zod قبل إرجاع النتيجة.
 */
import type { z } from 'zod'
import { getAiProvider } from './aiProvider'
import { AiError, type AiCallOptions, type AiTask } from './types'
import {
  correspondenceDraftSchema,
  improvedTextSchema,
  incomingAnalysisSchema,
  phraseExplanationSchema,
  replyDraftSchema,
  requestAnalysisSchema,
  reviewResultSchema,
  translationSchema,
  tutorEvaluationSchema,
  tutorExerciseSchema,
  type CorrespondenceDraft,
  type ImprovedText,
  type IncomingAnalysis,
  type PhraseExplanation,
  type ReplyDraft,
  type RequestAnalysis,
  type ReviewResult,
  type Translation,
  type TutorEvaluation,
  type TutorExercise,
} from './schemas'

async function call<TSchema extends z.ZodTypeAny>(
  task: AiTask,
  schema: TSchema,
  payload: unknown,
  options?: AiCallOptions,
): Promise<z.infer<TSchema>> {
  const raw = await getAiProvider().run<unknown>(task, payload, options)
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    // الخادم يتحقق أيضًا؛ هذا خط دفاع ثانٍ ضد استجابة غير صالحة.
    throw new AiError('invalid_response')
  }
  return parsed.data
}

export const ai = {
  analyzeRequest: (payload: unknown, o?: AiCallOptions): Promise<RequestAnalysis> =>
    call('analyzeRequest', requestAnalysisSchema, payload, o),

  generateCorrespondence: (payload: unknown, o?: AiCallOptions): Promise<CorrespondenceDraft> =>
    call('generateCorrespondence', correspondenceDraftSchema, payload, o),

  analyzeIncoming: (payload: unknown, o?: AiCallOptions): Promise<IncomingAnalysis> =>
    call('analyzeIncoming', incomingAnalysisSchema, payload, o),

  generateReply: (payload: unknown, o?: AiCallOptions): Promise<ReplyDraft> =>
    call('generateReply', replyDraftSchema, payload, o),

  improveText: (payload: unknown, o?: AiCallOptions): Promise<ImprovedText> =>
    call('improveText', improvedTextSchema, payload, o),

  translateCorporate: (payload: unknown, o?: AiCallOptions): Promise<Translation> =>
    call('translateCorporate', translationSchema, payload, o),

  reviewBeforeSend: (payload: unknown, o?: AiCallOptions): Promise<ReviewResult> =>
    call('reviewBeforeSend', reviewResultSchema, payload, o),

  tutorExercise: (payload: unknown, o?: AiCallOptions): Promise<TutorExercise> =>
    call('tutorExercise', tutorExerciseSchema, payload, o),

  tutorEvaluate: (payload: unknown, o?: AiCallOptions): Promise<TutorEvaluation> =>
    call('tutorEvaluate', tutorEvaluationSchema, payload, o),

  explainPhrase: (payload: unknown, o?: AiCallOptions): Promise<PhraseExplanation> =>
    call('explainPhrase', phraseExplanationSchema, payload, o),
}

export * from './types'
export * from './schemas'
export { getAiProvider, registerAiProvider, setActiveAiProvider, listAiProviders } from './aiProvider'
