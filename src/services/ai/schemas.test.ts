import { describe, expect, it } from 'vitest'
import {
  correspondenceDraftSchema,
  incomingAnalysisSchema,
  requestAnalysisSchema,
  reviewResultSchema,
  tutorEvaluationSchema,
} from './schemas'

describe('requestAnalysisSchema', () => {
  const valid = {
    recipientDepartment: 'الإدارة المالية',
    correspondenceType: 'follow_up',
    subject: 'متابعة طلب شراء أجهزة',
    tone: 'formal',
    priority: 'urgent',
    language: 'ar',
    intent: 'طلب استكمال الإجراء',
  }

  it('يقبل استجابة صحيحة ويملأ الحقول الاختيارية', () => {
    const parsed = requestAnalysisSchema.parse(valid)
    expect(parsed.keyPoints).toEqual([])
    expect(parsed.missingInformation).toEqual([])
    expect(parsed.deadline).toBe('')
    expect(parsed.recipientTitle).toBe('')
  })

  it('يرفض نوع مراسلة غير معروف', () => {
    expect(requestAnalysisSchema.safeParse({ ...valid, correspondenceType: 'telegram' }).success).toBe(false)
  })

  it('يرفض لغة غير مدعومة', () => {
    expect(requestAnalysisSchema.safeParse({ ...valid, language: 'fr' }).success).toBe(false)
  })

  it('يرفض موضوعًا فارغًا', () => {
    expect(requestAnalysisSchema.safeParse({ ...valid, subject: '' }).success).toBe(false)
  })
})

describe('correspondenceDraftSchema', () => {
  it('يتطلب صيغة واحدة على الأقل', () => {
    expect(correspondenceDraftSchema.safeParse({ language: 'ar', variants: [] }).success).toBe(false)
  })

  it('يقبل ثلاث صيغ صحيحة', () => {
    const result = correspondenceDraftSchema.safeParse({
      language: 'ar',
      variants: [
        { kind: 'recommended', subject: 'موضوع', body: 'نص' },
        { kind: 'concise', subject: 'موضوع', body: 'نص' },
        { kind: 'more_formal', subject: 'موضوع', body: 'نص' },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.variants[0].wordCount).toBe(0)
  })
})

describe('incomingAnalysisSchema', () => {
  it('يحافظ على معرفات النقاط المطلوبة', () => {
    const parsed = incomingAnalysisSchema.parse({
      summary: 'ملخص',
      language: 'ar',
      urgency: 'important',
      requestedFromUser: [{ id: 'p1', text: 'إفادة بحالة الطلب' }],
    })
    expect(parsed.requestedFromUser[0].id).toBe('p1')
    expect(parsed.requestedFromUser[0].requiresAnswer).toBe(true)
    expect(parsed.needsReply).toBe(true)
  })
})

describe('reviewResultSchema', () => {
  const base = {
    overallScore: 92,
    scores: { clarity: 95, formality: 94, language: 98, conciseness: 85, completeness: 88 },
    verdict: 'ready',
  }

  it('يقبل نتيجة مراجعة صحيحة', () => {
    expect(reviewResultSchema.safeParse(base).success).toBe(true)
  })

  it('يرفض درجة خارج النطاق 0–100', () => {
    expect(reviewResultSchema.safeParse({ ...base, overallScore: 120 }).success).toBe(false)
  })

  it('يرفض حكمًا غير معروف', () => {
    expect(reviewResultSchema.safeParse({ ...base, verdict: 'perfect' }).success).toBe(false)
  })
})

describe('tutorEvaluationSchema', () => {
  it('يتطلب صيغة نموذجية غير فارغة', () => {
    const criteria = {
      subjectClarity: 80, requestClarity: 80, formality: 80, language: 80,
      conciseness: 80, opening: 80, closing: 80, audienceFit: 80,
    }
    expect(tutorEvaluationSchema.safeParse({ overallScore: 80, criteria, modelAnswer: '' }).success).toBe(false)
    expect(tutorEvaluationSchema.safeParse({ overallScore: 80, criteria, modelAnswer: 'نص' }).success).toBe(true)
  })
})
