/**
 * خدمات المؤسسة والهيكل والأعضاء والأدوار.
 *
 * ⚠️ كل دالة هنا تُنفَّذ بصلاحيات المستخدم عبر RLS. لا تُمرَّر أي هوية من
 * الواجهة، ولا تُستخدم مفاتيح إدارية. ما يعيده الاستعلام هو ما يسمح به
 * التفويض في قاعدة البيانات — لا أكثر.
 */
import { supabase } from '@/lib/supabase'
import type {
  AuditEntry,
  Membership,
  Organization,
  OrgUnit,
  Permission,
  Role,
  RolePermission,
} from '@/types/database'
import type { PermissionKey, Scope } from '@/types/permissions'

/* ------------------------------ المؤسسة ------------------------------ */

/** مؤسسة المستخدم الحالية. `null` يعني أنه لا ينتمي لأي مؤسسة نشطة. */
export async function getMyOrganization(): Promise<Organization | null> {
  const { data, error } = await supabase.from('organizations').select('*').limit(1).maybeSingle()
  if (error) throw error
  return (data as Organization) ?? null
}

export async function updateOrganization(
  id: string,
  patch: Partial<Pick<Organization, 'name' | 'name_en' | 'code' | 'settings' | 'branding'>>,
): Promise<Organization> {
  const { data, error } = await supabase
    .from('organizations')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Organization
}

/* --------------------------- الهيكل التنظيمي --------------------------- */

/** كل الوحدات المرئية، مرتّبة بالمسار فتأتي الشجرة جاهزة للعرض. */
export async function listOrgUnits(organizationId: string): Promise<OrgUnit[]> {
  const { data, error } = await supabase
    .from('org_units')
    .select('*')
    .eq('organization_id', organizationId)
    .order('path', { ascending: true })
  if (error) throw error
  return (data ?? []) as OrgUnit[]
}

export async function createOrgUnit(
  input: Pick<OrgUnit, 'organization_id' | 'name_ar'> & Partial<OrgUnit>,
): Promise<OrgUnit> {
  // path و depth يصونهما مُشغّل في القاعدة — لا تُرسل من هنا.
  const { path: _path, depth: _depth, ...safe } = input as Partial<OrgUnit>
  const { data, error } = await supabase.from('org_units').insert(safe).select('*').single()
  if (error) throw error
  return data as OrgUnit
}

export async function updateOrgUnit(
  id: string,
  patch: Partial<Pick<OrgUnit, 'name_ar' | 'name_en' | 'code' | 'kind' | 'parent_id' | 'is_active'>>,
): Promise<OrgUnit> {
  const { data, error } = await supabase.from('org_units').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as OrgUnit
}

export async function deleteOrgUnit(id: string): Promise<void> {
  const { error } = await supabase.from('org_units').delete().eq('id', id)
  if (error) throw error
}

/** عقدة شجرة جاهزة للعرض — تُبنى من `path` بلا استعلام إضافي. */
export interface OrgUnitNode extends OrgUnit {
  children: OrgUnitNode[]
}

export function buildOrgTree(units: OrgUnit[]): OrgUnitNode[] {
  const nodes = new Map<string, OrgUnitNode>()
  for (const unit of units) nodes.set(unit.id, { ...unit, children: [] })

  const roots: OrgUnitNode[] = []
  for (const unit of units) {
    const node = nodes.get(unit.id)!
    const parent = unit.parent_id ? nodes.get(unit.parent_id) : null
    // وحدة أبوها غير مرئي تُعرض كجذر بدل أن تختفي من الشجرة.
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/* ------------------------------ الأعضاء ------------------------------ */

export interface MemberRow extends Membership {
  profile: { full_name: string; email: string } | null
  roles: Array<{ id: string; key: string; name_ar: string }>
}

export async function listMembers(organizationId: string): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('*, profile:profiles!inner(full_name, email), membership_roles(role:roles(id, key, name_ar))')
    .eq('organization_id', organizationId)
    .order('joined_at', { ascending: true })
  if (error) throw error

  type Raw = Membership & {
    profile: { full_name: string; email: string } | null
    membership_roles: Array<{ role: { id: string; key: string; name_ar: string } | null }> | null
  }

  return ((data ?? []) as Raw[]).map((row) => ({
    ...row,
    profile: row.profile,
    roles: (row.membership_roles ?? []).flatMap((mr) => (mr.role ? [mr.role] : [])),
  }))
}

export async function updateMembership(
  id: string,
  patch: Partial<Pick<Membership, 'org_unit_id' | 'status' | 'job_title'>>,
): Promise<Membership> {
  const next =
    patch.status === 'inactive'
      ? { ...patch, deactivated_at: new Date().toISOString() }
      : patch.status
        ? { ...patch, deactivated_at: null }
        : patch

  const { data, error } = await supabase.from('memberships').update(next).eq('id', id).select('*').single()
  if (error) throw error
  return data as Membership
}

/* ------------------------- الأدوار والصلاحيات ------------------------- */

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await supabase
    .from('roles')
    .select('*')
    .order('is_system', { ascending: false })
    .order('key', { ascending: true })
  if (error) throw error
  return (data ?? []) as Role[]
}

export async function listPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase.from('permissions').select('*').order('category').order('key')
  if (error) throw error
  return (data ?? []) as Permission[]
}

export async function listRolePermissions(): Promise<RolePermission[]> {
  const { data, error } = await supabase.from('role_permissions').select('*')
  if (error) throw error
  return (data ?? []) as RolePermission[]
}

export async function grantRole(membershipId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('membership_roles')
    .insert({ membership_id: membershipId, role_id: roleId })
  if (error) throw error
}

export async function revokeRole(membershipId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('membership_roles')
    .delete()
    .eq('membership_id', membershipId)
    .eq('role_id', roleId)
  if (error) throw error
}

export async function setRolePermission(
  roleId: string,
  permissionKey: PermissionKey,
  scope: Scope,
): Promise<void> {
  const { error } = await supabase
    .from('role_permissions')
    .upsert({ role_id: roleId, permission_key: permissionKey, scope }, { onConflict: 'role_id,permission_key' })
  if (error) throw error
}

export async function removeRolePermission(roleId: string, permissionKey: PermissionKey): Promise<void> {
  const { error } = await supabase
    .from('role_permissions')
    .delete()
    .eq('role_id', roleId)
    .eq('permission_key', permissionKey)
  if (error) throw error
}

/* ---------------------------- سجل التدقيق ---------------------------- */

export interface AuditFilters {
  action?: string
  entityType?: string
  actorId?: string
  from?: string
  to?: string
}

export async function listAuditLog(
  organizationId: string,
  filters: AuditFilters = {},
  limit = 100,
): Promise<AuditEntry[]> {
  let query = supabase
    .from('audit_log')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.action) query = query.eq('action', filters.action)
  if (filters.entityType) query = query.eq('entity_type', filters.entityType)
  if (filters.actorId) query = query.eq('actor_id', filters.actorId)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as AuditEntry[]
}
