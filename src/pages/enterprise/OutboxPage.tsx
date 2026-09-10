import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Card } from '@/components/ui/Card'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { CorrespondenceList } from '@/features/enterprise/CorrespondenceList'
import { CorrespondenceFilters } from '@/features/enterprise/CorrespondenceFilters'
import { type DirectionFilters, listByDirection, listClassificationLevels } from '@/services/db/enterprise'

export default function OutboxPage() {
  const { t } = useI18n()
  const { organization } = useAuthorization()
  const orgId = organization?.id

  const [filters, setFilters] = useState<DirectionFilters>({})

  const items = useQuery({
    queryKey: ['correspondence', orgId, 'outgoing', filters],
    queryFn: () => listByDirection(orgId!, 'outgoing', filters),
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

      <CorrespondenceFilters
        organizationId={orgId}
        levels={levels.data ?? []}
        value={filters}
        onChange={setFilters}
      />

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
