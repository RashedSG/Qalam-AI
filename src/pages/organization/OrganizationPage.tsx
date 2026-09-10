import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { Card, CardBody, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Field } from '@/components/ui/Field'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import { updateOrganization } from '@/services/db/organization'
import type { TranslationKey } from '@/i18n'

export default function OrganizationPage() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, loading, can } = useAuthorization()

  const [form, setForm] = useState({ name: '', name_en: '', code: '' })

  useEffect(() => {
    if (organization) {
      setForm({
        name: organization.name,
        name_en: organization.name_en,
        code: organization.code ?? '',
      })
    }
  }, [organization])

  const save = useMutation({
    mutationFn: () =>
      updateOrganization(organization!.id, {
        name: form.name.trim(),
        name_en: form.name_en.trim(),
        code: form.code.trim() || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['authorization'] })
      toast(t('common.saved'), 'success')
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  if (loading) return <Skeleton className="h-64" />

  if (!organization) {
    return (
      <Card>
        <EmptyState
          icon={<Building2 className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
          title={t('org.none')}
          description={t('org.noneHint')}
        />
      </Card>
    )
  }

  const editable = can('organization.manage', 'organization')

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('org.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('org.subtitle')}</p>
      </header>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={organization.status === 'active' ? 'gold' : 'neutral'}>
              {t(`org.status.${organization.status}` as TranslationKey)}
            </Badge>
          </div>

          <Field label={t('org.nameAr')} required>
            {(p) => (
              <Input
                {...p}
                value={form.name}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            )}
          </Field>

          <Field label={t('org.nameEn')}>
            {(p) => (
              <Input
                {...p}
                value={form.name_en}
                disabled={!editable}
                dir="ltr"
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              />
            )}
          </Field>

          <Field label={t('org.code')} hint={t('org.codeHint')}>
            {(p) => (
              <Input
                {...p}
                value={form.code}
                disabled={!editable}
                dir="ltr"
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
            )}
          </Field>
        </CardBody>

        {editable ? (
          <CardFooter>
            <Button loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate()}>
              {t('common.save')}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  )
}
