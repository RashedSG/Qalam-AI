import { describe, expect, it } from 'vitest'
import { buildAnalyzeRequestPrompt } from './analyzeRequest'
import { buildGenerateCorrespondencePrompt } from './generateCorrespondence'
import { buildAnalyzeIncomingPrompt } from './analyzeIncoming'
import { buildGenerateReplyPrompt } from './generateReply'
import { buildImproveTextPrompt } from './improveText'
import { buildTranslateCorporatePrompt } from './translateCorporate'
import { buildReviewBeforeSendPrompt, REVIEW_CHECK_KEYS } from './reviewBeforeSend'
import { buildTutorEvaluatePrompt, buildTutorExercisePrompt } from './tutorEvaluate'
import { clampText } from './shared'

describe('buildAnalyzeRequestPrompt', () => {
  it('يضمّن فكرة المستخدم ويطلب JSON', () => {
    const spec = buildAnalyzeRequestPrompt({ idea: 'متابعة طلب متأخر مع المالية', language: 'ar' })
    expect(spec.user).toContain('متابعة طلب متأخر مع المالية')
    expect(spec.json).toBe(true)
    expect(spec.system).toContain('JSON')
  })

  it('يستخدم حرارة منخفضة للتحليل', () => {
    const spec = buildAnalyzeRequestPrompt({ idea: 'نص كافٍ للتحليل' })
    expect(spec.temperature).toBeLessThanOrEqual(0.3)
  })

  it('يمرر القيود المحددة من المستخدم', () => {
    const spec = buildAnalyzeRequestPrompt({
      idea: 'فكرة',
      recipient: 'الإدارة المالية',
      correspondenceType: 'follow_up',
      priority: 'urgent',
    })
    expect(spec.user).toContain('الإدارة المالية')
    expect(spec.user).toContain('follow_up')
    expect(spec.user).toContain('urgent')
  })
})

describe('buildGenerateCorrespondencePrompt', () => {
  const analysis = {
    recipientDepartment: 'الإدارة المالية',
    recipientTitle: '',
    correspondenceType: 'follow_up' as const,
    subject: 'متابعة طلب',
    tone: 'formal' as const,
    priority: 'urgent' as const,
    language: 'ar' as const,
    intent: 'استكمال الإجراء',
    keyPoints: ['رقم الطلب', 'الموعد'],
    deadline: 'الخميس',
    missingInformation: [],
  }

  it('يفرض اختلافًا حقيقيًا بين الصيغ الثلاث', () => {
    const spec = buildGenerateCorrespondencePrompt({ idea: 'فكرة', analysis })
    expect(spec.system).toContain('recommended')
    expect(spec.system).toContain('concise')
    expect(spec.system).toContain('more_formal')
    // نطاقات طول مختلفة صراحة
    expect(spec.system).toMatch(/٤٠–٧٠/)
    expect(spec.system).toMatch(/١٨٠–٢٦٠/)
  })

  it('ينقل كل عناصر التحليل المعتمدة', () => {
    const spec = buildGenerateCorrespondencePrompt({ idea: 'فكرة', analysis })
    expect(spec.user).toContain('الإدارة المالية')
    expect(spec.user).toContain('رقم الطلب')
    expect(spec.user).toContain('الخميس')
  })

  it('يمنع اختراع المعلومات', () => {
    const spec = buildGenerateCorrespondencePrompt({ idea: 'فكرة', analysis })
    expect(spec.system).toContain('ولا تخترعها')
  })
})

describe('buildAnalyzeIncomingPrompt', () => {
  it('يطلب معرفات ثابتة للنقاط', () => {
    const spec = buildAnalyzeIncomingPrompt({ incomingText: 'مراسلة واردة تحتاج ردًا' })
    expect(spec.system).toContain('"p1", "p2", "p3"')
    expect(spec.system).toContain('clarifyingQuestions')
  })
})

