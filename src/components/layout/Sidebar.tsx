import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { Logo } from '@/components/ui/Logo'
import { ACCOUNT_NAV, ADMIN_NAV, LIBRARY_NAV, PRIMARY_NAV, type NavItem } from './navItems'

function NavSection({ items, title }: { items: NavItem[]; title?: string }) {
  const { t } = useI18n()
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      {title ? (
        <p className="q-muted px-3 pb-1 pt-4 text-[0.7rem] font-semibold uppercase tracking-wider">{title}</p>
      ) : null}
      {items.map(({ to, labelKey, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-navy-700 text-white dark:bg-navy-600'
                : 'hover:bg-[rgb(var(--q-surface-2))]',
            )
          }
        >
          <Icon className="size-[18px] shrink-0" aria-hidden="true" />
          <span className="truncate">{t(labelKey)}</span>
        </NavLink>
      ))}
    </div>
  )
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useI18n()
  const { can } = useAuthorization()

  // التنقل واعٍ بالصلاحيات: لا يرى المستخدم مسارًا لن يستطيع استخدامه.
  const adminItems = ADMIN_NAV.filter((item) => !item.permission || can(item.permission))

  return (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3" onClick={onNavigate}>
      <div className="px-2 pb-3 pt-2">
        <Logo />
      </div>
      <NavSection items={PRIMARY_NAV} />
      <NavSection items={LIBRARY_NAV} title={t('nav.library')} />
      <NavSection items={adminItems} title={t('nav.administration')} />
      <div className="mt-auto pt-4">
        <NavSection items={ACCOUNT_NAV} />
      </div>
    </nav>
  )
}

export function Sidebar() {
  return (
    <aside
      className="q-surface hidden w-64 shrink-0 border-e lg:block"
      aria-label="التنقل الرئيسي"
    >
      <div className="sticky top-0 h-dvh">
        <SidebarContent />
      </div>
    </aside>
  )
}
