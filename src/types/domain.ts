/**
 * قلم | QALAM — تعريفات نطاق العمل (Domain)
 * مصدر الحقيقة الوحيد لأنواع المراسلات والنبرات واللغات والأقسام.
 */

export const LANGUAGES = ['ar', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

export const CORRESPONDENCE_TYPES = [
  'official_letter',
  'email',
  'internal_memo',
  'circular',
  'action_request',
  'info_request',
  'approval_request',
  'follow_up',
  'reminder',
  'formal_reply',
  'appreciation',
  'apology',
  'complaint',
  'invitation',
  'referral',
  'statement',
  'supplier_letter',
  'external_entity_letter',
] as const
export type CorrespondenceType = (typeof CORRESPONDENCE_TYPES)[number]

export const TONES = [
  'formal',
  'very_formal',
  'diplomatic',
  'firm',
  'friendly_corporate',
  'concise',
  'urgent',
] as const
export type Tone = (typeof TONES)[number]

export const PRIORITIES = ['normal', 'important', 'urgent'] as const
export type Priority = (typeof PRIORITIES)[number]

export const FORMALITY_LEVELS = ['standard', 'high', 'highest'] as const
export type Formality = (typeof FORMALITY_LEVELS)[number]

export const LEARNING_LEVELS = ['beginner', 'intermediate', 'advanced', 'professional'] as const
export type LearningLevel = (typeof LEARNING_LEVELS)[number]

export const VARIANT_KINDS = ['recommended', 'concise', 'more_formal'] as const
export type VariantKind = (typeof VARIANT_KINDS)[number]

export const IMPROVE_ACTIONS = [
  'proofread',
  'more_formal',
  'more_diplomatic',
  'more_firm',
  'shorten',
  'simplify',
  'clarify',
  'full_rewrite',
] as const
export type ImproveAction = (typeof IMPROVE_ACTIONS)[number]

export const DICTIONARY_CATEGORIES = [
  'openings',
  'action_request',
  'info_request',
  'follow_up',
  'reminder',
  'escalation',
  'appreciation',
  'apology',
  'referral',
  'closings',
  'diplomatic',
  'firm',
] as const
export type DictionaryCategory = (typeof DICTIONARY_CATEGORIES)[number]

/** الأقسام الافتراضية — يمكن للمستخدم إضافة قسم مخصص. */
export const DEFAULT_DEPARTMENT_KEYS = [
  'executive',
  'hr',
  'finance',
  'procurement',
  'it',
  'technical',
  'maintenance',
  'projects',
  'assets',
  'operations',
  'legal',
  'communications',
  'other',
] as const
export type DepartmentKey = (typeof DEFAULT_DEPARTMENT_KEYS)[number]

export const WRITING_STYLES = ['balanced', 'brief', 'detailed', 'diplomatic'] as const
export type WritingStyle = (typeof WRITING_STYLES)[number]
