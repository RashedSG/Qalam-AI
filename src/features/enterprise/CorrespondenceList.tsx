import { Link } from 'react-router-dom'
import { AlertTriangle, Inbox } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { formatRelative } from '@/lib/utils'
import type { ClassificationLevel, Correspondence } from '@/types/database'
import type { TranslationKey } from '@/i18n'

/** التصنيف الأعلى رتبة يُلوَّن أبرز — السرية أهم ما يُقرأ بسرعة. */
function classificationTone(rank: number): 'gold' | 'neutral' {
  return rank >= 2 ? 'gold' : 'neutral'
}

export function CorrespondenceList({
  items,
  loading,
  emptyLabel,
  levels,
}: {
  items: Correspondence[]
  loading: boolean
  emptyLabel: string
  levels: ClassificationLevel[]
}) {
  const { t, lang } = useI18n()
  const now = Date.now()

  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<Inbox className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
          title={emptyLabel}
        />
      </Card>
    )
  }

  return (
    <ul className="space-y-3">
      {items.map((item) => {
        const level = levels.find((l) => l.key === item.classification_key)
        const overdue = item.due_at ? new Date(item.due_at).getTime() < now : false

        return (
          <li key={item.id}>
            <Card>
              <CardBody className="space-y-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">
                    {t(`dir.${item.direction ?? 'outgoing'}` as TranslationKey)}
                  </Badge>
                  <Badge tone="neutral">
                    {t(`status.${item.current_status ?? 'draft'}` as TranslationKey)}
                  </Badge>
                  {level && level.rank > 1 ? (
                    <Badge tone={classificationTone(level.rank)}>{level.name_ar}</Badge>
                  ) : null}
                  {overdue ? (
                    <Badge tone="gold">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {t('corr.overdue')}
                    </Badge>
                  ) : null}
                  <span className="q-muted ms-auto text-xs" dir="ltr">
                    {item.reference_number || t('corr.noReference')}
                  </span>
                </div>

                <Link to={`/correspondence/${item.id}`} className="block font-medium hover:underline">
                  {item.subject || '—'}
                </Link>

                <div className="q-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  {item.sender ? (
                    <span>
                      {t('inbox.sender')}: {item.sender}
                    </span>
                  ) : null}
                  {item.recipient ? (
                    <span>
                      {t('common.recipient')}: {item.recipient}
                    </span>
                  ) : null}
                  <span>{formatRelative(item.created_at, lang)}</span>
                </div>
              </CardBody>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
