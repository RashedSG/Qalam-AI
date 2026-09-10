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

export async function updateReferencePolicy(
  id: string,
  patch: Partial<Pick<ReferenceNumberPolicy, 'format' | 'seq_padding' | 'reset_yearly' | 'per_unit' | 'per_direction'>>,
): Promise<ReferenceNumberPolicy> {
  const { data, error } = await supabase
    .from('reference_number_policies')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as ReferenceNumberPolicy
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

/* ------------------------- الوارد والصادر ------------------------- */

export interface DirectionFilters {
  search?: string
  status?: string
  classification?: string
  unitId?: string
  overdueOnly?: boolean
}

export async function listByDirection(
  organizationId: string,
  direction: Direction,
  filters: DirectionFilters = {},
  limit = 50,
): Promise<Correspondence[]> {
  let query = supabase
    .from('correspondences')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('direction', direction)
    .eq('is_archived', false)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.search) {
    const term = `%${filters.search}%`
    query = query.or(
      `subject.ilike.${term},body.ilike.${term},reference_number.ilike.${term},sender.ilike.${term}`,
    )
  }
  if (filters.status) query = query.eq('current_status', filters.status)
  if (filters.classification) query = query.eq('classification_key', filters.classification)
  if (filters.unitId) query = query.eq('owner_unit_id', filters.unitId)
  if (filters.overdueOnly) query = query.lt('due_at', new Date().toISOString())

  const { data, error } = await query
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
