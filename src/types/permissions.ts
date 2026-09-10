/**
 * فهرس الصلاحيات — نسخة الواجهة من جدول `permissions`.
 *
 * ⚠️ هذا الملف لإخفاء ما لا يستطيع المستخدم فعله، **لا لمنعه**.
 * المنع الفعلي في PostgreSQL: RLS ودوال التفويض. إخفاء زر ليس تفويضًا،
 * ولو تلاعب أحد بحالة المتصفح فلن يمر شيء من قاعدة البيانات.
 */

export const PERMISSIONS = [
  'correspondence.create',
  'correspondence.view',
  'correspondence.edit',
  'correspondence.refer',
  'correspondence.review',
  'correspondence.return',
  'correspondence.approve',
  'correspondence.reject',
  'correspondence.sign',
  'correspondence.issue',
  'correspondence.archive',
  'correspondence.download',
  'correspondence.print',
  'attachment.view',
  'attachment.upload',
  'attachment.download',
  'audit.view',
  'users.manage',
  'roles.manage',
  'templates.manage',
  'organization.manage',
  'ai.use',
] as const

export type PermissionKey = (typeof PERMISSIONS)[number]

export const SCOPES = ['own', 'unit', 'descendants', 'organization'] as const
export type Scope = (typeof SCOPES)[number]

/** الأوسع يحتوي الأضيق — يطابق public.scope_rank في قاعدة البيانات. */
const SCOPE_RANK: Record<Scope, number> = {
  own: 1,
  unit: 2,
  descendants: 3,
  organization: 4,
}

export function scopeRank(scope: Scope): number {
  return SCOPE_RANK[scope]
}

/** هل يغطي `granted` ما يتطلبه `required`؟ */
export function scopeCovers(granted: Scope | null, required: Scope): boolean {
  if (!granted) return false
  return SCOPE_RANK[granted] >= SCOPE_RANK[required]
}

export const SYSTEM_ROLE_KEYS = [
  'system_admin',
  'organization_admin',
  'correspondence_officer',
  'executive_office',
  'manager',
  'reviewer',
  'approver',
  'signatory',
  'employee',
  'auditor',
  'viewer',
] as const

export type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number]
