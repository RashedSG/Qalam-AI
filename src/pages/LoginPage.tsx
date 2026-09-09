import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { ErrorState } from '@/components/ui/States'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import { GoogleButton } from '@/components/ui/GoogleButton'

const schema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1),
})

type FormValues = z.infer<typeof schema>

export default function LoginPage() {
  const { t } = useI18n()
  const { signInWithPassword, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)
  const [oauthLoading, setOauthLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })

  const onSubmit = async (values: FormValues) => {
    setFormError(null)
    try {
      await signInWithPassword(values.email.trim(), values.password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(from && from !== '/login' ? from : '/dashboard', { replace: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setFormError(
        /invalid login credentials/i.test(message)
          ? t('auth.err.invalidCredentials')
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

  return (
    <AuthLayout
      title={t('auth.signInTitle')}
      footer={
        <span className="q-muted">
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-semibold text-navy-700 underline dark:text-beige-100">
            {t('auth.signUp')}
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
          <Field label={t('auth.email')} error={errors.email ? t('auth.err.invalidEmail') : undefined} required>
            {(p) => (
              <Input
                {...p}
                {...register('email')}
                type="email"
                inputMode="email"
                autoComplete="email"
                dir="ltr"
                placeholder="name@example.com"
              />
            )}
          </Field>

          <Field label={t('auth.password')} error={errors.password ? t('auth.err.generic') : undefined} required>
            {(p) => <Input {...p} {...register('password')} type="password" autoComplete="current-password" />}
          </Field>

          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm font-medium text-navy-700 underline dark:text-beige-200">
              {t('auth.forgot')}
            </Link>
          </div>

          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            {t('auth.signIn')}
          </Button>
        </form>
      </div>
    </AuthLayout>
  )
}
