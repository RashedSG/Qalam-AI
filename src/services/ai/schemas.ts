/**
 * مخططات Zod لكل مخرجات الذكاء الاصطناعي المهيكلة (Structured Outputs).
 * تُستخدم في المتصفح وداخل دوال Netlify معًا — مصدر حقيقة واحد.
 */
import { z } from 'zod'
import {
  CORRESPONDENCE_TYPES,
  FORMALITY_LEVELS,
  LANGUAGES,
  PRIORITIES,
  TONES,
  VARIANT_KINDS,
} from '../../types/domain'

export const languageSchema = z.enum(LANGUAGES)
export const toneSchema = z.enum(TONES)
export const prioritySchema = z.enum(PRIORITIES)
export const correspondenceTypeSchema = z.enum(CORRESPONDENCE_TYPES)
export const formalitySchema = z.enum(FORMALITY_LEVELS)

/* -------------------------------------------------------------------------- */
/* 1) تحليل الطلب — analyzeRequest                                            */
/* -------------------------------------------------------------------------- */
export const requestAnalysisSchema = z.object({
  recipientDepartment: z.string().min(1),
  recipientTitle: z.string().default(''),
  correspondenceType: correspondenceTypeSchema,
  subject: z.string().min(1),
  tone: toneSchema,
  priority: prioritySchema,
  language: languageSchema,
  intent: z.string().min(1),
  keyPoints: z.array(z.string()).default([]),
  deadline: z.string().default(''),
  missingInformation: z.array(z.string()).default([]),
})
export type RequestAnalysis = z.infer<typeof requestAnalysisSchema>

/* -------------------------------------------------------------------------- */
/* 2) إنشاء المراسلة — generateCorrespondence                                 */
/* -------------------------------------------------------------------------- */
export const correspondenceVariantSchema = z.object({
  kind: z.enum(VARIANT_KINDS),
  title: z.string().default(''),
  subject: z.string().min(1),
  body: z.string().min(1),
  wordCount: z.number().int().nonnegative().default(0),
})
export type CorrespondenceVariant = z.infer<typeof correspondenceVariantSchema>

export const correspondenceDraftSchema = z.object({
  language: languageSchema,
  variants: z.array(correspondenceVariantSchema).min(1),
})
export type CorrespondenceDraft = z.infer<typeof correspondenceDraftSchema>

/* -------------------------------------------------------------------------- */
/* 3) تحليل مراسلة واردة — analyzeIncoming                                    */
/* -------------------------------------------------------------------------- */
export const incomingRequestPointSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  dueDate: z.string().default(''),
  requiresAnswer: z.boolean().default(true),
})
export type IncomingRequestPoint = z.infer<typeof incomingRequestPointSchema>

export const incomingAnalysisSchema = z.object({
  senderName: z.string().default(''),
  senderEntity: z.string().default(''),
  subject: z.string().default(''),
  summary: z.string().min(1),
  language: languageSchema,
  keyPoints: z.array(z.string()).default([]),
  requestedFromUser: z.array(incomingRequestPointSchema).default([]),
  dates: z.array(z.string()).default([]),
  urgency: prioritySchema,
  needsReply: z.boolean().default(true),
  missingInformation: z.array(z.string()).default([]),
  clarifyingQuestions: z.array(z.string()).default([]),
})
export type IncomingAnalysis = z.infer<typeof incomingAnalysisSchema>

/* -------------------------------------------------------------------------- */
/* 4) إنشاء الرد — generateReply                                              */
/* -------------------------------------------------------------------------- */
export const coverageItemSchema = z.object({
  pointId: z.string().min(1),
  point: z.string().min(1),
  covered: z.boolean(),
  note: z.string().default(''),
})
export type CoverageItem = z.infer<typeof coverageItemSchema>

export const replyDraftSchema = z.object({
  language: languageSchema,
  variants: z.array(correspondenceVariantSchema).min(1),
  coverage: z.array(coverageItemSchema).default([]),
})
export type ReplyDraft = z.infer<typeof replyDraftSchema>

/* -------------------------------------------------------------------------- */
/* 5) تحسين نص — improveText                                                  */
/* -------------------------------------------------------------------------- */
export const improvedTextSchema = z.object({
  improved: z.string().min(1),
  changeSummary: z.array(z.string()).default([]),
  language: languageSchema,
})
export type ImprovedText = z.infer<typeof improvedTextSchema>

/* -------------------------------------------------------------------------- */
/* 6) الترجمة المؤسسية — translateCorporate                                   */
/* -------------------------------------------------------------------------- */
export const translationSchema = z.object({
  translated: z.string().min(1),
  targetLanguage: languageSchema,
  terminologyNotes: z.array(z.string()).default([]),
})
export type Translation = z.infer<typeof translationSchema>

/* -------------------------------------------------------------------------- */
/* 7) المراجعة قبل الإرسال — reviewBeforeSend                                 */
/* -------------------------------------------------------------------------- */
export const reviewCheckSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  status: z.enum(['pass', 'warn', 'fail']),
  detail: z.string().default(''),
})
export type ReviewCheck = z.infer<typeof reviewCheckSchema>

export const reviewResultSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  scores: z.object({
    clarity: z.number().int().min(0).max(100),
    formality: z.number().int().min(0).max(100),
    language: z.number().int().min(0).max(100),
    conciseness: z.number().int().min(0).max(100),
    completeness: z.number().int().min(0).max(100),
  }),
  verdict: z.enum(['ready', 'needs_review']),
  checks: z.array(reviewCheckSchema).default([]),
  suggestions: z.array(z.string()).default([]),
  coverage: z.array(coverageItemSchema).default([]),
})
export type ReviewResult = z.infer<typeof reviewResultSchema>

/* -------------------------------------------------------------------------- */
/* 8) وضع علّمني — tutorEvaluate / tutorExercise / explainPhrase              */
/* -------------------------------------------------------------------------- */
export const tutorExerciseSchema = z.object({
  scenario: z.string().min(1),
  expectedType: correspondenceTypeSchema,
  expectedTone: toneSchema,
  hints: z.array(z.string()).default([]),
})
export type TutorExercise = z.infer<typeof tutorExerciseSchema>

export const tutorEvaluationSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  criteria: z.object({
    subjectClarity: z.number().int().min(0).max(100),
    requestClarity: z.number().int().min(0).max(100),
    formality: z.number().int().min(0).max(100),
    language: z.number().int().min(0).max(100),
    conciseness: z.number().int().min(0).max(100),
    opening: z.number().int().min(0).max(100),
    closing: z.number().int().min(0).max(100),
    audienceFit: z.number().int().min(0).max(100),
  }),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  explanation: z.string().default(''),
  modelAnswer: z.string().min(1),
})
export type TutorEvaluation = z.infer<typeof tutorEvaluationSchema>

export const phraseExplanationSchema = z.object({
  phrase: z.string().min(1),
  meaning: z.string().min(1),
  whenToUse: z.string().min(1),
  whenNotToUse: z.string().min(1),
  alternatives: z.array(z.string()).default([]),
  example: z.string().default(''),
})
export type PhraseExplanation = z.infer<typeof phraseExplanationSchema>
