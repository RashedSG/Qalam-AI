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
import {
  RedirectIfAuthenticated,
  RequireAuth,
  RequireOnboarding,
  RequirePermission,
} from '@/components/layout/Guards'
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
const OrganizationPage = lazy(() => import('@/pages/organization/OrganizationPage'))
const StructurePage = lazy(() => import('@/pages/organization/StructurePage'))
const UsersPage = lazy(() => import('@/pages/organization/UsersPage'))
const RolesPage = lazy(() => import('@/pages/organization/RolesPage'))
const AuditPage = lazy(() => import('@/pages/organization/AuditPage'))
const InboxPage = lazy(() => import('@/pages/enterprise/InboxPage'))
const OutboxPage = lazy(() => import('@/pages/enterprise/OutboxPage'))
const MyWorkPage = lazy(() => import('@/pages/enterprise/MyWorkPage'))
const DelegationPage = lazy(() => import('@/pages/organization/DelegationPage'))
const AssistantPage = lazy(() => import('@/pages/enterprise/AssistantPage'))
const VerifyPage = lazy(() => import('@/pages/VerifyPage'))
const ReportsPage = lazy(() => import('@/pages/enterprise/ReportsPage'))

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

                              {/* المراسلة المؤسسية. «صندوق عملي» بلا حارس:
                                  كل عضو قد تُحال إليه مراسلة، والصفحة تعرض
                                  ما يسمح به RLS ولا شيء غيره. */}
                              <Route path="/assistant" element={<AssistantPage />} />
                              <Route path="/my-work" element={<MyWorkPage />} />
                              <Route path="/reports" element={<ReportsPage />} />
                              {/* التفويض بلا حارس: كل عضو يفوّض ما يملكه،
                                  والقاعدة ترفض تفويض ما لا يملك. */}
                              <Route path="/delegation" element={<DelegationPage />} />
                              <Route element={<RequirePermission permission="correspondence.view" />}>
                                <Route path="/inbox" element={<InboxPage />} />
                                <Route path="/outbox" element={<OutboxPage />} />
                              </Route>

                              {/* الإدارة — الحارس يخفي الصفحة، وRLS يمنع البيانات. */}
                              <Route element={<RequirePermission permission="organization.manage" scope="organization" />}>
                                <Route path="/organization" element={<OrganizationPage />} />
                                <Route path="/organization/structure" element={<StructurePage />} />
                              </Route>
                              <Route element={<RequirePermission permission="users.manage" scope="organization" />}>
                                <Route path="/organization/users" element={<UsersPage />} />
                              </Route>
                              <Route element={<RequirePermission permission="roles.manage" scope="organization" />}>
                                <Route path="/organization/roles" element={<RolesPage />} />
                              </Route>
                              <Route element={<RequirePermission permission="audit.view" scope="organization" />}>
                                <Route path="/organization/audit" element={<AuditPage />} />
                              </Route>
                            </Route>
                          </Route>
                        </Route>

                        {/* التحقق العلني: خارج كل الحُرّاس عن قصد — يصله من
                            لا حساب له. ولا يعرض إلا رقم الوثيقة وتاريخها وجهتها. */}
                        <Route path="/verify" element={<VerifyPage />} />

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
