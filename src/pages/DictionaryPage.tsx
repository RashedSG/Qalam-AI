import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, Sparkles, Star } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { Spinner } from '@/components/ui/Spinner'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useAiTask } from '@/hooks/useAi'
import { useToast } from '@/components/ui/Toast'
import { listDictionary } from '@/services/db/dictionary'
import { addFavorite } from '@/services/db/favorites'
import { ai, type PhraseExplanation } from '@/services/ai'
import { DICTIONARY_CATEGORY_LABELS, label } from '@/data/reference'
import { DICTIONARY_CATEGORIES, type DictionaryCategory } from '@/types/domain'
import { cn } from '@/lib/utils'
import type { DictionaryEntry } from '@/types/database'

export default function DictionaryPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<DictionaryCategory | ''>('')
  const [selected, setSelected] = useState<DictionaryEntry | null>(null)

  const explainTask = useAiTask<PhraseExplanation>(ai.explainPhrase)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dictionary'],
    queryFn: listDictionary,
  })

  const filtered = useMemo(() => {
    if (!data) return []
    const term = search.trim().toLowerCase()
    return data.filter((entry) => {
      if (category && entry.category !== category) return false
      if (!term) return true
      return (
        entry.phrase.toLowerCase().includes(term) ||
        entry.meaning.toLowerCase().includes(term) ||
        entry.example.toLowerCase().includes(term)
      )
    })
  }, [data, search, category])

  const openEntry = (entry: DictionaryEntry) => {
    explainTask.reset()
    setSelected(entry)
  }

  const favorite = async (entry: DictionaryEntry) => {
    if (!user) return
    try {
      await addFavorite({
        user_id: user.id,
        kind: 'phrase',
        ref_id: entry.id,
        label: entry.phrase,
        content: entry.meaning,
      })
      toast(t('common.saved'), 'success')
    } catch {
      toast(t('error.saveFailed'), 'error')
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('dictionary.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('dictionary.subtitle')}</p>
      </header>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('dictionary.searchPlaceholder')}
        aria-label={t('common.search')}
      />

      <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('common.filter')}>
        <button
          type="button"
          onClick={() => setCategory('')}
          aria-pressed={category === ''}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
            category === ''
              ? 'border-navy-700 bg-navy-700 text-white dark:border-beige-200 dark:bg-beige-100 dark:text-navy-900'
              : 'border-[rgb(var(--q-border))] hover:bg-[rgb(var(--q-surface-2))]',
          )}
        >
          {t('common.all')}
        </button>
        {DICTIONARY_CATEGORIES.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setCategory(key)}
            aria-pressed={category === key}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              category === key
                ? 'border-navy-700 bg-navy-700 text-white dark:border-beige-200 dark:bg-beige-100 dark:text-navy-900'
                : 'border-[rgb(var(--q-border))] hover:bg-[rgb(var(--q-surface-2))]',
            )}
          >
            {label(DICTIONARY_CATEGORY_LABELS[key], lang)}
          </button>
        ))}
      </div>

      {isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => refetch()} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={<BookOpen className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('dictionary.empty')}
          />
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {filtered.map((entry) => (
            <li key={entry.id}>
              <Card className="h-full">
                <CardBody>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => openEntry(entry)}
                      className="text-start text-base font-semibold hover:underline"
                    >
                      «{entry.phrase}»
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => favorite(entry)}
                      aria-label={t('common.favorite')}
                    >
                      <Star className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <Badge tone="neutral">
                    {label(DICTIONARY_CATEGORY_LABELS[entry.category as DictionaryCategory], lang) || entry.category}
                  </Badge>
                  <p className="q-muted mt-2.5 text-sm leading-7">{entry.meaning}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `«${selected.phrase}»` : ''}
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => selected && explainTask.run({ phrase: selected.phrase, language: lang })}
              loading={explainTask.loading}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              {t('dictionary.explain')}
            </Button>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        {selected ? (
          <dl className="space-y-4 text-sm">
            <div>
              <dt className="q-muted text-xs font-semibold">{t('dictionary.meaning')}</dt>
              <dd className="mt-1 leading-7">{selected.meaning}</dd>
            </div>
            <div>
              <dt className="q-muted text-xs font-semibold">{t('dictionary.whenToUse')}</dt>
              <dd className="mt-1 leading-7">{selected.when_to_use}</dd>
            </div>
            <div>
              <dt className="q-muted text-xs font-semibold">{t('dictionary.whenNotToUse')}</dt>
              <dd className="mt-1 leading-7">{selected.when_not_to_use}</dd>
            </div>
            {selected.example ? (
              <div>
                <dt className="q-muted text-xs font-semibold">{t('dictionary.example')}</dt>
                <dd className="q-letter mt-1 rounded-lg bg-[rgb(var(--q-surface-2))] p-3">{selected.example}</dd>
              </div>
            ) : null}
            {selected.alternatives.length ? (
              <div>
                <dt className="q-muted text-xs font-semibold">{t('dictionary.alternatives')}</dt>
                <dd className="mt-1.5 flex flex-wrap gap-1.5">
                  {selected.alternatives.map((alt, i) => (
                    <Badge key={`${alt}-${i}`} tone="gold">
                      {alt}
                    </Badge>
                  ))}
                </dd>
              </div>
            ) : null}

            {explainTask.loading ? (
              <div className="flex items-center gap-2 pt-2">
                <Spinner className="size-4" />
                <span className="q-muted text-xs">{t('common.loading')}</span>
              </div>
            ) : null}

            {explainTask.error ? <ErrorState message={explainTask.error} /> : null}

            {explainTask.data ? (
              <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-4">
                <p className="mb-2 text-xs font-semibold text-gold-600 dark:text-gold-400">
                  {t('dictionary.explain')}
                </p>
                <p className="leading-7">{explainTask.data.meaning}</p>
                <p className="mt-2 leading-7">
                  <strong>{t('dictionary.whenToUse')}:</strong> {explainTask.data.whenToUse}
                </p>
                <p className="mt-2 leading-7">
                  <strong>{t('dictionary.whenNotToUse')}:</strong> {explainTask.data.whenNotToUse}
                </p>
                {explainTask.data.alternatives.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {explainTask.data.alternatives.map((alt, i) => (
                      <Badge key={`${alt}-${i}`} tone="neutral">
                        {alt}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </dl>
        ) : null}
      </Modal>
    </div>
  )
}
