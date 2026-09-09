import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star, Trash2 } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { listFavorites, removeFavorite } from '@/services/db/favorites'
import { formatRelative } from '@/lib/utils'

const KIND_LABEL: Record<string, string> = {
  template: 'قالب',
  phrase: 'عبارة',
  correspondence: 'مراسلة',
}

export default function FavoritesPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

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
                      <Badge tone="gold">{KIND_LABEL[fav.kind] ?? fav.kind}</Badge>
                      <span className="q-muted text-xs">{formatRelative(fav.created_at, lang)}</span>
                    </div>
                    <p className="mt-2 font-medium">{fav.label || '—'}</p>
                    {fav.content ? <p className="q-muted mt-1 text-sm leading-7">{fav.content}</p> : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeMutation.mutate(fav.id)}
                    aria-label={t('common.unfavorite')}
                  >
                    <Trash2 className="size-4 text-red-600" aria-hidden="true" />
                  </Button>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
