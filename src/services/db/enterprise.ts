/**
 * خدمات المراسلة المؤسسية — الوارد والصادر والإحالات والمرفقات والإشعارات.
 *
 * ⚠️ كل دالة تُنفَّذ بصلاحيات المستخدم عبر RLS. العمليات التي تحتاج فرضًا
 * لا تستطيع سياسة وحدها فرضه (إصدار رقم، إحالة، رد) تمر بإجراءات في القاعدة
 * لا بكتابة مباشرة — راجع docs/authorization.md.
 */
import { supabase } from '@/lib/supabase'
import type {
  Attachment,
  ClassificationLevel,
  Correspondence,
  CorrespondenceLink,
  Direction,
  AppNotification,
  Referral,
  ReferralInstruction,
  ReferenceNumberPolicy,
} from '@/types/database'

/* ------------------------- بيانات مرجعية للمؤسسة ------------------------- */

export async function listClassificationLevels(organizationId: string): Promise<ClassificationLevel[]> {
  const { data, error } = await supabase
    .from('classification_levels')
    .select('*')
    .eq('organization_id', organizationId)
    .order('rank', { ascending: true })
  if (error) throw error
  return (data ?? []) as ClassificationLevel[]
}

export async function listReferralInstructions(organizationId: string): Promise<ReferralInstruction[]> {
  const { data, error } = await supabase
    .from('referral_instructions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as ReferralInstruction[]
}

export async function getReferencePolicy(organizationId: string): Promise<ReferenceNumberPolicy | null> {
  const { data, error } = await supabase
    .from('reference_number_policies')
    .select('*')
    .eq('organization_id', organizationId)
    .is('direction', null)
    .maybeSingle()
  if (error) throw error
  return (data as ReferenceNumberPolicy) ?? null
}

/**
 * يضبط سياسة أرقام المراسلات.
 *
 * ⚠️ عبر RPC لا كتابةً مباشرة على الجدول: الدالة تتحقّق من الصيغة وتُسجّل
 * التغيير. وصيغة بلا `{SEQ}` تعطي كل مراسلات السنة الرقم نفسه — فالتحقق
 * ليس تجميلًا.
 */
export async function updateReferencePolicy(
  organizationId: string,
  patch: Pick<ReferenceNumberPolicy, 'format' | 'seq_padding' | 'reset_yearly' | 'per_unit' | 'per_direction'>,
): Promise<ReferenceNumberPolicy> {
  const { data, error } = await supabase.rpc('update_reference_policy', {
    p_organization_id: organizationId,
    p_format: patch.format,
    p_seq_padding: patch.seq_padding,
    p_reset_yearly: patch.reset_yearly,
    p_per_unit: patch.per_unit,
    p_per_direction: patch.per_direction,
  })
  if (error) throw error
  return data as ReferenceNumberPolicy
}

/** رموز المشكلات كما تعيدها القاعدة — تُترجم في الواجهة. */
export type ReferenceFormatProblem = string

/** يفحص الصيغة في القاعدة لا في المتصفح: مصدر الحقيقة واحد. */
export async function validateReferenceFormat(format: string): Promise<ReferenceFormatProblem[]> {
  const { data, error } = await supabase.rpc('validate_reference_format', { p_format: format })
  if (error) throw error
  return (data ?? []) as string[]
}

/** معاينة الصيغة دون استهلاك رقم من العدّاد. */
export async function previewReferenceFormat(format: string, padding: number): Promise<string> {
  const { data, error } = await supabase.rpc('preview_reference_format', {
    p_format: format,
    p_padding: padding,
  })
  if (error) throw error
  return (data as string) ?? ''
}

/* --------------------------- مستويات التصنيف --------------------------- */

export async function upsertClassificationLevel(input: {
  organizationId: string
  key: string
  nameAr: string
  nameEn: string
  isDefault: boolean
}): Promise<ClassificationLevel> {
  const { data, error } = await supabase.rpc('upsert_classification_level', {
    p_organization_id: input.organizationId,
    p_key: input.key,
    p_name_ar: input.nameAr,
    p_name_en: input.nameEn,
    p_is_default: input.isDefault,
  })
  if (error) throw error
  return data as ClassificationLevel
}

/**
 * يعيد ترتيب المستويات — الأول أدنى سرية والأخير أشدّها.
 *
 * ⚠️ تعديلُ صلاحيات لا تعديلَ عرض: خفضُ مستوى يكشف مراسلاتٍ كانت محجوبة.
 * القائمة تُرسل كاملة عن قصد؛ الترتيب الجزئي يترك رتبًا متصادمة.
 */
export async function reorderClassificationLevels(organizationId: string, keys: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_classification_levels', {
    p_organization_id: organizationId,
    p_keys: keys,
  })
  if (error) throw error
}

export async function deleteClassificationLevel(organizationId: string, key: string): Promise<void> {
  const { error } = await supabase.rpc('delete_classification_level', {
    p_organization_id: organizationId,
    p_key: key,
  })
  if (error) throw error
}

