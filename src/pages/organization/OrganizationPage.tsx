import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, ShieldAlert } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Field } from '@/components/ui/Field'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import { updateOrganization } from '@/services/db/organization'
import { PrintableDocument } from '@/features/enterprise/PrintableDocument'
import type { Correspondence } from '@/types/database'
import type { TranslationKey } from '@/i18n'

/**
 * سياسة أمن المحتوى تسمح بالصور من نفس النطاق و`data:` فقط. رابط خارجي
 * لن يُحجب بصمت في الطباعة فحسب — بل يُبلّغ نطاقًا آخر بكل مرة تُفتح فيها
 * وثيقة. فنمنعه هنا صراحةً بدل تركه يفشل لاحقًا بلا تفسير.
 */
const isAllowedLogo = (url: string) => {
  const value = url.trim()
  if (!value) return true
  return value.startsWith('/') || value.startsWith('data:image/')
}

/** مراسلة وهمية للمعاينة وحدها — لا تُحفظ ولا تُرسل. */
const SAMPLE: Correspondence = {
  id: 'preview',
  user_id: 'preview',
  organization_id: null,
  title: '',
  subject: '—',
  body: '',
  language: 'ar',
  correspondence_type: 'official_letter',
  tone: 'formal',
  priority: 'normal',
  recipient: '—',
  department_key: null,
  source: 'written',
  original_input: null,
  analysis: null,
  review: null,
  is_archived: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  reference_number: '—',
}

export default function OrganizationPage() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, loading, can } = useAuthorization()

  const [form, setForm] = useState({ name: '', name_en: '', code: '' })
  const [branding, setBranding] = useState({ letterhead: '', footer: '', logo_url: '' })

  useEffect(() => {
    if (organization) {
      setForm({
        name: organization.name,
        name_en: organization.name_en,
        code: organization.code ?? '',
      })
      const current = (organization.branding ?? {}) as Record<string, unknown>
      setBranding({
        letterhead: typeof current.letterhead === 'string' ? current.letterhead : '',
        footer: typeof current.footer === 'string' ? current.footer : '',
        logo_url: typeof current.logo_url === 'string' ? current.logo_url : '',
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

  const saveBranding = useMutation({
    mutationFn: () =>
      updateOrganization(organization!.id, {
        branding: {
          ...((organization!.branding ?? {}) as Record<string, unknown>),
          letterhead: branding.letterhead.trim(),
          footer: branding.footer.trim(),
          logo_url: branding.logo_url.trim(),
        },
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

      {/* ------------------------------ هوية المؤسسة ------------------------------ */}
      <Card>
        <CardHeader title={t('brand.title')} description={t('brand.subtitle')} />
        <CardBody className="space-y-4">
          {/*
            ⚠️ بند صريح في المتطلبات: لا يُقال عن هذا التصميم إنه «معتمد
            حكوميًّا». إدخال الترويسة لا يعني اعتمادها — الاعتماد قرار المؤسسة
            وحدها، وهو ما تقوله هذه الجملة للمسؤول قبل أن يطبع أول وثيقة.
          */}
          <p className="q-muted flex items-start gap-2 rounded-lg border border-[rgb(var(--q-border))] bg-[rgb(var(--q-surface-2))] px-4 py-3 text-sm leading-7">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('brand.disclaimer')}
          </p>

          <Field label={t('brand.letterhead')}>
            {(p) => (
              <Textarea
                {...p}
                rows={3}
                value={branding.letterhead}
                disabled={!editable}
                onChange={(e) => setBranding({ ...branding, letterhead: e.target.value })}
              />
            )}
          </Field>

          <Field label={t('brand.footer')}>
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={branding.footer}
                disabled={!editable}
                onChange={(e) => setBranding({ ...branding, footer: e.target.value })}
              />
            )}
          </Field>

          <Field
            label={t('brand.logoUrl')}
            hint={t('brand.logoHint')}
            error={isAllowedLogo(branding.logo_url) ? undefined : t('brand.logoRejected')}
          >
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                value={branding.logo_url}
                disabled={!editable}
                placeholder="/logo.png"
                onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}
              />
            )}
          </Field>

          <div>
            <p className="mb-2 text-sm font-medium">{t('brand.preview')}</p>
            <div className="overflow-x-auto rounded-xl border border-[rgb(var(--q-border))] bg-white p-6 text-black">
              <PrintableDocument
                correspondence={SAMPLE}
                organization={{ ...organization, branding }}
                verifyUrl={`${window.location.origin}/verify?code=${'0'.repeat(48)}`}
                preview
              />
            </div>
          </div>
        </CardBody>

        {editable ? (
          <CardFooter>
            <Button
              loading={saveBranding.isPending}
              disabled={!isAllowedLogo(branding.logo_url)}
              onClick={() => saveBranding.mutate()}
            >
              {t('common.save')}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  )
}
