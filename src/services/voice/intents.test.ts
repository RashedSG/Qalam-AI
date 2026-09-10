import { describe, expect, it } from 'vitest'
import { detectIntent, isSensitive, SENSITIVE_INTENTS } from './intents'

describe('الأوامر الحساسة لا تُنفَّذ بالصوت', () => {
  const cases: Array<[string, string]> = [
    ['اعتمد الكتاب', 'approve'],
    ['صدّق على المراسلة', 'approve'],
    ['approve this letter', 'approve'],
    ['وقّع الكتاب', 'sign'],
    ['sign it', 'sign'],
    ['أصدر المراسلة', 'issue'],
    ['ارفض الطلب', 'reject'],
    ['احذف هذي المراسلة', 'delete'],
    ['غيّر التصنيف إلى سري', 'classify'],
    ['امنح صلاحية للموظف', 'permissions'],
  ]

  it.each(cases)('«%s» تُصنَّف حساسة (%s)', (spoken, intent) => {
    const match = detectIntent(spoken)
    expect(match.kind).toBe('sensitive')
    expect(match.intent).toBe(intent)
    expect(isSensitive(spoken)).toBe(true)
  })

  it('كل نيّة حساسة ترد بجملة تشرح لماذا لم تُنفَّذ', () => {
    for (const [spoken] of cases) {
      const match = detectIntent(spoken)
      expect(match.spokenResponse, spoken).toBeTruthy()
      expect(match.spokenResponse!.length).toBeGreaterThan(10)
    }
  })

  it('لا نيّة حساسة تُترجم إلى فعل — التنقّل فقط أو لا شيء', () => {
    for (const [spoken] of cases) {
      const match = detectIntent(spoken)
      // المسار صفحة أو null. لا اسم إجراء ولا استدعاء.
      expect(match.path === null || match.path.startsWith('/'), spoken).toBe(true)
    }
  })

  it('الحذف وتغيير التصنيف لا يفتحان شاشة تنفيذ تلقائيًا', () => {
    // فتح شاشة الحذف بالصوت خطوة واحدة من الكارثة. المستخدم يذهب بنفسه.
    expect(detectIntent('احذف المراسلة').path).toBeNull()
    expect(detectIntent('غيّر التصنيف إلى سري').path).toBeNull()
  })

  it('الأمر الحساس يتقدّم حتى لو خالطه أمر عادي', () => {
    // «اعتمد ثم اكتب» يجب ألا تُبتلع فيها كلمة الاعتماد داخل نيّة الكتابة.
    const match = detectIntent('اعتمد الكتاب واكتب لي مراسلة جديدة')
    expect(match.kind).toBe('sensitive')
    expect(match.intent).toBe('approve')
  })

  it('كل النيّات الحساسة المعلنة مغطاة بقاعدة', () => {
    const covered = new Set(cases.map(([, intent]) => intent))
    for (const intent of SENSITIVE_INTENTS) {
      expect(covered, `النيّة ${intent} بلا اختبار`).toContain(intent)
    }
  })
})

describe('نيّات التنقّل', () => {
  it.each([
    ['اكتب لي كتاب لوزارة المالية', 'write', '/write'],
    ['سوّي لي مراسلة', 'write', '/write'],
    ['جهّز لي رد', 'reply', '/reply'],
    ['ودّني على الوارد', 'inbox', '/inbox'],
    ['اعرض الصادر', 'outbox', '/outbox'],
    ['شو المطلوب مني', 'my_work', '/my-work'],
  ])('«%s» → %s', (spoken, intent, path) => {
    const match = detectIntent(spoken)
    expect(match.kind).toBe('navigation')
    expect(match.intent).toBe(intent)
    expect(match.path).toBe(path)
  })
})

describe('ما ليس أمرًا', () => {
  it.each([
    'لخّص لي آخر كتاب وارد',
    'شو رأيك في هذي الصياغة',
    'ترجم هذا للإنجليزي',
    'ابحث عن المراسلات السابقة عن الميزانية',
  ])('«%s» ليست نيّة معروفة — تذهب للوكيل', (spoken) => {
    const match = detectIntent(spoken)
    expect(match.kind).toBe('none')
    expect(match.path).toBeNull()
  })

  it('النص الفارغ لا يُصنَّف', () => {
    for (const empty of ['', '   ', '\n']) {
      expect(detectIntent(empty).kind).toBe('none')
    }
  })

  it('لا يُصنَّف حساسًا ما ليس كذلك', () => {
    for (const safe of ['لخّص الكتاب', 'ابحث عن الميزانية', 'اقرأ الرد']) {
      expect(isSensitive(safe), safe).toBe(false)
    }
  })
})
