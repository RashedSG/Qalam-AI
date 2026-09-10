import { LogOut, Menu, Moon, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useI18n } from '@/hooks/useI18n'
import { useTheme } from '@/hooks/useTheme'
import { useProfile } from '@/hooks/useProfile'
import { Logo } from '@/components/ui/Logo'
import { clearAllSnapshots } from '@/features/correspondence/workspaceStorage'

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { t, lang, setLang } = useI18n()
  const { theme, resolved, setTheme } = useTheme()
  const { signOut } = useAuth()
  const { data: profile } = useProfile()
  const navigate = useNavigate()

  const initials = (profile?.full_name || profile?.email || '؟').trim().charAt(0).toUpperCase()

  return (
    <header
      className="q-surface sticky top-0 z-20 flex h-16 items-center gap-2 border-b px-3 sm:px-5"
    >
      <button
        type="button"
        onClick={onOpenMenu}
        className="rounded-lg p-2 hover:bg-[rgb(var(--q-surface-2))] lg:hidden"
        aria-label={t('nav.menu')}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>

      <div className="lg:hidden">
        <Logo size="sm" />
      </div>

      <div className="ms-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
          className="rounded-lg px-2.5 py-1.5 text-sm font-semibold hover:bg-[rgb(var(--q-surface-2))]"
          aria-label={t('settings.uiLanguage')}
        >
          {lang === 'ar' ? 'EN' : 'ع'}
        </button>

        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="rounded-lg p-2 hover:bg-[rgb(var(--q-surface-2))]"
          aria-label={t('settings.theme')}
        >
          {resolved === 'dark' ? (
            <Sun className="size-5" aria-hidden="true" />
          ) : (
            <Moon className="size-5" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex size-9 items-center justify-center rounded-full bg-navy-700 text-sm font-semibold text-white dark:bg-beige-200 dark:text-navy-900"
          aria-label={t('nav.profile')}
        >
          {initials}
        </button>

        <button
          type="button"
          onClick={async () => {
            // لا نترك عملًا غير محفوظ في متصفح مشترك بعد الخروج.
            clearAllSnapshots()
            await signOut()
            navigate('/', { replace: true })
          }}
          className="rounded-lg p-2 hover:bg-[rgb(var(--q-surface-2))]"
          aria-label={t('nav.signOut')}
        >
          <LogOut className="size-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  )
}
