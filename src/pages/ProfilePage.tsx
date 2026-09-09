import { useEffect, useState } from 'react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useProfile, useUpdateProfile } from '@/hooks/useProfile'
import { useToast } from '@/components/ui/Toast'
import { DEFAULT_DEPARTMENT_KEYS, WRITING_STYLES, type Language, type WritingStyle } from '@/types/domain'
import { DEPARTMENT_LABELS, WRITING_STYLE_LABELS, label } from '@/data/reference'

export default function ProfilePage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { data: profile, isLoading, isError, refetch } = useProfile()
  const updateProfile = useUpdateProfile()
  const { toast } = useToast()

  const [fullName, setFullName] = useState('')
  const [departmentKey, setDepartmentKey] = useState('other')
  const [departmentCustom, setDepartmentCustom] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [preferredLanguage, setPreferredLanguage] = useState<Language>('ar')
  const [writingStyle, setWritingStyle] = useState<WritingStyle>('balanced')

  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
    setDepartmentKey(profile.department_key ?? 'other')
    setDepartmentCustom(profile.department_custom ?? '')
    setJobTitle(profile.job_title ?? '')
    setPreferredLanguage(profile.preferred_language)
    setWritingStyle((profile.writing_style as WritingStyle) ?? 'balanced')
  }, [profile])

  const save = async () => {
    try {
      await updateProfile.mutateAsync({
        full_name: fullName.trim(),
        department_key: departmentKey,
        department_custom: departmentKey === 'other' ? departmentCustom.trim() : null,
        job_title: jobTitle.trim() || null,
        preferred_language: preferredLanguage,
        writing_style: writingStyle,
      })
      toast(t('profile.updated'), 'success')
    } catch {
      toast(t('error.saveFailed'), 'error')
    }
  }

  if (isLoading) return <Skeleton className="h-96" />
  if (isError) return <ErrorState message={t('error.loadFailed')} onRetry={() => refetch()} />

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('profile.title')}</h1>
      </header>

      <Card>
        <CardHeader title={t('profile.title')} />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label={t('auth.fullName')} className="sm:col-span-2">
            {(p) => <Input {...p} value={fullName} onChange={(e) => setFullName(e.target.value)} />}
          </Field>

          <Field label={t('auth.email')} className="sm:col-span-2">
            {(p) => <Input {...p} value={user?.email ?? ''} readOnly dir="ltr" className="opacity-70" />}
          </Field>

          <Field label={t('common.department')}>
            {(p) => (
              <Select {...p} value={departmentKey} onChange={(e) => setDepartmentKey(e.target.value)}>
                {DEFAULT_DEPARTMENT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {label(DEPARTMENT_LABELS[key], lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          {departmentKey === 'other' ? (
            <Field label={t('onboarding.customDepartment')}>
              {(p) => (
                <Input {...p} value={departmentCustom} onChange={(e) => setDepartmentCustom(e.target.value)} />
              )}
            </Field>
          ) : null}

          <Field label={t('onboarding.jobTitle')}>
            {(p) => <Input {...p} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />}
          </Field>

          <Field label={t('onboarding.language')}>
            {(p) => (
              <Select
                {...p}
                value={preferredLanguage}
                onChange={(e) => setPreferredLanguage(e.target.value as Language)}
              >
                <option value="ar">{t('common.arabic')}</option>
                <option value="en">{t('common.english')}</option>
              </Select>
            )}
          </Field>

          <Field label={t('onboarding.style')}>
            {(p) => (
              <Select {...p} value={writingStyle} onChange={(e) => setWritingStyle(e.target.value as WritingStyle)}>
                {WRITING_STYLES.map((style) => (
                  <option key={style} value={style}>
                    {label(WRITING_STYLE_LABELS[style], lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </CardBody>
        <CardFooter>
          <Button className="ms-auto" onClick={save} loading={updateProfile.isPending}>
            {t('common.save')}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
