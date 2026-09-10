/**
 * قراءة صلاحيات المستخدم الحالي للواجهة.
 *
 * ⚠️ الغرض تحسين التجربة لا الحماية: تُخفي ما لا يستطيع المستخدم فعله فلا يرى
 * أزرارًا تفشل. المنع الفعلي في PostgreSQL (RLS + دوال التفويض). لو عدّل أحد
 * هذه النتيجة في متصفحه لم يتغيّر شيء — الاستعلام التالي سيُرفض في القاعدة.
 */
import { supabase } from '@/lib/supabase'
import type { Membership, Organization } from '@/types/database'
import type { PermissionKey, Scope } from '@/types/permissions'
import { scopeCovers } from '@/types/permissions'

export interface AuthorizationContext {
  organization: Organization | null
  membership: Membership | null
  /** الصلاحية ← أوسع نطاق ممنوح. مفتاح غائب = غير ممنوحة. */
  scopes: Partial<Record<PermissionKey, Scope>>
  roleKeys: string[]
}

export const EMPTY_AUTHORIZATION: AuthorizationContext = {
  organization: null,
  membership: null,
  scopes: {},
  roleKeys: [],
}

const SCOPE_RANK: Record<Scope, number> = { own: 1, unit: 2, descendants: 3, organization: 4 }

/**
 * يجمع المؤسسة والعضوية والصلاحيات في استدعاء واحد.
 *
 * المستخدم الذي لا ينتمي لمؤسسة نشطة يحصل على سياق فارغ — وهي الحالة الصحيحة
 * للتطبيق الشخصي: كل ما يعتمد على الملكية يعمل، وكل ما يعتمد على دور لا يظهر.
 */
export async function loadAuthorization(): Promise<AuthorizationContext> {
  const { data: orgRow, error: orgError } = await supabase
    .from('organizations')
    .select('*')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (orgError) throw orgError
  if (!orgRow) return EMPTY_AUTHORIZATION

  const organization = orgRow as Organization

  const { data: membershipRow, error: membershipError } = await supabase
    .from('memberships')
    .select('*, membership_roles(role:roles(key, role_permissions(permission_key, scope)))')
    .eq('organization_id', organization.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membershipRow) return { ...EMPTY_AUTHORIZATION, organization }

  type Raw = Membership & {
    membership_roles: Array<{
      role: { key: string; role_permissions: Array<{ permission_key: string; scope: Scope }> | null } | null
    }> | null
  }
  const raw = membershipRow as Raw

  const scopes: Partial<Record<PermissionKey, Scope>> = {}
  const roleKeys: string[] = []

  for (const entry of raw.membership_roles ?? []) {
    if (!entry.role) continue
    roleKeys.push(entry.role.key)
    for (const perm of entry.role.role_permissions ?? []) {
      const key = perm.permission_key as PermissionKey
      const current = scopes[key]
      // تعدد الأدوار يجمع: يُحتفظ بالأوسع، مطابقةً لـ permission_scope في القاعدة.
      if (!current || SCOPE_RANK[perm.scope] > SCOPE_RANK[current]) scopes[key] = perm.scope
    }
  }

  const { membership_roles: _roles, ...membership } = raw
  return { organization, membership: membership as Membership, scopes, roleKeys }
}

/** هل يملك المستخدم هذه الصلاحية بنطاق يكفي؟ */
export function can(
  context: AuthorizationContext,
  permission: PermissionKey,
  required: Scope = 'own',
): boolean {
  return scopeCovers(context.scopes[permission] ?? null, required)
}
