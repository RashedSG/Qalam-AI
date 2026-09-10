import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ScrollText } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { listAuditLog, listMembers } from '@/services/db/organization'
import { formatRelative } from '@/lib/utils'
import { ar, type TranslationKey } from '@/i18n'

const ENTITY_TYPES = ['membership', 'role', 'organization', 'org_unit'] as const

export default function AuditPage() {
  const { t, lang } = useI18n()
  const { organization } = useAuthorization()
  const orgId = organization?.id

  const [entityType, setEntityType] = useState('')

  const entries = useQuery({
    queryKey: ['audit-log', orgId, entityType],
    queryFn: () => listAuditLog(orgId!, { entityType: entityType || undefined }, 200),
    enabled: Boolean(orgId),
  })

  const members = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => listMembers(orgId!),
    enabled: Boolean(orgId),
  })

  /** اسم الفاعل من قائمة الأعضاء — السجل يحفظ المعرّف فقط عن قصد. */
  const actorName = useMemo(() => {
    const map = new Map<string, string>()
    for (const member of members.data ?? []) {
      map.set(member.user_id, member.profile?.full_name || member.profile?.email || member.user_id)
    }
    return map
  }, [members.data])

  /** الأحداث المعروفة مترجمة، وأي حدث جديد يظهر بمفتاحه بدل أن يختفي. */
  const actionLabel = (action: string) => {
    const key = `audit.action.${action}` as TranslationKey
    return key in ar ? t(key) : action
  }

  if (!orgId) return <Card><EmptyState title={t('org.none')} description={t('org.noneHint')} /></Card>

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('audit.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('audit.subtitle')}</p>
      </header>

      <Select
        value={entityType}
        onChange={(e) => setEntityType(e.target.value)}
        aria-label={t('audit.entity')}
        className="sm:w-64"
      >
        <option value="">{t('common.all')}</option>
        {ENTITY_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </Select>

      {entries.isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => entries.refetch()} /> : null}

      {entries.isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : (entries.data ?? []).length === 0 ? (
        <Card>
          <EmptyState
            icon={<ScrollText className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('audit.empty')}
          />
        </Card>
      ) : (
        <ul className="space-y-2">
          {(entries.data ?? []).map((entry) => (
            <li key={entry.id}>
              <Card>
                <CardBody className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-3">
                  <span className="text-sm font-medium">{actionLabel(entry.action)}</span>

                  {entry.metadata?.self_grant === true ? (
                    <Badge tone="gold">{t('audit.selfGrant')}</Badge>
                  ) : null}

                  {entry.previous_status && entry.new_status ? (
                    <span className="q-muted text-xs" dir="ltr">
                      {entry.previous_status} → {entry.new_status}
                    </span>
                  ) : null}

                  <span className="q-muted ms-auto text-xs">
                    {entry.actor_id ? (actorName.get(entry.actor_id) ?? entry.actor_id) : t('audit.system')}
                  </span>
                  <span className="q-muted text-xs">{formatRelative(entry.created_at, lang)}</span>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
