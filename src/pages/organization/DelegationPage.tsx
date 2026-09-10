import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, UserCheck } from 'lucide-react'
import { Card, CardBody, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import {
  createDelegation,
  isDelegationActive,
  listDelegations,
  revokeDelegation,
} from '@/services/db/workflow'
import { listMembers, listOrgUnits, listPermissions } from '@/services/db/organization'
import { formatDate } from '@/lib/utils'
import type { Delegation } from '@/types/database'
import type { PermissionKey } from '@/types/permissions'

/** الحالة المعروضة تُشتق من نفس شروط `delegated_scope` في القاعدة. */
function statusOf(delegation: Delegation): 'revoked' | 'expired' | 'scheduled' | 'active' {
  if (delegation.revoked_at) return 'revoked'
  const now = new Date()
  if (new Date(delegation.ends_at) <= now) return 'expired'
  if (new Date(delegation.starts_at) > now) return 'scheduled'
  return 'active'
}

export default function DelegationPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, scopes } = useAuthorization()
  const orgId = organization?.id

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    delegateId: '',
    permissions: [] as PermissionKey[],
    endsAt: '',
    scopeUnitId: '',
    reason: '',
  })

  const delegations = useQuery({
    queryKey: ['delegations', orgId],
    queryFn: listDelegations,
    enabled: Boolean(orgId),
  })
  const members = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => listMembers(orgId!),
    enabled: Boolean(orgId) && open,
  })
  const units = useQuery({
    queryKey: ['org-units', orgId],
    queryFn: () => listOrgUnits(orgId!),
    enabled: Boolean(orgId) && open,
  })
  const permissions = useQuery({ queryKey: ['permissions'], queryFn: listPermissions, enabled: open })

  /** لا يعرض النموذج إلا ما يملكه المستخدم — القاعدة ترفض الباقي على أي حال. */
  const mine = (permissions.data ?? []).filter((permission) => permission.key in scopes)

  const create = useMutation({
    mutationFn: () =>
      createDelegation({
        delegateId: form.delegateId,
        permissions: form.permissions,
        endsAt: new Date(form.endsAt).toISOString(),
        scopeUnitId: form.scopeUnitId || null,
        reason: form.reason,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['delegations', orgId] })
      toast(t('common.saved'), 'success')
      setOpen(false)
      setForm({ delegateId: '', permissions: [], endsAt: '', scopeUnitId: '', reason: '' })
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  const revoke = useMutation({
    mutationFn: (delegationId: string) => revokeDelegation(delegationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['delegations', orgId] })
      toast(t('common.saved'), 'success')
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  if (!orgId) {
    return <Card><EmptyState title={t('org.none')} description={t('org.noneHint')} /></Card>
  }

  const items = delegations.data ?? []
  const given = items.filter((item) => item.delegator_id === user?.id)
  const received = items.filter((item) => item.delegate_id === user?.id)

  const renderList = (list: Delegation[], canRevoke: boolean) =>
    list.length === 0 ? (
      <p className="q-muted text-sm">{t('deleg.empty')}</p>
    ) : (
      <ul className="space-y-3">
        {list.map((delegation) => {
          const status = statusOf(delegation)
          return (
            <li key={delegation.id}>
              <Card>
                <CardBody className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={status === 'active' ? 'gold' : 'neutral'}>{t(`deleg.${status}`)}</Badge>
                    <span className="q-muted text-xs">
                      {formatDate(delegation.starts_at, lang)} → {formatDate(delegation.ends_at, lang)}
                    </span>
                  </div>
                  {delegation.reason ? <p className="text-sm leading-7">{delegation.reason}</p> : null}
                </CardBody>
                {canRevoke && isDelegationActive(delegation) ? (
                  <CardFooter>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={revoke.isPending}
                      onClick={() => revoke.mutate(delegation.id)}
                    >
                      {t('deleg.revoke')}
                    </Button>
                  </CardFooter>
                ) : null}
              </Card>
            </li>
          )
        })}
      </ul>
    )

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('deleg.title')}</h1>
          <p className="q-muted mt-1.5 leading-7">{t('deleg.subtitle')}</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('deleg.new')}
        </Button>
      </header>

      {delegations.isError ? (
        <ErrorState message={t('error.loadFailed')} onRetry={() => delegations.refetch()} />
      ) : null}

      {delegations.isLoading ? (
        <Skeleton className="h-32" />
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<UserCheck className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('deleg.empty')}
          />
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t('deleg.given')}</h2>
            {renderList(given, true)}
          </section>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold">{t('deleg.received')}</h2>
            {renderList(received, false)}
          </section>
        </>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('deleg.new')}
        description={t('deleg.maxYear')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={create.isPending}
              disabled={!form.delegateId || !form.endsAt || form.permissions.length === 0}
              onClick={() => create.mutate()}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('deleg.delegate')} required>
            {(p) => (
              <Select
                {...p}
                value={form.delegateId}
                onChange={(e) => setForm({ ...form, delegateId: e.target.value })}
              >
                <option value="">—</option>
                {(members.data ?? [])
                  .filter((member) => member.status === 'active' && member.user_id !== user?.id)
                  .map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {member.profile?.full_name || member.profile?.email}
                    </option>
                  ))}
              </Select>
            )}
          </Field>

          <Field label={t('deleg.until')} required>
            {(p) => (
              <Input
                {...p}
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
            )}
          </Field>

          <Field label={t('deleg.scope')}>
            {(p) => (
              <Select
                {...p}
                value={form.scopeUnitId}
                onChange={(e) => setForm({ ...form, scopeUnitId: e.target.value })}
              >
                <option value="">{t('deleg.scopeAll')}</option>
                {(units.data ?? []).map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {'— '.repeat(unit.depth)}
                    {unit.name_ar}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">{t('deleg.permissions')}</legend>
            <ul className="max-h-56 space-y-1.5 overflow-y-auto">
              {mine.map((permission) => {
                const key = permission.key as PermissionKey
                const checked = form.permissions.includes(key)
                return (
                  <li key={permission.key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={`perm-${permission.key}`}
                      checked={checked}
                      onChange={() =>
                        setForm({
                          ...form,
                          permissions: checked
                            ? form.permissions.filter((item) => item !== key)
                            : [...form.permissions, key],
                        })
                      }
                      className="size-4 shrink-0 accent-navy-700"
                    />
                    <label htmlFor={`perm-${permission.key}`} className="cursor-pointer text-sm">
                      {permission.name_ar}
                    </label>
                  </li>
                )
              })}
            </ul>
          </fieldset>

          <Field label={t('deleg.reason')}>
            {(p) => (
              <Textarea {...p} rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  )
}
