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

  /* المرحلة ٣ — الحقول المؤسسية. اختيارية: لا يستخدمها الوضع الشخصي. */
  /** من أين إلى أين. مستقل عن `source` الذي يصف كيف أُنشئت المراسلة. */
  direction?: Direction
  current_status?: CorrespondenceStatus
  /** يُصدره issue_reference_number() وحده — لا يُكتب من التطبيق. */
  reference_number?: string | null
  external_reference_number?: string | null
  sender?: string
  sender_organization?: string
  recipient_organization?: string
  classification_key?: string | null
  received_at?: Timestamp | null
  issued_at?: Timestamp | null
  due_at?: Timestamp | null
  created_by?: Uuid | null
  /** الوحدة المالكة. null = ارجع إلى وحدة المالك. */
  owner_unit_id?: Uuid | null
  parent_id?: Uuid | null

  /* المرحلة ٧. */
  /** رمز التحقق العلني. تولّده القاعدة عند الإصدار — لا يُكتب من التطبيق. */
  verification_token?: string | null
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

  /* المرحلة ٧ — حوكمة القوالب المؤسسية. القوالب الشخصية تبقى 'draft'. */
  status?: TemplateStatus
  published_at?: Timestamp | null
  published_by?: Uuid | null
  retired_at?: Timestamp | null
}

export type TemplateStatus = 'draft' | 'in_review' | 'approved' | 'published' | 'retired'

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

/* ============================================================================
 * المرحلة ٢ — المؤسسات والأدوار والصلاحيات
 * ========================================================================== */

export type OrganizationStatus = 'active' | 'suspended' | 'archived'
export type MembershipStatus = 'invited' | 'active' | 'inactive'
export type OrgUnitKind = 'organization' | 'sector' | 'department' | 'section' | 'unit'
/** ترتيب الاتساع: own ⊂ unit ⊂ descendants ⊂ organization */
export type PermissionScope = 'own' | 'unit' | 'descendants' | 'organization'

export interface Organization {
  id: Uuid
  name: string
  name_en: string
  code: string | null
  status: OrganizationStatus
  settings: Record<string, unknown>
  branding: Record<string, unknown>
  created_at: Timestamp
  updated_at: Timestamp
}

