import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Copy, LayoutTemplate, Star } from 'lucide-react'
import { Card, CardBody, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { listTemplates } from '@/services/db/templates'
import { addFavorite } from '@/services/db/favorites'
import { CORRESPONDENCE_TYPE_LABELS, label } from '@/data/reference'
import { CORRESPONDENCE_TYPES, type CorrespondenceType } from '@/types/domain'
import { copyToClipboard } from '@/lib/utils'

export default function TemplatesPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<CorrespondenceType | ''>('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['templates'],
    queryFn: listTemplates,
  })

  const filtered = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()
    return data.filter((tpl) => {
      if (typeFilter && tpl.correspondence_type !== typeFilter) return false
      if (!term) return true
      return (
        tpl.title_ar.toLowerCase().includes(term) ||
        tpl.title_en.toLowerCase().includes(term) ||
        tpl.description_ar.toLowerCase().includes(term) ||
        tpl.body_ar.toLowerCase().includes(term)
      )
    })
  }, [data, search, typeFilter])

  const applyTemplate = (body: string) => {
    navigate('/write', { state: { idea: body } })
  }

  const favorite = async (id: string, title: string) => {
    if (!user) return
    try {
      await addFavorite({ user_id: user.id, kind: 'template', ref_id: id, label: title })
      toast(t('common.saved'), 'success')
    } catch {
      toast(t('error.saveFailed'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('templates.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('templates.subtitle')}</p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search')}
          aria-label={t('common.search')}
          className="sm:flex-1"
        />
        <Select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as CorrespondenceType | '')}
          aria-label={t('common.type')}
          className="sm:w-56"
        >
          <option value="">{t('common.all')}</option>
          {CORRESPONDENCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {label(CORRESPONDENCE_TYPE_LABELS[type], lang)}
            </option>
          ))}
        </Select>
      </div>

      {isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => refetch()} /> : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutTemplate className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('templates.empty')}
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((tpl) => (
            <Card key={tpl.id} className="flex flex-col">
              <CardBody className="flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">
                    {label(CORRESPONDENCE_TYPE_LABELS[tpl.correspondence_type as CorrespondenceType], lang) ||
                      tpl.correspondence_type}
                  </Badge>
                  {tpl.is_system ? <Badge tone="gold">{t('templates.system')}</Badge> : null}
                </div>
                <h2 className="text-base font-semibold">{lang === 'ar' ? tpl.title_ar : tpl.title_en || tpl.title_ar}</h2>
                {tpl.description_ar ? <p className="q-muted mt-1.5 text-sm leading-7">{tpl.description_ar}</p> : null}
                <p className="q-letter mt-3 max-h-32 overflow-hidden text-xs opacity-70">{tpl.body_ar}</p>
              </CardBody>
              <CardFooter>
                <Button size="sm" onClick={() => applyTemplate(tpl.body_ar)}>
                  {t('templates.use')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (await copyToClipboard(tpl.body_ar)) toast(t('common.copied'), 'success')
                  }}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  {t('common.copy')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ms-auto"
                  onClick={() => favorite(tpl.id, tpl.title_ar)}
                  aria-label={t('common.favorite')}
                >
                  <Star className="size-4" aria-hidden="true" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
