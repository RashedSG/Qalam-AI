import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/queryClient'
import { I18nProvider } from '@/contexts/I18nContext'
import { ThemeProvider } from '@/contexts/ThemeContext'
import { AuthProvider } from '@/contexts/AuthContext'
import { ToastProvider } from '@/components/ui/Toast'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { ConfigGate } from '@/components/layout/ConfigGate'
import { AppShell } from '@/components/layout/AppShell'
import { RedirectIfAuthenticated, RequireAuth, RequireOnboarding } from '@/components/layout/Guards'
import { Spinner } from '@/components/ui/Spinner'

// صفحات عامة — تُحمّل مباشرة (أول انطباع سريع)
import WelcomePage from '@/pages/WelcomePage'
import LoginPage from '@/pages/LoginPage'
import RegisterPage from '@/pages/RegisterPage'
import ForgotPasswordPage from '@/pages/ForgotPasswordPage'
import NotFoundPage from '@/pages/NotFoundPage'

// صفحات التطبيق — تحميل كسول لتقليل حجم الحزمة الأولى
const OnboardingPage = lazy(() => import('@/pages/OnboardingPage'))
const DashboardPage = lazy(() => import('@/pages/DashboardPage'))
const WritePage = lazy(() => import('@/pages/WritePage'))
const ReplyPage = lazy(() => import('@/pages/ReplyPage'))
const ImprovePage = lazy(() => import('@/pages/ImprovePage'))
const TranslatePage = lazy(() => import('@/pages/TranslatePage'))
const ReviewPage = lazy(() => import('@/pages/ReviewPage'))
const LearnPage = lazy(() => import('@/pages/LearnPage'))
const TemplatesPage = lazy(() => import('@/pages/TemplatesPage'))
const DictionaryPage = lazy(() => import('@/pages/DictionaryPage'))
const DraftsPage = lazy(() => import('@/pages/DraftsPage'))
const HistoryPage = lazy(() => import('@/pages/HistoryPage'))
const CorrespondenceDetailPage = lazy(() => import('@/pages/CorrespondenceDetailPage'))
const FavoritesPage = lazy(() => import('@/pages/FavoritesPage'))
const ProfilePage = lazy(() => import('@/pages/ProfilePage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

function PageLoader() {
  return (
    <div className="flex min-h-64 items-center justify-center py-20" role="status" aria-live="polite">
      <Spinner className="size-7 text-navy-700 dark:text-beige-200" />
      <span className="sr-only">جارٍ التحميل…</span>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <I18nProvider>
        <ThemeProvider>
          <ConfigGate>
            <QueryClientProvider client={queryClient}>
              <AuthProvider>
                <ToastProvider>
                  <BrowserRouter>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        {/* عام */}
                        <Route element={<RedirectIfAuthenticated />}>
                          <Route path="/" element={<WelcomePage />} />
                          <Route path="/login" element={<LoginPage />} />
                          <Route path="/register" element={<RegisterPage />} />
                          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                        </Route>

                        {/* محمي */}
                        <Route element={<RequireAuth />}>
                          <Route path="/onboarding" element={<OnboardingPage />} />

                          <Route element={<RequireOnboarding />}>
                            <Route element={<AppShell />}>
                              <Route path="/dashboard" element={<DashboardPage />} />
                              <Route path="/write" element={<WritePage />} />
                              <Route path="/reply" element={<ReplyPage />} />
                              <Route path="/improve" element={<ImprovePage />} />
                              <Route path="/translate" element={<TranslatePage />} />
                              <Route path="/review" element={<ReviewPage />} />
                              <Route path="/learn" element={<LearnPage />} />
                              <Route path="/templates" element={<TemplatesPage />} />
                              <Route path="/dictionary" element={<DictionaryPage />} />
                              <Route path="/drafts" element={<DraftsPage />} />
                              <Route path="/history" element={<HistoryPage />} />
                              <Route path="/correspondence/:id" element={<CorrespondenceDetailPage />} />
                              <Route path="/favorites" element={<FavoritesPage />} />
                              <Route path="/profile" element={<ProfilePage />} />
                              <Route path="/settings" element={<SettingsPage />} />
                            </Route>
                          </Route>
                        </Route>

                        <Route path="/index.html" element={<Navigate to="/" replace />} />
                        <Route path="*" element={<NotFoundPage />} />
                      </Routes>
                    </Suspense>
                  </BrowserRouter>
                </ToastProvider>
              </AuthProvider>
            </QueryClientProvider>
          </ConfigGate>
        </ThemeProvider>
      </I18nProvider>
    </ErrorBoundary>
  )
}
