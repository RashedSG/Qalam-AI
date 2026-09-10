import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ShieldCheck, Users } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import {
  grantRole,
  listMembers,
  listOrgUnits,
  listRoles,
  revokeRole,
  updateMembership,
  type MemberRow,
} from '@/services/db/organization'
import type { MembershipStatus } from '@/types/database'
import type { TranslationKey } from '@/i18n'

const STATUS_TONE: Record<MembershipStatus, 'gold' | 'neutral'> = {
  active: 'gold',
  invited: 'neutral',
  inactive: 'neutral',
}

export default function UsersPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, can } = useAuthorization()
  const orgId = organization?.id

  const [rolesFor, setRolesFor] = useState<MemberRow | null>(null)

  const members = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => listMembers(orgId!),
    enabled: Boolean(orgId),
  })
  const units = useQuery({
    queryKey: ['org-units', orgId],
    queryFn: () => listOrgUnits(orgId!),
    enabled: Boolean(orgId),
  })
  const roles = useQuery({ queryKey: ['roles'], queryFn: listRoles })

  const canManageRoles = can('roles.manage', 'organization')

  const refreshMembers = async () => {
    await queryClient.invalidateQueries({ queryKey: ['members', orgId] })
    // قد يكون المستخدم غيّر أدوار نفسه — نُحدّث سياق تفويضه أيضًا.
    await queryClient.invalidateQueries({ queryKey: ['authorization'] })
  }

  const patchMember = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; org_unit_id?: string | null; status?: MembershipStatus }) =>
      updateMembership(id, patch),
    onSuccess: async () => {
      await refreshMembers()
      toast(t('common.saved'), 'success')
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  const toggleRole = useMutation({
    mutationFn: ({ membershipId, roleId, grant }: { membershipId: string; roleId: string; grant: boolean }) =>
      grant ? grantRole(membershipId, roleId) : revokeRole(membershipId, roleId),
    onSuccess: async () => {
      await refreshMembers()
      const fresh = (await queryClient.getQueryData<MemberRow[]>(['members', orgId])) ?? []
      setRolesFor((prev) => (prev ? (fresh.find((m) => m.id === prev.id) ?? prev) : prev))
      toast(t('common.saved'), 'success')
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  if (!orgId) return <Card><EmptyState title={t('org.none')} description={t('org.noneHint')} /></Card>

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('users.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('users.subtitle')}</p>
      </header>

      {members.isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => members.refetch()} /> : null}

      {members.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (members.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('users.empty')}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {(members.data ?? []).map((member) => (
            <li key={member.id}>
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {member.profile?.full_name || member.profile?.email || '—'}
                        {member.user_id === user?.id ? (
                          <span className="q-muted ms-2 text-xs">({t('users.you')})</span>
                        ) : null}
                      </p>
                      <p className="q-muted truncate text-xs" dir="ltr">
                        {member.profile?.email}
                      </p>
                    </div>
                    <Badge tone={STATUS_TONE[member.status]}>
                      {t(`users.status.${member.status}` as TranslationKey)}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {member.roles.length === 0 ? (
                      <span className="q-muted text-xs">{t('users.noRoles')}</span>
                    ) : (
                      member.roles.map((role) => (
                        <Badge key={role.id} tone="neutral">
                          {role.name_ar}
                        </Badge>
                      ))
                    )}
                  </div>

                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex-1 text-xs">
                      <span className="q-muted mb-1 block font-semibold">{t('users.unit')}</span>
                      <Select
                        value={member.org_unit_id ?? ''}
                        onChange={(e) =>
                          patchMember.mutate({ id: member.id, org_unit_id: e.target.value || null })
                        }
                      >
                        <option value="">—</option>
                        {(units.data ?? []).map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {'— '.repeat(unit.depth)}
                            {unit.name_ar}
                          </option>
                        ))}
                      </Select>
                    </label>

                    {canManageRoles ? (
                      <Button variant="outline" size="sm" onClick={() => setRolesFor(member)}>
                        <ShieldCheck className="size-3.5" aria-hidden="true" />
                        {t('users.manageRoles')}
                      </Button>
                    ) : null}

                    <Button
                      variant={member.status === 'active' ? 'outline' : 'primary'}
                      size="sm"
                      onClick={() =>
                        patchMember.mutate({
                          id: member.id,
                          status: member.status === 'active' ? 'inactive' : 'active',
                        })
                      }
                    >
                      {member.status === 'active' ? t('users.deactivate') : t('users.activate')}
                    </Button>
                  </div>

                  {member.status === 'active' ? (
                    <p className="q-muted text-xs leading-6">{t('users.deactivateHint')}</p>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(rolesFor)}
        onClose={() => setRolesFor(null)}
        title={t('users.manageRoles')}
        description={rolesFor?.profile?.full_name || rolesFor?.profile?.email || ''}
        footer={
          <Button variant="ghost" onClick={() => setRolesFor(null)}>
            {t('common.close')}
          </Button>
        }
      >
        <ul className="space-y-2">
          {(roles.data ?? []).map((role) => {
            const granted = rolesFor?.roles.some((r) => r.id === role.id) ?? false
            return (
              <li key={role.id} className="flex items-start gap-3 rounded-xl border border-[rgb(var(--q-border))] p-3">
                <input
                  type="checkbox"
                  id={`role-${role.id}`}
                  checked={granted}
                  disabled={toggleRole.isPending}
                  onChange={() =>
                    rolesFor &&
                    toggleRole.mutate({ membershipId: rolesFor.id, roleId: role.id, grant: !granted })
                  }
                  className="mt-1 size-4 shrink-0 accent-navy-700"
                />
                <label htmlFor={`role-${role.id}`} className="min-w-0 flex-1 cursor-pointer">
                  <span className="block text-sm font-medium">{role.name_ar}</span>
                  {role.description_ar ? (
                    <span className="q-muted block text-xs leading-6">{role.description_ar}</span>
                  ) : null}
                </label>
              </li>
            )
          })}
        </ul>
      </Modal>
    </div>
  )
}
