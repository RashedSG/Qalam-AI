import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { Spinner } from '@/components/ui/Spinner'

function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-live="polite">
      <Spinner className="size-8 text-navy-700 dark:text-beige-200" />
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  )
}

/** يمنع الوصول إلى صفحات التطبيق بدون جلسة. */
export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullPageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}

/** يوجّه المستخدم الجديد إلى الإعداد الأولي قبل استخدام التطبيق. */
export function RequireOnboarding() {
  const { data: profile, isLoading, isError } = useProfile()

  if (isLoading) return <FullPageLoader />
  // في حال تعذّر جلب الملف لا نحبس المستخدم — نسمح بالمتابعة.
  if (!isError && profile && !profile.onboarding_completed) {
    return <Navigate to="/onboarding" replace />
  }
  return <Outlet />
}

/** يمنع فتح صفحات الدخول/التسجيل أثناء وجود جلسة. */
export function RedirectIfAuthenticated() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageLoader />
  if (user) return <Navigate to="/dashboard" replace />
  return <Outlet />
}
