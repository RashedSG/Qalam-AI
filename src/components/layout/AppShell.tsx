import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar, SidebarContent } from './Sidebar'
import { BottomNav } from './BottomNav'
import { useI18n } from '@/hooks/useI18n'

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const { dir } = useI18n()

  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [drawerOpen])

  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="q-skip-link">
        تخطي إلى المحتوى
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main" className="flex-1 pb-24 lg:pb-10">
          <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav onMore={() => setDrawerOpen(true)} />

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-navy-950/45"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <div
            className="q-surface absolute inset-y-0 w-72 max-w-[85vw] border-e shadow-lift"
            style={dir === 'rtl' ? { right: 0 } : { left: 0 }}
            role="dialog"
            aria-modal="true"
            aria-label="القائمة"
          >
            <SidebarContent onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      ) : null}
    </div>
  )
}
