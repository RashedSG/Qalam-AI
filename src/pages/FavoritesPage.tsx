import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Star, Trash2 } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { listFavorites, removeFavorite } from '@/services/db/favorites'
import { formatRelative } from '@/lib/utils'

export default function FavoritesPage() {
  const { t, lang, dir } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight

  /** المفضلة تخزّن `ref_id` للعنصر الأصلي — نفتحه فقط حين نعرف صفحته. */
  const targetOf = (kind: string, refId: string | null) => {
    if (!refId) return null
    if (kind === 'correspondence') return `/correspondence/${refId}`
    if (kind === 'template') return '/templates'
    return null
  }

  const kindLabel = (kind: string) => {
    if (kind === 'template') return t('favorites.kind.template')
    if (kind === 'phrase') return t('favorites.kind.phrase')
    if (kind === 'correspondence') return t('favorites.kind.correspondence')
    return kind
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['favorites', user?.id],
    queryFn: () => listFavorites(user!.id),
    enabled: Boolean(user?.id),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeFavorite(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['favorites', user?.id] })
      toast(t('common.saved'), 'success')
    },
    onError: () => toast(t('error.deleteFailed'), 'error'),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('favorites.title')}</h1>
      </header>

      {isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => refetch()} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Star className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('favorites.empty')}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.map((fav) => (
            <li key={fav.id}>
              <Card>
                <CardBody className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="gold">{kindLabel(fav.kind)}</Badge>
                      <span className="q-muted text-xs">{formatRelative(fav.created_at, lang)}</span>
                    </div>
                    <p className="mt-2 font-medium">{fav.label || '—'}</p>
                    {fav.content ? <p className="q-muted mt-1 text-sm leading-7">{fav.content}</p> : null}
                  </div>
                  <span className="flex shrink-0 gap-1">
                    {targetOf(fav.kind, fav.ref_id) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(targetOf(fav.kind, fav.ref_id)!)}
                      >
                        {t('favorites.open')}
                        <Arrow className="size-3.5" aria-hidden="true" />
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMutation.mutate(fav.id)}
                      aria-label={t('common.unfavorite')}
                    >
                      <Trash2 className="size-4 text-red-600" aria-hidden="true" />
                    </Button>
                  </span>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
