/**
 * سير العمل: الانتقالات والتوقيع والتنقيح والتفويض.
 *
 * ⚠️ لا دالة هنا تُحدّث `current_status` بـ UPDATE. كل انتقال يمر بإجراء في
 * القاعدة يتحقق من الحالة والصلاحية والتصنيف وفصل المهام ثم يسجّل — وصلاحية
 * UPDATE على العمود مسحوبة من دور المتصفح أصلًا.
 */
import { supabase } from '@/lib/supabase'
import type {
  AvailableTransition,
  CorrespondenceStatus,
  CorrespondenceTransition,
  Delegation,
  Signature,
} from '@/types/database'
import type { PermissionKey } from '@/types/permissions'

/** الانتقالات المتاحة للمستخدم الآن — تُبنى منها أزرار الواجهة. */
export async function listAvailableTransitions(correspondenceId: string): Promise<AvailableTransition[]> {
  const { data, error } = await supabase.rpc('available_transitions', {
    p_correspondence_id: correspondenceId,
  })
  if (error) throw error
  return (data ?? []) as AvailableTransition[]
}

export async function transitionCorrespondence(
  correspondenceId: string,
  toStatus: CorrespondenceStatus,
  comment = '',
): Promise<CorrespondenceStatus> {
  const { data, error } = await supabase.rpc('transition_correspondence', {
    p_correspondence_id: correspondenceId,
    p_to_status: toStatus,
    p_comment: comment,
  })
  if (error) throw error
  return data as CorrespondenceStatus
}

/** التوقيع ينقل المراسلة إلى `signed` عبر نفس آلة الحالة ويسجّل بصمة النص. */
export async function signCorrespondence(correspondenceId: string, comment = ''): Promise<string> {
  const { data, error } = await supabase.rpc('sign_correspondence', {
    p_correspondence_id: correspondenceId,
    p_comment: comment,
  })
  if (error) throw error
  return data as string
}

/**
 * يفتح مراسلة معتمدة للتعديل: يحفظ المعتمد إصدارًا ويعيد الدورة إلى مسودة.
 * الطريق الوحيد — التعديل المباشر لنص معتمد مرفوض في القاعدة.
 */
export async function reviseCorrespondence(
  correspondenceId: string,
  subject: string,
  body: string,
  reason: string,
): Promise<void> {
  const { error } = await supabase.rpc('revise_correspondence', {
    p_correspondence_id: correspondenceId,
    p_subject: subject,
    p_body: body,
    p_reason: reason,
  })
  if (error) throw error
}

export async function listTransitions(correspondenceId: string): Promise<CorrespondenceTransition[]> {
  const { data, error } = await supabase
    .from('correspondence_transitions')
    .select('*')
    .eq('correspondence_id', correspondenceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CorrespondenceTransition[]
}

export async function listSignatures(correspondenceId: string): Promise<Signature[]> {
  const { data, error } = await supabase
    .from('signatures')
    .select('*')
    .eq('correspondence_id', correspondenceId)
    .order('signed_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Signature[]
}

/* ------------------------------ التفويض ------------------------------ */

export async function listDelegations(): Promise<Delegation[]> {
  // RLS تقصره على طرفيه ومن يملك users.manage.
  const { data, error } = await supabase
    .from('delegations')
    .select('*')
    .order('ends_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Delegation[]
}

export async function createDelegation(input: {
  delegateId: string
  permissions: PermissionKey[]
  endsAt: string
  scopeUnitId?: string | null
  startsAt?: string | null
  reason?: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_delegation', {
    p_delegate_id: input.delegateId,
    p_permissions: input.permissions,
    p_ends_at: input.endsAt,
    p_scope_unit_id: input.scopeUnitId ?? null,
    p_starts_at: input.startsAt ?? null,
    p_reason: input.reason ?? '',
  })
  if (error) throw error
  return data as string
}

export async function revokeDelegation(delegationId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_delegation', { p_delegation_id: delegationId })
  if (error) throw error
}

/** هل التفويض ساري الآن؟ يطابق شرط `delegated_scope` في القاعدة. */
export function isDelegationActive(delegation: Delegation, now = new Date()): boolean {
  if (delegation.revoked_at) return false
  return new Date(delegation.starts_at) <= now && new Date(delegation.ends_at) > now
}

/* --------------------------- صندوق العمل --------------------------- */

/** المراسلات التي تنتظر فعلًا من المستخدم في حالة بعينها. */
export async function listQueue(
  organizationId: string,
  statuses: CorrespondenceStatus[],
  limit = 50,
) {
  const { data, error } = await supabase
    .from('correspondences')
    .select('*')
    .eq('organization_id', organizationId)
    .in('current_status', statuses)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(limit)
  if (error) throw error
  return data ?? []
}
