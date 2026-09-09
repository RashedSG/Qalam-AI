import { Link } from 'react-router-dom'
import { Logo } from '@/components/ui/Logo'
import { useI18n } from '@/hooks/useI18n'

export default function NotFoundPage() {
  const { t } = useI18n()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <Logo size="md" className="mb-8" />
      <p className="text-5xl font-bold tabular-nums">404</p>
      <h1 className="mt-3 text-lg font-semibold">{t('error.notFound')}</h1>
      <p className="q-muted mt-2 max-w-sm leading-7">{t('error.notFoundBody')}</p>
      <Link
        to="/dashboard"
        className="mt-7 inline-flex h-11 items-center rounded-xl bg-navy-700 px-5 text-sm font-medium text-white hover:bg-navy-800 dark:bg-beige-100 dark:text-navy-900"
      >
        {t('error.backHome')}
      </Link>
    </div>
  )
}
