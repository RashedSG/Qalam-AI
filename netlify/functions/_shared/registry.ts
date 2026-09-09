/**
 * سجل المهام الخادمي: يربط كل مهمة AI ببانِي الـ Prompt ومخطط التحقق.
 * الواجهة لا ترى هذا الملف إطلاقًا — الـ prompts تبقى على الخادم.
 */
import { z } from 'zod'
import type { PromptSpec } from '../../../src/prompts/shared'
import { buildAnalyzeRequestPrompt } from '../../../src/prompts/analyzeRequest'
import { buildGenerateCorrespondencePrompt } from '../../../src/prompts/generateCorrespondence'
import { buildAnalyzeIncomingPrompt } from '../../../src/prompts/analyzeIncoming'
import { buildGenerateReplyPrompt } from '../../../src/prompts/generateReply'
import { buildImproveTextPrompt } from '../../../src/prompts/improveText'
import { buildTranslateCorporatePrompt } from '../../../src/prompts/translateCorporate'
import { buildReviewBeforeSendPrompt } from '../../../src/prompts/reviewBeforeSend'
import {
  buildExplainPhrasePrompt,
  buildTutorEvaluatePrompt,
  buildTutorExercisePrompt,
} from '../../../src/prompts/tutorEvaluate'
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
} from '../../../src/services/ai/schemas'
import {
  CORRESPONDENCE_TYPES,
  FORMALITY_LEVELS,
  IMPROVE_ACTIONS,
  LANGUAGES,
  LEARNING_LEVELS,
  PRIORITIES,
  TONES,
} from '../../../src/types/domain'

/* --------------------------- مخططات المدخلات --------------------------- */

const userContextSchema = z
  .object({
    fullName: z.string().max(120).optional(),
    department: z.string().max(120).optional(),
    jobTitle: z.string().max(120).optional(),
    writingStyle: z.string().max(60).optional(),
    preferredLanguage: z.enum(LANGUAGES).optional(),
  })
  .optional()

const analyzeRequestInput = z.object({
  idea: z.string().min(3).max(8000),
  language: z.enum(LANGUAGES).optional(),
  recipient: z.string().max(200).optional(),
  correspondenceType: z.union([z.enum(CORRESPONDENCE_TYPES), z.literal('')]).optional(),
  formality: z.union([z.enum(FORMALITY_LEVELS), z.literal('')]).optional(),
  priority: z.union([z.enum(PRIORITIES), z.literal('')]).optional(),
  userContext: userContextSchema,
})

const generateCorrespondenceInput = z.object({
  idea: z.string().min(1).max(8000),
  analysis: requestAnalysisSchema,
  userContext: userContextSchema,
})

const analyzeIncomingInput = z.object({
  incomingText: z.string().min(10).max(20000),
  replyLanguage: z.enum(LANGUAGES).optional(),
  userContext: userContextSchema,
})

const generateReplyInput = z.object({
  incomingText: z.string().min(1).max(20000),
  analysis: incomingAnalysisSchema,
  answers: z
    .array(z.object({ question: z.string().max(500), answer: z.string().max(3000) }))
    .max(20)
    .default([]),
  language: z.enum(LANGUAGES),
  tone: z.enum(TONES).optional(),
  userContext: userContextSchema,
})

const improveTextInput = z.object({
  text: z.string().min(5).max(20000),
  actions: z.array(z.enum(IMPROVE_ACTIONS)).min(1).max(8),
  language: z.enum(LANGUAGES).optional(),
})

const translateInput = z.object({
  text: z.string().min(2).max(20000),
  targetLanguage: z.enum(LANGUAGES),
})

const reviewInput = z.object({
  text: z.string().min(10).max(20000),
  language: z.enum(LANGUAGES).optional(),
  incomingAnalysis: incomingAnalysisSchema.nullable().optional(),
})

const tutorExerciseInput = z.object({
  level: z.enum(LEARNING_LEVELS),
  language: z.enum(LANGUAGES),
  department: z.string().max(120).optional(),
  recentScenarios: z.array(z.string().max(1000)).max(10).optional(),
})

const tutorEvaluateInput = z.object({
  scenario: z.string().min(5).max(4000),
  userAnswer: z.string().min(5).max(12000),
  level: z.enum(LEARNING_LEVELS),
  language: z.enum(LANGUAGES),
  expectedType: z.enum(CORRESPONDENCE_TYPES).optional(),
  expectedTone: z.enum(TONES).optional(),
})

const explainPhraseInput = z.object({
  phrase: z.string().min(2).max(300),
  language: z.enum(LANGUAGES),
})

/* ------------------------------- السجل -------------------------------- */

export interface TaskDefinition {
  inputSchema: z.ZodTypeAny
  outputSchema: z.ZodTypeAny
  build: (input: never) => PromptSpec
}

export const TASK_REGISTRY = {
  analyzeRequest: {
    inputSchema: analyzeRequestInput,
    outputSchema: requestAnalysisSchema,
    build: buildAnalyzeRequestPrompt,
  },
  generateCorrespondence: {
    inputSchema: generateCorrespondenceInput,
    outputSchema: correspondenceDraftSchema,
    build: buildGenerateCorrespondencePrompt,
  },
  analyzeIncoming: {
    inputSchema: analyzeIncomingInput,
    outputSchema: incomingAnalysisSchema,
    build: buildAnalyzeIncomingPrompt,
  },
  generateReply: {
    inputSchema: generateReplyInput,
    outputSchema: replyDraftSchema,
    build: buildGenerateReplyPrompt,
  },
  improveText: {
    inputSchema: improveTextInput,
    outputSchema: improvedTextSchema,
    build: buildImproveTextPrompt,
  },
  translateCorporate: {
    inputSchema: translateInput,
    outputSchema: translationSchema,
    build: buildTranslateCorporatePrompt,
  },
  reviewBeforeSend: {
    inputSchema: reviewInput,
    outputSchema: reviewResultSchema,
    build: buildReviewBeforeSendPrompt,
  },
  tutorExercise: {
    inputSchema: tutorExerciseInput,
    outputSchema: tutorExerciseSchema,
    build: buildTutorExercisePrompt,
  },
  tutorEvaluate: {
    inputSchema: tutorEvaluateInput,
    outputSchema: tutorEvaluationSchema,
    build: buildTutorEvaluatePrompt,
  },
  explainPhrase: {
    inputSchema: explainPhraseInput,
    outputSchema: phraseExplanationSchema,
    build: buildExplainPhrasePrompt,
  },
} as const satisfies Record<string, TaskDefinition>

export type TaskName = keyof typeof TASK_REGISTRY
export const TASK_NAMES = Object.keys(TASK_REGISTRY) as TaskName[]
