import { Link } from 'react-router-dom'
import { FileSearch, PenLine, ShieldCheck } from 'lucide-react'
import { Logo } from '@/components/ui/Logo'
import { useI18n } from '@/hooks/useI18n'

const FEATURES = [
  { icon: PenLine, titleKey: 'welcome.f1.title', bodyKey: 'welcome.f1.body' },
  { icon: FileSearch, titleKey: 'welcome.f2.title', bodyKey: 'welcome.f2.body' },
  { icon: ShieldCheck, titleKey: 'welcome.f3.title', bodyKey: 'welcome.f3.body' },
] as const

export default function WelcomePage() {
  const { t, lang, setLang } = useI18n()

  return (
    <div className="relative flex min-h-dvh flex-col">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-beige-100 to-transparent dark:from-navy-900"
        aria-hidden="true"
      />

      <header className="relative flex items-center justify-between px-5 py-5 sm:px-8">
        <Logo />
        <button
          type="button"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold hover:bg-[rgb(var(--q-surface-2))]"
        >
          {lang === 'ar' ? 'English' : 'العربية'}
        </button>
      </header>

      <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-10 sm:px-8">
        <div className="text-center">
          <div className="mb-7 flex justify-center">
            <Logo size="lg" />
          </div>
          <p className="q-muted mb-3 text-sm font-medium tracking-wide">{t('brand.tagline')}</p>
          <h1 className="text-balance text-3xl font-bold leading-tight sm:text-4xl">
            {t('welcome.title')}
          </h1>
          <p className="q-muted mx-auto mt-4 max-w-xl text-pretty leading-8">{t('welcome.body')}</p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              to="/login"
              className="inline-flex h-13 items-center justify-center rounded-xl bg-navy-700 px-6 py-3.5 text-base font-medium text-white transition-colors hover:bg-navy-800 dark:bg-beige-100 dark:text-navy-900 dark:hover:bg-white sm:min-w-44"
            >
              {t('welcome.signIn')}
            </Link>
            <Link
              to="/register"
              className="inline-flex h-13 items-center justify-center rounded-xl border border-[rgb(var(--q-border))] px-6 py-3.5 text-base font-medium transition-colors hover:bg-[rgb(var(--q-surface-2))] sm:min-w-44"
            >
              {t('welcome.signUp')}
            </Link>
          </div>
        </div>

        <ul className="mt-14 grid gap-4 sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, titleKey, bodyKey }) => (
            <li key={titleKey} className="q-surface rounded-2xl border p-5 shadow-card">
              <Icon className="mb-3 size-6 text-gold-600 dark:text-gold-400" aria-hidden="true" />
              <h2 className="text-sm font-semibold">{t(titleKey)}</h2>
              <p className="q-muted mt-1.5 text-sm leading-7">{t(bodyKey)}</p>
            </li>
          ))}
        </ul>
      </main>

      <footer className="q-muted relative px-5 py-6 text-center text-xs sm:px-8">
        قلم — أداة مساعدة للصياغة المؤسسية. لا تمثل أي جهة رسمية ولا تُغني عن المراجعة القانونية.
      </footer>
    </div>
  )
}
