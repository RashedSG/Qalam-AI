import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Lock, ShieldCheck } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { listPermissions, listRolePermissions, listRoles } from '@/services/db/organization'
import type { PermissionScope } from '@/types/database'
import type { TranslationKey } from '@/i18n'

/** الأوسع نطاقًا يُلوَّن أبرز — النطاق هو المعلومة الأهم في هذه الشاشة. */
const SCOPE_TONE: Record<PermissionScope, 'gold' | 'neutral'> = {
  organization: 'gold',
  descendants: 'gold',
  unit: 'neutral',
  own: 'neutral',
}

export default function RolesPage() {
  const { t } = useI18n()
  const { organization } = useAuthorization()

  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles })
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: listPermissions })
  const rolePermissions = useQuery({ queryKey: ['role-permissions'], queryFn: listRolePermissions })

  const permissionName = useMemo(() => {
    const map = new Map<string, string>()
    for (const permission of permissions.data ?? []) map.set(permission.key, permission.name_ar)
    return map
  }, [permissions.data])

  const byRole = useMemo(() => {
    const map = new Map<string, Array<{ key: string; scope: PermissionScope }>>()
    for (const row of rolePermissions.data ?? []) {
      const list = map.get(row.role_id) ?? []
      list.push({ key: row.permission_key, scope: row.scope })
      map.set(row.role_id, list)
    }
    // ترتيب ثابت يجعل مقارنة دورين بالعين ممكنة.
    for (const list of map.values()) list.sort((a, b) => a.key.localeCompare(b.key))
    return map
  }, [rolePermissions.data])

  const isLoading = roles.isLoading || permissions.isLoading || rolePermissions.isLoading
  const isError = roles.isError || permissions.isError || rolePermissions.isError

  if (!organization) {
    return <Card><EmptyState title={t('org.none')} description={t('org.noneHint')} /></Card>
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('roles.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('roles.subtitle')}</p>
      </header>

      {isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => roles.refetch()} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (roles.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('roles.noPermissions')}
          />
        </Card>
      ) : (
        <ul className="space-y-4">
          {(roles.data ?? []).map((role) => {
            const granted = byRole.get(role.id) ?? []
            return (
              <li key={role.id}>
                <Card>
                  <CardBody>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold">{role.name_ar}</h2>
                      {role.is_system ? (
                        <Badge tone="neutral">
                          <Lock className="size-3" aria-hidden="true" />
                          {t('roles.system')}
                        </Badge>
                      ) : null}
                    </div>

                    {role.description_ar ? (
                      <p className="q-muted mb-3 text-sm leading-7">{role.description_ar}</p>
                    ) : null}

                    {granted.length === 0 ? (
                      <p className="q-muted text-xs">{t('roles.noPermissions')}</p>
                    ) : (
                      <ul className="grid gap-1.5 sm:grid-cols-2">
                        {granted.map((permission) => (
                          <li
                            key={permission.key}
                            className="flex items-center justify-between gap-2 rounded-lg bg-[rgb(var(--q-surface-2))] px-3 py-1.5"
                          >
                            <span className="min-w-0 truncate text-xs">
                              {permissionName.get(permission.key) ?? permission.key}
                            </span>
                            <Badge tone={SCOPE_TONE[permission.scope]}>
                              {t(`roles.scope.${permission.scope}` as TranslationKey)}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      <p className="q-muted text-xs leading-6">{t('roles.systemHint')}</p>
    </div>
  )
}
