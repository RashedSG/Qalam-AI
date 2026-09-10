import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import { CorrespondenceList } from '@/features/enterprise/CorrespondenceList'
import { listByDirection, listClassificationLevels, registerIncoming } from '@/services/db/enterprise'

const emptyForm = {
  subject: '',
  sender: '',
  sender_organization: '',
  external_reference_number: '',
  body: '',
  classification_key: '',
  due_at: '',
}

export default function InboxPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, membership, can } = useAuthorization()
  const orgId = organization?.id

  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const items = useQuery({
    queryKey: ['correspondence', orgId, 'incoming', search],
    queryFn: () => listByDirection(orgId!, 'incoming', { search: search || undefined }),
    enabled: Boolean(orgId),
  })
  const levels = useQuery({
    queryKey: ['classification-levels', orgId],
    queryFn: () => listClassificationLevels(orgId!),
    enabled: Boolean(orgId),
  })

  const defaultLevel = (levels.data ?? []).find((level) => level.is_default)

  const register = useMutation({
    mutationFn: () =>
      registerIncoming({
        user_id: user!.id,
        organization_id: orgId!,
        // الوارد يخص وحدة المسجِّل — فيراه مديره ضمن نطاقه.
        owner_unit_id: membership?.org_unit_id ?? null,
        subject: form.subject.trim(),
        body: form.body,
        sender: form.sender.trim(),
        sender_organization: form.sender_organization.trim(),
        external_reference_number: form.external_reference_number.trim(),
        classification_key: form.classification_key || defaultLevel?.key,
        due_at: form.due_at || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['correspondence', orgId, 'incoming'] })
      toast(t('common.saved'), 'success')
      setCreateOpen(false)
      setForm(emptyForm)
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  if (!orgId) {
    return <Card><EmptyState title={t('org.none')} description={t('org.noneHint')} /></Card>
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('inbox.title')}</h1>
          <p className="q-muted mt-1.5 leading-7">{t('inbox.subtitle')}</p>
        </div>
        {can('correspondence.create') ? (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" aria-hidden="true" />
            {t('inbox.register')}
          </Button>
        ) : null}
      </header>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('history.searchPlaceholder')}
        aria-label={t('common.search')}
      />

      {items.isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => items.refetch()} /> : null}

      <CorrespondenceList
        items={items.data ?? []}
        loading={items.isLoading}
        emptyLabel={t('inbox.empty')}
        levels={levels.data ?? []}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('inbox.register')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={register.isPending}
              disabled={!form.subject.trim() || !form.sender.trim()}
              onClick={() => register.mutate()}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('common.subject')} required>
            {(p) => (
              <Input {...p} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('inbox.sender')} required>
              {(p) => (
                <Input {...p} value={form.sender} onChange={(e) => setForm({ ...form, sender: e.target.value })} />
              )}
            </Field>
            <Field label={t('inbox.senderOrg')}>
              {(p) => (
                <Input
                  {...p}
                  value={form.sender_organization}
                  onChange={(e) => setForm({ ...form, sender_organization: e.target.value })}
                />
              )}
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('inbox.externalRef')}>
              {(p) => (
                <Input
                  {...p}
                  dir="ltr"
                  value={form.external_reference_number}
                  onChange={(e) => setForm({ ...form, external_reference_number: e.target.value })}
                />
              )}
            </Field>
            <Field label={t('inbox.dueAt')}>
              {(p) => (
                <Input
                  {...p}
                  type="date"
                  value={form.due_at}
                  onChange={(e) => setForm({ ...form, due_at: e.target.value })}
                />
              )}
            </Field>
          </div>

          <Field label={t('corr.classification')}>
            {(p) => (
              <Select
                {...p}
                value={form.classification_key || defaultLevel?.key || ''}
                onChange={(e) => setForm({ ...form, classification_key: e.target.value })}
              >
                {(levels.data ?? []).map((level) => (
                  <option key={level.key} value={level.key}>
                    {level.name_ar}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('detail.editBody')}>
            {(p) => (
              <Textarea {...p} rows={6} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            )}
          </Field>
        </div>
      </Modal>
    </div>
  )
}
