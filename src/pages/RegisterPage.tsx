import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { ErrorState } from '@/components/ui/States'
import { GoogleButton } from '@/components/ui/GoogleButton'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'

const schema = z
  .object({
    fullName: z.string().trim().min(2),
    email: z.string().trim().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(1),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'mismatch',
  })

type FormValues = z.infer<typeof schema>

export default function RegisterPage() {
  const { t } = useI18n()
  const { signUpWithPassword, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      const { needsConfirmation } = await signUpWithPassword(
        values.email.trim(),
        values.password,
        values.fullName.trim(),
      )
      if (needsConfirmation) {
        setAwaitingConfirmation(true)
        return
      }
      navigate('/onboarding', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setFormError(
        /already registered|already exists|User already/i.test(message)
          ? t('auth.err.emailTaken')
          : t('auth.err.generic'),
      )
    }
  }

  const onGoogle = async () => {
    setFormError(null)
    setOauthLoading(true)
    try {
      await signInWithGoogle()
    } catch {
      setFormError(t('auth.err.generic'))
      setOauthLoading(false)
    }
  }

  if (awaitingConfirmation) {
    return (
      <AuthLayout title={t('auth.signUpTitle')}>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <MailCheck className="size-10 text-emerald-600" aria-hidden="true" />
          <p className="leading-8">{t('auth.checkEmail')}</p>
          <Link to="/login" className="font-semibold text-navy-700 underline dark:text-beige-100">
            {t('auth.signIn')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={t('auth.signUpTitle')}
      footer={
        <span className="q-muted">
          {t('auth.hasAccount')}{' '}
          <Link to="/login" className="font-semibold text-navy-700 underline dark:text-beige-100">
            {t('auth.signIn')}
          </Link>
        </span>
      }
    >
      <div className="space-y-5">
        <GoogleButton onClick={onGoogle} loading={oauthLoading} label={t('auth.google')} />

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-[rgb(var(--q-border))]" aria-hidden="true" />
          <span className="q-muted text-xs">{t('auth.orEmail')}</span>
          <span className="h-px flex-1 bg-[rgb(var(--q-border))]" aria-hidden="true" />
        </div>

        {formError ? <ErrorState message={formError} /> : null}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label={t('auth.fullName')} error={errors.fullName ? t('auth.err.nameRequired') : undefined} required>
            {(p) => <Input {...p} {...register('fullName')} autoComplete="name" />}
          </Field>

          <Field label={t('auth.email')} error={errors.email ? t('auth.err.invalidEmail') : undefined} required>
            {(p) => (
              <Input {...p} {...register('email')} type="email" inputMode="email" autoComplete="email" dir="ltr" />
            )}
          </Field>

          <Field
            label={t('auth.password')}
            hint={t('auth.err.shortPassword')}
            error={errors.password ? t('auth.err.shortPassword') : undefined}
            required
          >
            {(p) => <Input {...p} {...register('password')} type="password" autoComplete="new-password" />}
          </Field>

          <Field
            label={t('auth.confirmPassword')}
            error={errors.confirmPassword ? t('auth.err.mismatch') : undefined}
            required
          >
            {(p) => <Input {...p} {...register('confirmPassword')} type="password" autoComplete="new-password" />}
          </Field>

          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            {t('auth.signUp')}
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}