describe('buildGenerateReplyPrompt', () => {
  const analysis = {
    senderName: 'أحمد',
    senderEntity: 'إدارة المشتريات',
    subject: 'طلب إفادة',
    summary: 'ملخص',
    language: 'ar' as const,
    keyPoints: [],
    requestedFromUser: [
      { id: 'p1', text: 'حالة الطلب', dueDate: '', requiresAnswer: true },
      { id: 'p2', text: 'موعد التوريد', dueDate: '15 سبتمبر', requiresAnswer: true },
    ],
    dates: [],
    urgency: 'important' as const,
    needsReply: true,
    missingInformation: [],
    clarifyingQuestions: ['ما حالة الطلب؟'],
  }

  it('يُلزم بتغطية كل نقطة', () => {
    const spec = buildGenerateReplyPrompt({
      incomingText: 'نص',
      analysis,
      answers: [{ question: 'ما حالة الطلب؟', answer: 'قيد الاعتماد' }],
      language: 'ar',
    })
    expect(spec.user).toContain('[p1]')
    expect(spec.user).toContain('[p2]')
    expect(spec.user).toContain('قيد الاعتماد')
    expect(spec.system).toContain('coverage')
  })

  it('يمنع الالتزامات غير المصرح بها', () => {
    const spec = buildGenerateReplyPrompt({ incomingText: 'نص', analysis, answers: [], language: 'ar' })
    expect(spec.system).toContain('لا تلتزم بأي وعد')
    expect(spec.user).toContain('لم يقدّم المستخدم معلومات إضافية')
  })
})

describe('buildImproveTextPrompt', () => {
  it('يطبّق قاعدة كل إجراء مطلوب', () => {
    const spec = buildImproveTextPrompt({ text: 'نص المراسلة', actions: ['shorten', 'more_firm'] })
    expect(spec.system).toContain('٤٠٪')
    expect(spec.system).toContain('الحزم')
  })

  it('يعود إلى التصحيح اللغوي عند غياب الإجراءات', () => {
    const spec = buildImproveTextPrompt({ text: 'نص', actions: [] })
    expect(spec.system).toContain('صحّح الأخطاء الإملائية')
  })
})

describe('buildTranslateCorporatePrompt', () => {
  it('يرفض الترجمة الحرفية', () => {
    const spec = buildTranslateCorporatePrompt({ text: 'Kindly be informed', targetLanguage: 'ar' })
    expect(spec.system).toContain('لا مترجم حرفي')
    expect(spec.system).toContain('نفيدكم علمًا')
    expect(spec.user).toContain('Kindly be informed')
  })
})

describe('buildReviewBeforeSendPrompt', () => {
  it('يشمل كل الفحوص الإلزامية', () => {
    const spec = buildReviewBeforeSendPrompt({ text: 'نص المراسلة المراد مراجعتها' })
    for (const key of REVIEW_CHECK_KEYS) {
      expect(spec.system).toContain(key)
    }
  })

  it('ينفي أي ضمان قانوني', () => {
    const spec = buildReviewBeforeSendPrompt({ text: 'نص' })
    expect(spec.system).toContain('ليست مراجعة قانونية')
  })

  it('يطلب coverage فقط عند وجود مراسلة واردة', () => {
    const withoutIncoming = buildReviewBeforeSendPrompt({ text: 'نص' })
    expect(withoutIncoming.user).toContain('اترك "coverage" مصفوفة فارغة')

    const withIncoming = buildReviewBeforeSendPrompt({
      text: 'نص',
      incomingAnalysis: {
        senderName: '', senderEntity: '', subject: '', summary: 'ملخص', language: 'ar',
        keyPoints: [], dates: [], urgency: 'normal', needsReply: true,
        missingInformation: [], clarifyingQuestions: [],
        requestedFromUser: [{ id: 'p1', text: 'نقطة', dueDate: '', requiresAnswer: true }],
      },
    })
    expect(withIncoming.user).toContain('[p1]')
  })
})

describe('tutor prompts', () => {
  it('لا يكشف الحل داخل التمرين', () => {
    const spec = buildTutorExercisePrompt({ level: 'intermediate', language: 'ar' })
    expect(spec.system).toContain('لا تذكر الحل ولا الصيغة النموذجية إطلاقًا')
  })

  it('يقيّم على المعايير الثمانية', () => {
    const spec = buildTutorEvaluatePrompt({
      scenario: 'موقف تدريبي',
      userAnswer: 'إجابة المتدرب',
      level: 'advanced',
      language: 'ar',
    })
    for (const key of [
      'subjectClarity', 'requestClarity', 'formality', 'language',
      'conciseness', 'opening', 'closing', 'audienceFit',
    ]) {
      expect(spec.system).toContain(key)
    }
    expect(spec.user).toContain('إجابة المتدرب')
  })
})

describe('clampText', () => {
  it('يترك النص القصير كما هو', () => {
    expect(clampText('نص قصير', 100)).toBe('نص قصير')
  })

  it('يختصر النص الطويل مع الإبقاء على البداية والنهاية', () => {
    const long = `${'أ'.repeat(500)}النهاية`
    const result = clampText(long, 100)
    expect(result.length).toBeLessThan(long.length)
    expect(result).toContain('تم اختصار جزء من النص')
    expect(result).toContain('النهاية')
  })
})
