import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { CorrespondenceList } from '@/features/enterprise/CorrespondenceList'
import { listByDirection, listClassificationLevels } from '@/services/db/enterprise'
import type { CorrespondenceStatus } from '@/types/database'
import type { TranslationKey } from '@/i18n'

const STATUSES: CorrespondenceStatus[] = [
  'draft', 'in_review', 'returned', 'in_approval', 'approved', 'signed', 'issued', 'closed',
]

export default function OutboxPage() {
  const { t } = useI18n()
  const { organization } = useAuthorization()
  const orgId = organization?.id

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')

  const items = useQuery({
    queryKey: ['correspondence', orgId, 'outgoing', search, status],
    queryFn: () =>
      listByDirection(orgId!, 'outgoing', {
        search: search || undefined,
        status: status || undefined,
      }),
    enabled: Boolean(orgId),
  })
  const levels = useQuery({
    queryKey: ['classification-levels', orgId],
    queryFn: () => listClassificationLevels(orgId!),
    enabled: Boolean(orgId),
  })

  if (!orgId) {
    return <Card><EmptyState title={t('org.none')} description={t('org.noneHint')} /></Card>
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('outbox.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('outbox.subtitle')}</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('history.searchPlaceholder')}
          aria-label={t('common.search')}
          className="sm:flex-1"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label={t('common.filter')}
          className="sm:w-56"
        >
          <option value="">{t('common.all')}</option>
          {STATUSES.map((key) => (
            <option key={key} value={key}>
              {t(`status.${key}` as TranslationKey)}
            </option>
          ))}
        </Select>
      </div>

      {items.isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => items.refetch()} /> : null}

      <CorrespondenceList
        items={items.data ?? []}
        loading={items.isLoading}
        emptyLabel={t('outbox.empty')}
        levels={levels.data ?? []}
      />
    </div>
  )
}
