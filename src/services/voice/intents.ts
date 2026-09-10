/**
 * تصنيف نيّة الأمر الصوتي.
 *
 * ⚠️ ما هذا الملف وما ليس هو:
 *
 * ليس حاجزًا أمنيًا. الحاجز الفعلي بنيوي: وكيل قلم بلا أدوات كتابة إطلاقًا،
 * فلا يستطيع اعتماد مراسلة ولا توقيعها ولا حذفها مهما فُهم الأمر. حتى لو فشل
 * كل ما هنا في التعرّف، لا يقع فعل.
 *
 * وظيفة هذا الملف تجربةٌ صادقة: حين يقول المستخدم «اعتمد الكتاب» يجب ألا يردّ
 * المساعد بكلام عام، بل يقول «سأفتح لك شاشة الاعتماد» ويفتحها. الفرق بين
 * مساعد يفهم وآخر يتهرّب.
 *
 * ⚠️ ولا يجوز أن يصبح هذا الملف مسارًا للتنفيذ: كل نيّة حساسة تُترجم إلى
 *    **تنقّل** لا إلى **فعل**. لا استدعاء إجراء ولا تغيير حالة.
 */

/** أفعال لا يجوز أن ينفّذها الصوت — تُفتح شاشتها ويُقرّر الإنسان. */
export const SENSITIVE_INTENTS = [
  'approve',
  'sign',
  'issue',
  'reject',
  'delete',
  'classify',
  'permissions',
] as const

export type SensitiveIntent = (typeof SENSITIVE_INTENTS)[number]

export type NavigationIntent = 'write' | 'reply' | 'inbox' | 'outbox' | 'my_work' | 'assistant'

export interface IntentMatch {
  kind: 'sensitive' | 'navigation' | 'none'
  intent: SensitiveIntent | NavigationIntent | null
  /** ما تقوله الواجهة للمستخدم قبل أن تفتح الشاشة. */
  spokenResponse: string | null
  /** المسار الذي يُفتح. null يعني «ابقَ مكانك». */
  path: string | null
}

/**
 * ⚠️ فخّ حقيقي: `\b` في JavaScript مُعرَّف على `[A-Za-z0-9_]` وحدها. الحروف
 * العربية ليست منها، فـ`/\baعتمد\b/` **لا تطابق** «اعتمد الكتاب» إطلاقًا.
 * البديل حدود واعية بـUnicode: نمنع أن يسبق التعبيرَ أو يليه حرفٌ من أي لغة.
 */