export interface ClassificationImpact {
  correspondence_count: number
  members_now: number
  members_after: number
}

/** أثر رتبةٍ جديدة قبل تنفيذها: كم مراسلة، وكم عضوًا قبل وبعد. */
export async function getClassificationImpact(
  organizationId: string,
  key: string,
  newRank: number,
): Promise<ClassificationImpact | null> {
  const { data, error } = await supabase.rpc('classification_impact', {
    p_organization_id: organizationId,
    p_key: key,
    p_new_rank: newRank,
  })
  if (error) throw error
  const rows = (data ?? []) as ClassificationImpact[]
  const row = rows[0]
  if (!row) return null
  // PostgREST يُسلسل bigint نصًّا — بلا تحويل تفشل كل مقارنة عددية بصمت.
  return {
    correspondence_count: Number(row.correspondence_count),
    members_now: Number(row.members_now),
    members_after: Number(row.members_after),
  }
}

/* ------------------------- الوارد والصادر ------------------------- */

export interface DirectionFilters {
  search?: string
  /** رقم المراسلة — الداخلي أو الخارجي. */
  reference?: string
  /** طرفٌ: مرسِل أو مستقبِل، شخصًا كان أو جهة. */
  party?: string
  status?: string
  classification?: string
  unitId?: string
  /** ISO. حدّ أدنى وأعلى لتاريخ الإنشاء. */
  from?: string
  to?: string
  overdueOnly?: boolean
  includeArchived?: boolean
}

const hasFilters = (filters: DirectionFilters) =>
  Boolean(
    filters.search ||
      filters.reference ||
      filters.party ||
      filters.status ||
      filters.classification ||
      filters.unitId ||
      filters.from ||
      filters.to ||
      filters.overdueOnly ||
      filters.includeArchived,
  )

/**
 * قائمة مراسلات باتجاه معيّن مع تصفية.
 *
 * البحث النصّي يمرّ بـ`search_correspondence` في القاعدة لا بـILIKE هنا:
 * التسوية العربية (التشكيل، التطويل، صور الألف والتاء المربوطة) لا تُجرى في
 * المتصفح — ما في القاعدة هو النص الأصلي، ولو سوّينا طرفًا واحدًا لما تطابقا.
 * الدالة `security invoker` فلا تتجاوز RLS بحال.
 */
export async function listByDirection(
  organizationId: string,
  direction: Direction,
  filters: DirectionFilters = {},
  limit = 50,
): Promise<Correspondence[]> {
  if (hasFilters(filters)) {
    const { data, error } = await supabase.rpc('search_correspondence', {
      p_organization_id: organizationId,
      p_direction: direction,
      p_query: filters.search ?? null,
      p_reference: filters.reference ?? null,
      p_party: filters.party ?? null,
      p_status: filters.status ?? null,
      p_classification: filters.classification ?? null,
      p_unit_id: filters.unitId ?? null,
      p_from: filters.from ?? null,
      p_to: filters.to ?? null,
      p_overdue_only: filters.overdueOnly ?? false,
      p_include_archived: filters.includeArchived ?? false,
      p_limit: limit,
    })
    if (error) throw error
    return (data ?? []) as Correspondence[]
  }

  const { data, error } = await supabase
    .from('correspondences')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('direction', direction)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Correspondence[]
}

/** تسجيل مراسلة واردة. المستخدم هو المسجِّل لا المُرسِل. */
export async function registerIncoming(input: {
  user_id: string
  organization_id: string
  owner_unit_id?: string | null
  subject: string
  body: string
  sender: string
  sender_organization?: string
  external_reference_number?: string
  received_at?: string
  due_at?: string | null
  classification_key?: string
  priority?: string
}): Promise<Correspondence> {
  const { data, error } = await supabase
    .from('correspondences')
    .insert({
      ...input,
      created_by: input.user_id,
      direction: 'incoming',
      current_status: 'draft',
      received_at: input.received_at ?? new Date().toISOString(),
      source: 'written',
    })
    .select('*')
    .single()
  if (error) throw error
  return data as Correspondence
}

/** يُصدر رقم المراسلة. ذرّي في القاعدة، ولا يُعاد إصداره لصفٍ يحمل رقمًا. */
export async function issueReferenceNumber(correspondenceId: string): Promise<string> {
  const { data, error } = await supabase.rpc('issue_reference_number', {
    p_correspondence_id: correspondenceId,
  })
  if (error) throw error
  return data as string
}

/* ------------------------------ الإحالات ------------------------------ */

export interface ReferralRow extends Referral {
  instruction: { name_ar: string; requires_response: boolean } | null
}

