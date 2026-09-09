import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { FieldGroup } from '@/components/ui/FieldGroup'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { ErrorState } from '@/components/ui/States'
import { Logo } from '@/components/ui/Logo'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useProfile, useUpdateProfile } from '@/hooks/useProfile'
import { DEFAULT_DEPARTMENT_KEYS, WRITING_STYLES, type Language, type WritingStyle } from '@/types/domain'
import { DEPARTMENT_LABELS, WRITING_STYLE_LABELS, label } from '@/data/reference'
import { cn } from '@/lib/utils'

const TOTAL_STEPS = 3

export default function OnboardingPage() {
  const { t, lang, dir } = useI18n()
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const updateProfile = useUpdateProfile()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [preferredLanguage, setPreferredLanguage] = useState<Language>(profile?.preferred_language ?? 'ar')
  const [departmentKey, setDepartmentKey] = useState<string>(profile?.department_key ?? 'other')
  const [departmentCustom, setDepartmentCustom] = useState(profile?.department_custom ?? '')
  const [jobTitle, setJobTitle] = useState(profile?.job_title ?? '')
  const [writingStyle, setWritingStyle] = useState<WritingStyle>(
    (profile?.writing_style as WritingStyle) ?? 'balanced',
  )

  const NextIcon = dir === 'rtl' ? ArrowLeft : ArrowRight
  const BackIcon = dir === 'rtl' ? ArrowRight : ArrowLeft

  const canProceed = step === 0 ? fullName.trim().length >= 2 : true

  const finish = async () => {
    if (!user) return
    setError(null)
    try {
      await updateProfile.mutateAsync({
        full_name: fullName.trim(),
        email: user.email ?? '',
        preferred_language: preferredLanguage,
        department_key: departmentKey,
        department_custom: departmentKey === 'other' ? departmentCustom.trim() : null,
        job_title: jobTitle.trim() || null,
        writing_style: writingStyle,
        onboarding_completed: true,
      })
      navigate('/dashboard', { replace: true })
    } catch {
      setError(t('error.saveFailed'))
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <Logo size="md" className="mb-7" />

      <div className="q-surface w-full max-w-lg rounded-2xl border p-6 shadow-card sm:p-7">
        <div className="mb-6">
          <div className="q-muted mb-2 flex items-center justify-between text-xs font-medium">
            <span>
              {t('onboarding.step')} {step + 1} {t('onboarding.of')} {TOTAL_STEPS}
            </span>
            <span>{Math.round(((step + 1) / TOTAL_STEPS) * 100)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-[rgb(var(--q-surface-2))]">
            <div
              className="h-full rounded-full bg-navy-700 transition-[width] duration-500 dark:bg-beige-200"
              style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
            />
          </div>
        </div>

        <h1 className="text-xl font-bold">{t('onboarding.title')}</h1>
        <p className="q-muted mt-1.5 text-sm leading-7">{t('onboarding.subtitle')}</p>

        {error ? <ErrorState message={error} className="mt-5" /> : null}

        <div className="mt-6 space-y-5">
          {step === 0 ? (
            <>
              <Field label={t('onboarding.name')} hint={t('onboarding.nameHint')} required>
                {(p) => (
                  <Input
                    {...p}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    autoFocus
                  />
                )}
              </Field>

              <FieldGroup label={t('onboarding.language')}>
                <div className="grid grid-cols-2 gap-2">
                    {(['ar', 'en'] as Language[]).map((code) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setPreferredLanguage(code)}
                        aria-pressed={preferredLanguage === code}
                        className={cn(
                          'rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                          preferredLanguage === code
                            ? 'border-navy-700 bg-navy-700 text-white dark:border-beige-200 dark:bg-beige-100 dark:text-navy-900'
                            : 'border-[rgb(var(--q-border))] hover:bg-[rgb(var(--q-surface-2))]',
                        )}
                      >
                        {code === 'ar' ? t('common.arabic') : t('common.english')}
                      </button>
                    ))}
                </div>
              </FieldGroup>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Field label={t('onboarding.department')}>
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
                    <Input
                      {...p}
                      value={departmentCustom}
                      onChange={(e) => setDepartmentCustom(e.target.value)}
                      placeholder="مثال: إدارة الجودة"
                    />
                  )}
                </Field>
              ) : null}

              <Field label={`${t('onboarding.jobTitle')} — ${t('common.optional')}`}>
                {(p) => <Input {...p} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />}
              </Field>
            </>
          ) : null}

          {step === 2 ? (
            <FieldGroup label={t('onboarding.style')}>
              <div className="grid gap-2 sm:grid-cols-2">
                  {WRITING_STYLES.map((style) => (
                    <button
                      key={style}
                      type="button"
                      onClick={() => setWritingStyle(style)}
                      aria-pressed={writingStyle === style}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                        writingStyle === style
                          ? 'border-navy-700 bg-navy-700 text-white dark:border-beige-200 dark:bg-beige-100 dark:text-navy-900'
                          : 'border-[rgb(var(--q-border))] hover:bg-[rgb(var(--q-surface-2))]',
                      )}
                    >
                      {label(WRITING_STYLE_LABELS[style], lang)}
                      {writingStyle === style ? <Check className="size-4" aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
            </FieldGroup>
          ) : null}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <BackIcon className="size-4" aria-hidden="true" />
            {t('common.previous')}
          </Button>

          {step < TOTAL_STEPS - 1 ? (
            <Button type="button" onClick={() => setStep((s) => s + 1)} disabled={!canProceed}>
              {t('common.next')}
              <NextIcon className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="button" onClick={finish} loading={updateProfile.isPending}>
              {t('onboarding.done')}
              <Check className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
