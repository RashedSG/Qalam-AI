import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Archive, History as HistoryIcon, Search } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { listCorrespondences, type HistoryFilters } from '@/services/db/correspondences'
import { CORRESPONDENCE_TYPE_LABELS, DEPARTMENT_LABELS, label } from '@/data/reference'
import {
  CORRESPONDENCE_TYPES,
  DEFAULT_DEPARTMENT_KEYS,
  type CorrespondenceType,
  type DepartmentKey,
} from '@/types/domain'
import { formatDate } from '@/lib/utils'

export default function HistoryPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  // الافتراضي: المراسلات النشطة فقط — المؤرشفة تُعرض بتبويب مستقل.
  const [filters, setFilters] = useState<HistoryFilters>({ archived: false })
  const [searchInput, setSearchInput] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['correspondences', user?.id, filters],
    queryFn: () => listCorrespondences(user!.id, filters),
    enabled: Boolean(user?.id),
  })

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters((prev) => ({ ...prev, search: searchInput.trim() || undefined }))
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('history.title')}</h1>

        <div className="flex rounded-xl border p-0.5" style={{ borderColor: 'rgb(var(--q-border))' }} role="group">
          {([false, true] as const).map((value) => (
            <button
              key={String(value)}
              type="button"
              onClick={() => setFilters((p) => ({ ...p, archived: value }))}
              aria-pressed={filters.archived === value}
              className={`flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-sm font-medium transition-colors ${
                filters.archived === value
                  ? 'bg-navy-700 text-white dark:bg-beige-100 dark:text-navy-900'
                  : 'hover:bg-[rgb(var(--q-surface-2))]'
              }`}
            >
              {value ? <Archive className="size-3.5" aria-hidden="true" /> : null}
              {value ? t('history.archived') : t('history.active')}
            </button>
          ))}
        </div>
      </header>

      <form onSubmit={applySearch} className="space-y-3">
        <div className="flex gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            aria-label={t('common.search')}
          />
          <button
            type="submit"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy-700 text-white hover:bg-navy-800 dark:bg-beige-100 dark:text-navy-900"
            aria-label={t('common.search')}
          >
            <Search className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          <Select
            value={filters.type ?? ''}
            onChange={(e) => setFilters((p) => ({ ...p, type: e.target.value || undefined }))}
            aria-label={t('common.type')}
          >
            <option value="">{t('common.type')}: {t('common.all')}</option>
            {CORRESPONDENCE_TYPES.map((type) => (
              <option key={type} value={type}>
                {label(CORRESPONDENCE_TYPE_LABELS[type], lang)}
              </option>
            ))}
          </Select>

          <Select
            value={filters.departmentKey ?? ''}
            onChange={(e) => setFilters((p) => ({ ...p, departmentKey: e.target.value || undefined }))}
            aria-label={t('common.department')}
          >
            <option value="">{t('common.department')}: {t('common.all')}</option>
            {DEFAULT_DEPARTMENT_KEYS.map((key) => (
              <option key={key} value={key}>
                {label(DEPARTMENT_LABELS[key as DepartmentKey], lang)}
              </option>
            ))}
          </Select>

          <Select
            value={filters.language ?? ''}
            onChange={(e) => setFilters((p) => ({ ...p, language: e.target.value || undefined }))}
            aria-label={t('common.language')}
          >
            <option value="">{t('common.language')}: {t('common.all')}</option>
            <option value="ar">{t('common.arabic')}</option>
            <option value="en">{t('common.english')}</option>
          </Select>

          <Input
            type="date"
            value={filters.from?.slice(0, 10) ?? ''}
            onChange={(e) =>
              setFilters((p) => ({ ...p, from: e.target.value ? new Date(e.target.value).toISOString() : undefined }))
            }
            aria-label={t('common.date')}
          />
        </div>
      </form>

      {isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => refetch()} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HistoryIcon className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={filters.archived ? t('history.emptyArchive') : t('history.empty')}
          />
        </Card>
      ) : (
        <Card>
          <ul>
            {data.map((item, index) => (
              <li key={item.id}>
                <Link
                  to={`/correspondence/${item.id}`}
                  className={`flex flex-wrap items-center gap-3 px-5 py-4 transition-colors hover:bg-[rgb(var(--q-surface-2))] ${
                    index > 0 ? 'border-t' : ''
                  }`}
                  style={index > 0 ? { borderColor: 'rgb(var(--q-border))' } : undefined}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title || item.subject || '—'}</p>
                    <p className="q-muted mt-0.5 truncate text-xs">
                      {item.recipient || '—'} · {formatDate(item.created_at, lang)}
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
        </Card>
      )}
    </div>
  )
}
