import { NavLink } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useI18n } from '@/hooks/useI18n'
import { MOBILE_NAV } from './navItems'

export function BottomNav({ onMore }: { onMore: () => void }) {
  const { t } = useI18n()

  return (
    <nav
      className="q-surface fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] lg:hidden"
      aria-label="التنقل السريع"
    >
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.map(({ to, labelKey, icon: Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-1 py-2.5 text-[0.68rem] font-medium transition-colors',
                  isActive ? 'text-navy-800 dark:text-beige-100' : 'text-[rgb(var(--q-text-muted))]',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon className={cn('size-5', isActive && 'stroke-[2.4]')} aria-hidden="true" />
                  <span className="max-w-full truncate px-0.5">{t(labelKey)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
        <li>
          <button
            type="button"
            onClick={onMore}
            className="flex w-full flex-col items-center gap-1 py-2.5 text-[0.68rem] font-medium text-[rgb(var(--q-text-muted))]"
          >
            <MoreHorizontal className="size-5" aria-hidden="true" />
            <span>{t('nav.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  )
}