export interface OrgUnit {
  id: Uuid
  organization_id: Uuid
  parent_id: Uuid | null
  code: string | null
  name_ar: string
  name_en: string
  kind: OrgUnitKind
  /** مسار مادي يُصان بمُشغّل: '/root/parent/self'. لا يُكتب من التطبيق. */
  path: string
  depth: number
  is_active: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Permission {
  key: string
  category: string
  name_ar: string
  name_en: string
}

export interface Role {
  id: Uuid
  organization_id: Uuid | null
  key: string
  name_ar: string
  name_en: string
  description_ar: string
  is_system: boolean
  created_at: Timestamp
  updated_at: Timestamp
}

export interface RolePermission {
  role_id: Uuid
  permission_key: string
  scope: PermissionScope
}

export interface Membership {
  id: Uuid
  organization_id: Uuid
  user_id: Uuid
  org_unit_id: Uuid | null
  status: MembershipStatus
  job_title: string
  invited_by: Uuid | null
  joined_at: Timestamp
  deactivated_at: Timestamp | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface AuditEntry {
  id: number
  organization_id: Uuid | null
  actor_id: Uuid | null
  action: string
  entity_type: string
  entity_id: Uuid | null
  previous_status: string | null
  new_status: string | null
  metadata: Record<string, unknown>
  created_at: Timestamp
}

/* ============================================================================
 * المرحلة ٣ — المراسلة المؤسسية
 * ========================================================================== */

export type Direction = 'incoming' | 'outgoing' | 'internal'
export type CorrespondenceStatus =
  | 'draft' | 'in_review' | 'returned' | 'in_approval'
  | 'approved' | 'signed' | 'issued' | 'closed' | 'archived'
/** بترتيب دورة الحياة — تعتمد عليه قوائم التصفية. */
export const CORRESPONDENCE_STATUSES: readonly CorrespondenceStatus[] = [
  'draft', 'in_review', 'returned', 'in_approval',
  'approved', 'signed', 'issued', 'closed', 'archived',
]

export type ReferralStatus = 'pending' | 'acknowledged' | 'responded' | 'closed'
export type LinkKind = 'related' | 'supersedes' | 'reference'
export type NotificationKind =
  | 'referral.received' | 'referral.responded' | 'referral.overdue'
  | 'correspondence.returned' | 'correspondence.approved'

export interface ClassificationLevel {
  id: Uuid
  organization_id: Uuid
  key: string
  name_ar: string
  name_en: string
  /** الأعلى أكثر سرية. يجب أن يساويه تخليص العضو أو يزيد. */
  rank: number
  is_default: boolean
}

export interface ReferralInstruction {
  id: Uuid
  organization_id: Uuid
  key: string
  name_ar: string
  name_en: string
  requires_response: boolean
  sort_order: number
  is_active: boolean
}

export interface ReferenceNumberPolicy {
  id: Uuid
  organization_id: Uuid
  direction: Direction | null
  format: string
  seq_padding: number
  reset_yearly: boolean
  per_unit: boolean
  per_direction: boolean
  is_active: boolean
}

export interface Referral {
  id: Uuid
  correspondence_id: Uuid
  organization_id: Uuid
  from_user_id: Uuid
  to_user_id: Uuid | null
  to_unit_id: Uuid | null
  instruction_key: string
  note: string
  due_at: Timestamp | null
  status: ReferralStatus
  response: string
  responded_at: Timestamp | null
  responded_by: Uuid | null
  created_at: Timestamp
  updated_at: Timestamp
}

export interface Attachment {
  id: Uuid
  correspondence_id: Uuid
  organization_id: Uuid | null
  /** عمود مُولَّد — لا يُكتب من التطبيق. يُقرأ بعد الإدراج ثم يُرفع الملف إليه. */
  storage_path: string
  filename: string
  mime_type: string
  size_bytes: number
  checksum: string | null
  classification_key: string | null
  uploaded_by: Uuid
  created_at: Timestamp
}

export interface CorrespondenceLink {
  id: Uuid
  from_id: Uuid
  to_id: Uuid
  kind: LinkKind
  created_by: Uuid | null
  created_at: Timestamp
}

export interface AppNotification {
  id: number
  user_id: Uuid
  organization_id: Uuid | null
  kind: NotificationKind
  entity_type: string
  entity_id: Uuid | null
  read_at: Timestamp | null
  created_at: Timestamp
}

/* ============================================================================
 * المرحلة ٤ — سير العمل والتفويض
 * ========================================================================== */

export interface WorkflowTransitionRule {
  id: Uuid
  organization_id: Uuid | null
  from_status: CorrespondenceStatus
  to_status: CorrespondenceStatus
  required_permission: string
  requires_comment: boolean
  label_ar: string
  label_en: string
  sort_order: number
  is_active: boolean
}

/** انتقال متاح للمستخدم الآن — ما تعيده `available_transitions`. */
export interface AvailableTransition {
  to_status: CorrespondenceStatus
  label_ar: string
  label_en: string
  requires_comment: boolean
  sort_order: number
}

export interface CorrespondenceTransition {
  id: Uuid
  correspondence_id: Uuid
  organization_id: Uuid | null
  actor_id: Uuid
  from_status: CorrespondenceStatus
  to_status: CorrespondenceStatus
  comment: string
  version_id: Uuid | null
  created_at: Timestamp
}

export interface Signature {
  id: Uuid
  correspondence_id: Uuid
  organization_id: Uuid | null
  signer_id: Uuid
  /** 'internal_workflow' اليوم — ليس توقيعًا رقميًا مؤهَّلًا قانونيًا. */
  method: 'internal_workflow' | 'external_provider'
  provider: string | null
  provider_ref: string | null
  /** بصمة ما وُقّع عليه فعلًا. */
  content_hash: string | null
  signed_at: Timestamp
}

export interface Delegation {
  id: Uuid
  organization_id: Uuid
  delegator_id: Uuid
  delegate_id: Uuid
  starts_at: Timestamp
  ends_at: Timestamp
  scope_unit_id: Uuid | null
  reason: string
  revoked_at: Timestamp | null
  revoked_by: Uuid | null
  created_at: Timestamp
}