function word(...alternatives: string[]): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${alternatives.join('|')})(?!\\p{L})`, 'u')
}

/** نفس الفكرة لتعبير مركّب فيه مسافات أو مجموعات. */
function phrase(expression: string): RegExp {
  return new RegExp(`(?<!\\p{L})(?:${expression})`, 'u')
}

interface Rule {
  patterns: RegExp[]
  intent: SensitiveIntent | NavigationIntent
  kind: 'sensitive' | 'navigation'
  spoken: string
  path: string | null
}

/**
 * الأنماط تغطي الفصحى واللهجة الخليجية معًا: «اعتمد» و«وقّع» و«صدّق»،
 * و«سوّي» و«طلّع» و«جهّز» — كما يتكلم الناس لا كما تُكتب المراسلات.
 */
const RULES: Rule[] = [
  {
    intent: 'approve',
    kind: 'sensitive',
    patterns: [word('اعتمد', 'إعتمد', 'اعتماد', 'صادق', 'صدّق', 'صدق'), /\bapprove\b/i],
    spoken: 'الاعتماد قرارٌ لا أتخذه نيابةً عنك. سأفتح لك شاشة الاعتماد.',
    path: '/my-work',
  },
  {
    intent: 'sign',
    kind: 'sensitive',
    patterns: [word('وقّع', 'وقع', 'توقيع', 'التوقيع'), /\bsign\b/i],
    spoken: 'التوقيع باسمك لا أقوم به. سأفتح لك شاشة التوقيع.',
    path: '/my-work',
  },
  {
    intent: 'issue',
    kind: 'sensitive',
    patterns: [word('أصدر', 'اصدر', 'إصدار', 'صدّر'), /\bissue\b/i],
    spoken: 'الإصدار خطوة نهائية تحتاج تأكيدك. سأفتح لك الشاشة.',
    path: '/my-work',
  },
  {
    intent: 'reject',
    kind: 'sensitive',
    patterns: [word('ارفض', 'إرفض', 'رفض', 'أرجع', 'ارجع', 'إعادة'), /\breject\b/i],
    spoken: 'الرفض أو الإعادة قرارٌ يحتاج سببًا مكتوبًا. سأفتح لك الشاشة.',
    path: '/my-work',
  },
  {
    intent: 'delete',
    kind: 'sensitive',
    patterns: [word('احذف', 'إحذف', 'حذف', 'امسح', 'إمسح'), /\bdelete\b/i],
    spoken: 'الحذف لا يُلغى. افتح المراسلة واحذفها بنفسك إن أردت.',
    path: null,
  },
  {
    intent: 'classify',
    kind: 'sensitive',
    patterns: [phrase('(?:غيّر|غير)\\s+(?:التصنيف|السرية)'), phrase('تصنيف\\s+(?:سري|مقيّد)')],
    spoken: 'تغيير التصنيف الأمني لا أقوم به. عدّله من صفحة المراسلة.',
    path: null,
  },
  {
    intent: 'permissions',
    kind: 'sensitive',
    patterns: [phrase('(?:امنح|إمنح|منح)\\s+(?:صلاحية|صلاحيات|دور)'), phrase('صلاحيات?\\s+(?:المستخدم|الموظف)')],
    spoken: 'منح الصلاحيات لا أقوم به. سأفتح لك صفحة المستخدمين.',
    path: '/organization/users',
  },

  /* ----------------------- نيّات تنقّل غير حساسة ----------------------- */
  {
    intent: 'write',
    kind: 'navigation',
    patterns: [phrase('(?:اكتب|أكتب|سوّي|سوي|جهّز|جهز)\\s+(?:لي\\s+)?(?:كتاب|مراسلة|خطاب)')],
    spoken: 'سأفتح لك شاشة كتابة مراسلة.',
    path: '/write',
  },
  {
    intent: 'reply',
    kind: 'navigation',
    patterns: [phrase('(?:جهّز|جهز|اكتب|سوّي|سوي)\\s+(?:لي\\s+)?(?:رد|ردًا|الرد)'), phrase('رد\\s+على\\s+(?:الكتاب|المراسلة)')],
    spoken: 'سأفتح لك شاشة الرد.',
    path: '/reply',
  },
  {
    intent: 'inbox',
    kind: 'navigation',
    patterns: [word('الوارد', 'الواردة')],
    spoken: 'سأفتح لك الوارد.',
    path: '/inbox',
  },
  {
    intent: 'outbox',
    kind: 'navigation',
    patterns: [word('الصادر', 'الصادرة')],
    spoken: 'سأفتح لك الصادر.',
    path: '/outbox',
  },
  {
    intent: 'my_work',
    kind: 'navigation',
    patterns: [phrase('(?:شو|ما|وش)\\s+المطلوب'), word('مهامي'), phrase('صندوق\\s+عملي')],
    spoken: 'سأفتح لك صندوق عملك.',
    path: '/my-work',
  },
]

/**
 * يصنّف نصًا منطوقًا.
 *
 * الحساس يتقدّم على التنقّل عن قصد: «اعتمد الكتاب واكتب لي رد» تُعامل على أنها
 * طلب اعتماد فتُفتح شاشته، لا تُبتلع فيها الكلمة الخطرة داخل نيّة أخرى.
 */
export function detectIntent(spoken: string): IntentMatch {
  const text = (spoken ?? '').trim()
  if (!text) return { kind: 'none', intent: null, spokenResponse: null, path: null }

  for (const kind of ['sensitive', 'navigation'] as const) {
    for (const rule of RULES) {
      if (rule.kind !== kind) continue
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        return { kind, intent: rule.intent, spokenResponse: rule.spoken, path: rule.path }
      }
    }
  }

  return { kind: 'none', intent: null, spokenResponse: null, path: null }
}

/** هل يجب منع تنفيذ هذا الأمر بالصوت وحده؟ */
export function isSensitive(spoken: string): boolean {
  return detectIntent(spoken).kind === 'sensitive'
}
