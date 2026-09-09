/** أنواع صفوف قاعدة البيانات (مكتوبة يدويًا لتطابق supabase/migrations). */
import type {
  CorrespondenceType,
  DepartmentKey,
  Language,
  LearningLevel,
  Priority,
  Tone,
  WritingStyle,
} from './domain'

export type Uuid = string
export type Timestamp = string

export type CorrespondenceSource = 'written' | 'reply' | 'improved' | 'translated' | 'template'
export type FavoriteKind = 'template' | 'phrase' | 'correspondence'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface Profile {
  id: Uuid
  organization_id: Uuid | null
  full_name: string
  email: string
  department_key: DepartmentKey | string | null
  department_custom: string | null
  job_title: string | null
  preferred_language: Language
  writing_style: WritingStyle | string
  onboarding_completed: boolean
  role: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface UserPreferences {
  user_id: Uuid
  ui_language: Language
  theme: ThemeMode
  default_tone: Tone | string
  default_correspondence_language: Language
  ai_suggest_tone: boolean
  save_history: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Department {
  id: Uuid
  organization_id: Uuid | null
  user_id: Uuid | null
  key: string | null
  name_ar: string
  name_en: string
  is_system: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Correspondence {
  id: Uuid
  user_id: Uuid
  organization_id: Uuid | null
  title: string
  subject: string
  body: string
  language: Language
  correspondence_type: CorrespondenceType | string
  tone: Tone | string
  priority: Priority
  recipient: string
  department_key: string | null
  source: CorrespondenceSource
  original_input: string | null
  analysis: unknown | null
  review: unknown | null
  is_archived: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface CorrespondenceVersion {
  id: Uuid
  correspondence_id: Uuid
  user_id: Uuid
  variant_kind: string
  subject: string
  body: string
  note: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Draft {
  id: Uuid
  user_id: Uuid
  organization_id: Uuid | null
  title: string
  subject: string
  body: string
  language: Language
  correspondence_type: CorrespondenceType | string
  recipient: string
  department_key: string | null
  original_input: string | null
  analysis: unknown | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Template {
  id: Uuid
  user_id: Uuid | null
  organization_id: Uuid | null
  slug: string | null
  title_ar: string
  title_en: string
  description_ar: string
  description_en: string
  body_ar: string
  body_en: string
  correspondence_type: CorrespondenceType | string
  tone: Tone | string
  is_system: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface DictionaryEntry {
  id: Uuid
  user_id: Uuid | null
  organization_id: Uuid | null
  category: string
  phrase: string
  meaning: string
  when_to_use: string
  when_not_to_use: string
  example: string
  alternatives: string[]
  language: Language
  is_system: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Favorite {
  id: Uuid
  user_id: Uuid
  kind: FavoriteKind
  ref_id: Uuid | null
  label: string
  content: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface LearningSession {
  id: Uuid
  user_id: Uuid
  level: LearningLevel
  language: Language
  scenario: string
  expected_type: string | null
  expected_tone: string | null
  user_answer: string
  score: number | null
  evaluation: unknown | null
  completed_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface LearningProgress {
  user_id: Uuid
  level: LearningLevel
  exercises_count: number
  average_score: number
  strengths: string[]
  improvements: string[]
  last_practiced_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}
