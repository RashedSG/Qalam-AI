import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { MailCheck } from 'lucide-react'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'

const schema = z.object({ email: z.string().trim().email() })
type FormValues = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const { t } = useI18n()
  const { sendPasswordReset } = useAuth()
  const [sent, setSent] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: '' } })

  const onSubmit = async (values: FormValues) => {
    try {
      await sendPasswordReset(values.email.trim())
    } catch {
      // لا نكشف ما إذا كان البريد مسجلًا — نفس الرسالة في كل الحالات.
    }
    setSent(true)
  }

  return (
    <AuthLayout
      title={t('auth.resetTitle')}
      subtitle={sent ? undefined : t('auth.resetBody')}
      footer={
        <Link to="/login" className="q-muted font-semibold underline">
          {t('common.back')}
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-3 text-center">
          <MailCheck className="size-9 text-emerald-600" aria-hidden="true" />
          <p className="leading-8">{t('auth.resetSent')}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label={t('auth.email')} error={errors.email ? t('auth.err.invalidEmail') : undefined} required>
            {(p) => <Input {...p} {...register('email')} type="email" inputMode="email" dir="ltr" />}
          </Field>
          <Button type="submit" fullWidth size="lg" loading={isSubmitting}>
            {t('auth.resetSend')}
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