export async function listReferrals(correspondenceId: string): Promise<Referral[]> {
  const { data, error } = await supabase
    .from('referrals')
    .select('*')
    .eq('correspondence_id', correspondenceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Referral[]
}

/** الإحالات الموجّهة إليّ — «ما يتطلب إجراءً مني». */
export async function listMyReferrals(userId: string, unitId: string | null): Promise<Referral[]> {
  // الإحالة إما إليّ شخصيًا أو إلى وحدتي. RLS يحمي النتيجة على أي حال،
  // لكن التصفية هنا تُجنّب جلب ما لا يخصّني.
  const targets = [`to_user_id.eq.${userId}`]
  if (unitId) targets.push(`to_unit_id.eq.${unitId}`)

  const { data, error } = await supabase
    .from('referrals')
    .select('*')
    .or(targets.join(','))
    .neq('status', 'closed')
    .order('due_at', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as Referral[]
}

export async function createReferral(input: {
  correspondenceId: string
  instructionKey: string
  toUserId?: string | null
  toUnitId?: string | null
  note?: string
  dueAt?: string | null
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_referral', {
    p_correspondence_id: input.correspondenceId,
    p_instruction_key: input.instructionKey,
    p_to_user_id: input.toUserId ?? null,
    p_to_unit_id: input.toUnitId ?? null,
    p_note: input.note ?? '',
    p_due_at: input.dueAt ?? null,
  })
  if (error) throw error
  return data as string
}

export async function respondToReferral(
  referralId: string,
  status: 'acknowledged' | 'responded' | 'closed',
  response = '',
): Promise<void> {
  const { error } = await supabase.rpc('respond_to_referral', {
    p_referral_id: referralId,
    p_status: status,
    p_response: response,
  })
  if (error) throw error
}

/* ------------------------------ المرفقات ------------------------------ */

export const ATTACHMENT_BUCKET = 'correspondence-attachments'

/**
 * يرفع مرفقًا.
 *
 * الترتيب مقصود: يُدرج الصف أولًا ليُولّد المسار في القاعدة، ثم يُرفع الملف
 * إليه. العكس يعني تخمين المسار في العميل — والمسار عمود مُولَّد لا يقبل
 * الكتابة أصلًا.
 *
 * إن فشل الرفع بعد الإدراج نحذف الصف، فلا يبقى مرفق بلا ملف.
 */
export async function uploadAttachment(input: {
  correspondenceId: string
  organizationId: string | null
  file: File
  uploadedBy: string
  classificationKey?: string | null
}): Promise<Attachment> {
  const { data: row, error: insertError } = await supabase
    .from('attachments')
    .insert({
      correspondence_id: input.correspondenceId,
      organization_id: input.organizationId,
      filename: input.file.name,
      mime_type: input.file.type || 'application/octet-stream',
      size_bytes: input.file.size,
      uploaded_by: input.uploadedBy,
      classification_key: input.classificationKey ?? null,
    })
    .select('*')
    .single()
  if (insertError) throw insertError

  const attachment = row as Attachment
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .upload(attachment.storage_path, input.file, {
      contentType: attachment.mime_type,
      upsert: false,
    })

  if (uploadError) {
    await supabase.from('attachments').delete().eq('id', attachment.id)
    throw uploadError
  }

  return attachment
}

export async function listAttachments(correspondenceId: string): Promise<Attachment[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('*')
    .eq('correspondence_id', correspondenceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Attachment[]
}

/** رابط موقَّع قصير الأجل. لا رابط عام لمستند مؤسسي إطلاقًا. */
export async function getAttachmentUrl(storagePath: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds)
  if (error) throw error
  return data.signedUrl
}

export async function deleteAttachment(attachment: Attachment): Promise<void> {
  // الملف أولًا: لو حُذف الصف أولًا وفشل حذف الملف لبقي كائن يتيم بلا صاحب.
  const { error: storageError } = await supabase.storage
    .from(ATTACHMENT_BUCKET)
    .remove([attachment.storage_path])
  if (storageError) throw storageError

  const { error } = await supabase.from('attachments').delete().eq('id', attachment.id)
  if (error) throw error
}

/* ------------------------------ الروابط ------------------------------ */

export async function listLinks(correspondenceId: string): Promise<CorrespondenceLink[]> {
  const { data, error } = await supabase
    .from('correspondence_links')
    .select('*')
    .or(`from_id.eq.${correspondenceId},to_id.eq.${correspondenceId}`)
  if (error) throw error
  return (data ?? []) as CorrespondenceLink[]
}

export async function linkCorrespondence(
  fromId: string,
  toId: string,
  kind: CorrespondenceLink['kind'],
  createdBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('correspondence_links')
    .insert({ from_id: fromId, to_id: toId, kind, created_by: createdBy })
  if (error) throw error
}

/* ----------------------------- الإشعارات ----------------------------- */

export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as AppNotification[]
}

export async function markNotificationsRead(ids?: number[]): Promise<number> {
  const { data, error } = await supabase.rpc('mark_notifications_read', { p_ids: ids ?? null })
  if (error) throw error
  return (data as number) ?? 0
}
