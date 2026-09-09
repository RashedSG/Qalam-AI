import type {
  CorrespondenceType,
  DepartmentKey,
  DictionaryCategory,
  Formality,
  ImproveAction,
  Language,
  LearningLevel,
  Priority,
  Tone,
  WritingStyle,
} from '../types/domain'

type Bilingual = { ar: string; en: string }

export const DEPARTMENT_LABELS: Record<DepartmentKey, Bilingual> = {
  executive: { ar: 'الإدارة العليا', en: 'Executive Management' },
  hr: { ar: 'الموارد البشرية', en: 'Human Resources' },
  finance: { ar: 'المالية', en: 'Finance' },
  procurement: { ar: 'المشتريات والعقود', en: 'Procurement & Contracts' },
  it: { ar: 'تقنية المعلومات', en: 'Information Technology' },
  technical: { ar: 'الشؤون الفنية', en: 'Technical Affairs' },
  maintenance: { ar: 'الصيانة', en: 'Maintenance' },
  projects: { ar: 'المشاريع', en: 'Projects' },
  assets: { ar: 'الأصول والمرافق', en: 'Assets & Facilities' },
  operations: { ar: 'العمليات', en: 'Operations' },
  legal: { ar: 'الشؤون القانونية', en: 'Legal Affairs' },
  communications: { ar: 'الاتصال المؤسسي', en: 'Corporate Communications' },
  other: { ar: 'أخرى', en: 'Other' },
}

export const CORRESPONDENCE_TYPE_LABELS: Record<CorrespondenceType, Bilingual> = {
  official_letter: { ar: 'خطاب رسمي', en: 'Official letter' },
  email: { ar: 'بريد إلكتروني', en: 'Email' },
  internal_memo: { ar: 'مذكرة داخلية', en: 'Internal memo' },
  circular: { ar: 'تعميم', en: 'Circular' },
  action_request: { ar: 'طلب إجراء', en: 'Action request' },
  info_request: { ar: 'طلب إفادة', en: 'Information request' },
  approval_request: { ar: 'طلب موافقة', en: 'Approval request' },
  follow_up: { ar: 'متابعة', en: 'Follow-up' },
  reminder: { ar: 'تذكير', en: 'Reminder' },
  formal_reply: { ar: 'رد رسمي', en: 'Formal reply' },
  appreciation: { ar: 'شكر وتقدير', en: 'Appreciation' },
  apology: { ar: 'اعتذار', en: 'Apology' },
  complaint: { ar: 'شكوى', en: 'Complaint' },
  invitation: { ar: 'دعوة', en: 'Invitation' },
  referral: { ar: 'إحالة', en: 'Referral' },
  statement: { ar: 'إفادة', en: 'Statement' },
  supplier_letter: { ar: 'مخاطبة مورد', en: 'Supplier letter' },
  external_entity_letter: { ar: 'مخاطبة جهة خارجية', en: 'External entity letter' },
}

export const TONE_LABELS: Record<Tone, Bilingual> = {
  formal: { ar: 'رسمية', en: 'Formal' },
  very_formal: { ar: 'رسمية جدًا', en: 'Very formal' },
  diplomatic: { ar: 'دبلوماسية', en: 'Diplomatic' },
  firm: { ar: 'حازمة', en: 'Firm' },
  friendly_corporate: { ar: 'ودية مؤسسية', en: 'Friendly corporate' },
  concise: { ar: 'مختصرة', en: 'Concise' },
  urgent: { ar: 'عاجلة', en: 'Urgent' },
}

export const PRIORITY_LABELS: Record<Priority, Bilingual> = {
  normal: { ar: 'عادية', en: 'Normal' },
  important: { ar: 'مهمة', en: 'Important' },
  urgent: { ar: 'عاجلة', en: 'Urgent' },
}

export const FORMALITY_LABELS: Record<Formality, Bilingual> = {
  standard: { ar: 'رسمية معتادة', en: 'Standard' },
  high: { ar: 'رسمية عالية', en: 'High' },
  highest: { ar: 'رسمية قصوى', en: 'Highest' },
}

export const LANGUAGE_LABELS: Record<Language, Bilingual> = {
  ar: { ar: 'العربية', en: 'Arabic' },
  en: { ar: 'الإنجليزية', en: 'English' },
}

export const LEARNING_LEVEL_LABELS: Record<LearningLevel, Bilingual> = {
  beginner: { ar: 'مبتدئ', en: 'Beginner' },
  intermediate: { ar: 'متوسط', en: 'Intermediate' },
  advanced: { ar: 'متقدم', en: 'Advanced' },
  professional: { ar: 'محترف', en: 'Professional' },
}

export const IMPROVE_ACTION_LABELS: Record<ImproveAction, Bilingual> = {
  proofread: { ar: 'تصحيح لغوي', en: 'Proofread' },
  more_formal: { ar: 'أكثر رسمية', en: 'More formal' },
  more_diplomatic: { ar: 'أكثر دبلوماسية', en: 'More diplomatic' },
  more_firm: { ar: 'أكثر حزمًا', en: 'More firm' },
  shorten: { ar: 'اختصار', en: 'Shorten' },
  simplify: { ar: 'تبسيط', en: 'Simplify' },
  clarify: { ar: 'تحسين الوضوح', en: 'Improve clarity' },
  full_rewrite: { ar: 'إعادة صياغة كاملة', en: 'Full rewrite' },
}

export const DICTIONARY_CATEGORY_LABELS: Record<DictionaryCategory, Bilingual> = {
  openings: { ar: 'افتتاحيات', en: 'Openings' },
  action_request: { ar: 'طلب إجراء', en: 'Action request' },
  info_request: { ar: 'طلب إفادة', en: 'Information request' },
  follow_up: { ar: 'متابعة', en: 'Follow-up' },
  reminder: { ar: 'تذكير', en: 'Reminder' },
  escalation: { ar: 'استعجال', en: 'Escalation' },
  appreciation: { ar: 'شكر', en: 'Appreciation' },
  apology: { ar: 'اعتذار', en: 'Apology' },
  referral: { ar: 'إحالة', en: 'Referral' },
  closings: { ar: 'خاتمة', en: 'Closings' },
  diplomatic: { ar: 'صياغات دبلوماسية', en: 'Diplomatic phrasing' },
  firm: { ar: 'صياغات حازمة', en: 'Firm phrasing' },
}

export const WRITING_STYLE_LABELS: Record<WritingStyle, Bilingual> = {
  balanced: { ar: 'متوازن', en: 'Balanced' },
  brief: { ar: 'مختصر', en: 'Brief' },
  detailed: { ar: 'مفصّل', en: 'Detailed' },
  diplomatic: { ar: 'دبلوماسي', en: 'Diplomatic' },
}

/** أداة مساعدة: يعيد التسمية حسب لغة الواجهة. */
export function label(map: Bilingual | undefined, lang: Language): string {
  if (!map) return ''
  return lang === 'ar' ? map.ar : map.en
}
