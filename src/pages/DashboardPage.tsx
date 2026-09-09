import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileEdit,
  GraduationCap,
  History,
  Languages,
  LayoutTemplate,
  Reply,
  Sparkles,
  SquarePen,
} from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useProfile } from '@/hooks/useProfile'
import { listCorrespondences } from '@/services/db/correspondences'
import { CORRESPONDENCE_TYPE_LABELS, label } from '@/data/reference'
import { formatRelative } from '@/lib/utils'
import type { CorrespondenceType } from '@/types/domain'
import type { TranslationKey } from '@/i18n'

const MAIN_CARDS = [
  { to: '/write', icon: SquarePen, titleKey: 'dashboard.write', descKey: 'dashboard.writeDesc' },
  { to: '/reply', icon: Reply, titleKey: 'dashboard.reply', descKey: 'dashboard.replyDesc' },
  { to: '/learn', icon: GraduationCap, titleKey: 'dashboard.learn', descKey: 'dashboard.learnDesc' },
] as const satisfies ReadonlyArray<{ to: string; icon: typeof SquarePen; titleKey: TranslationKey; descKey: TranslationKey }>

const QUICK_ACTIONS = [
  { to: '/improve', icon: Sparkles, labelKey: 'nav.improve' },
  { to: '/translate', icon: Languages, labelKey: 'nav.translate' },
  { to: '/templates', icon: LayoutTemplate, labelKey: 'nav.templates' },
  { to: '/drafts', icon: FileEdit, labelKey: 'nav.drafts' },
  { to: '/history', icon: History, labelKey: 'nav.history' },
  { to: '/dictionary', icon: BookOpen, labelKey: 'nav.dictionary' },
] as const satisfies ReadonlyArray<{ to: string; icon: typeof Sparkles; labelKey: TranslationKey }>

export default function DashboardPage() {
  const { t, lang, dir } = useI18n()
  const { user } = useAuth()
  const { data: profile } = useProfile()

  const { data: recent, isLoading } = useQuery({
    queryKey: ['correspondences', user?.id, 'recent'],
    queryFn: () => listCorrespondences(user!.id, {}, 5),
    enabled: Boolean(user?.id),
  })

  const displayName = profile?.full_name?.trim() || user?.email?.split('@')[0] || ''
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold sm:text-[1.75rem]">
          {t('dashboard.greeting')}{displayName ? `، ${displayName}` : ''}
        </h1>
        <p className="q-muted mt-1.5">{t('dashboard.subtitle')}</p>
      </header>

      <section aria-label={t('dashboard.subtitle')} className="grid gap-4 sm:grid-cols-3">
        {MAIN_CARDS.map(({ to, icon: Icon, titleKey, descKey }) => (
          <Link
            key={to}
            to={to}
            className="q-surface group flex flex-col rounded-2xl border p-5 shadow-card transition-shadow hover:shadow-lift"
          >
            <span className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-navy-700 text-white transition-transform group-hover:scale-105 dark:bg-beige-100 dark:text-navy-900">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold">{t(titleKey)}</h2>
            <p className="q-muted mt-1.5 text-sm leading-7">{t(descKey)}</p>
          </Link>
        ))}
      </section>

      <section aria-labelledby="quick-actions">
        <h2 id="quick-actions" className="mb-3 text-sm font-semibold">
          {t('dashboard.quickActions')}
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map(({ to, icon: Icon, labelKey }) => (
            <Link
              key={to}
              to={to}
              className="q-surface flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center text-xs font-medium transition-colors hover:bg-[rgb(var(--q-surface-2))]"
            >
              <Icon className="size-5 text-gold-600 dark:text-gold-400" aria-hidden="true" />
              {t(labelKey)}
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="recent">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent" className="text-sm font-semibold">
            {t('dashboard.recent')}
          </h2>
          <Link to="/history" className="q-muted flex items-center gap-1 text-sm hover:underline">
            {t('dashboard.viewAll')}
            <Arrow className="size-3.5" aria-hidden="true" />
          </Link>
        </div>

        <Card>
          {isLoading ? (
            <CardBody className="space-y-3">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-3/5" />
            </CardBody>
          ) : recent && recent.length > 0 ? (
            <ul>
              {recent.map((item, index) => (
                <li key={item.id}>
                  <Link
                    to={`/correspondence/${item.id}`}
                    className={`flex items-center gap-3 px-5 py-4 transition-colors hover:bg-[rgb(var(--q-surface-2))] ${
                      index > 0 ? 'border-t' : ''
                    }`}
                    style={index > 0 ? { borderColor: 'rgb(var(--q-border))' } : undefined}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title || item.subject || '—'}</p>
                      <p className="q-muted mt-0.5 truncate text-xs">
                        {item.recipient || '—'} · {formatRelative(item.created_at, lang)}
                      </p>
                    </div>
                    <Badge tone="neutral">
                      {label(CORRESPONDENCE_TYPE_LABELS[item.correspondence_type as CorrespondenceType], lang) ||
                        item.correspondence_type}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={t('dashboard.recentEmpty')}
              action={
                <Link
                  to="/write"
                  className="inline-flex h-11 items-center rounded-xl bg-navy-700 px-4 text-sm font-medium text-white hover:bg-navy-800 dark:bg-beige-100 dark:text-navy-900"
                >
                  {t('drafts.emptyCta')}
                </Link>
              }
            />
          )}
        </Card>
      </section>
    </div>
  )
}
