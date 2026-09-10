import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookOpen, Plus, Sparkles, Star, Trash2 } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { Spinner } from '@/components/ui/Spinner'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useAiTask } from '@/hooks/useAi'
import { useToast } from '@/components/ui/Toast'
import { createDictionaryEntry, deleteDictionaryEntry, listDictionary } from '@/services/db/dictionary'
import { addFavorite } from '@/services/db/favorites'
import { ai, type PhraseExplanation } from '@/services/ai'
import { DICTIONARY_CATEGORY_LABELS, label } from '@/data/reference'
import { DICTIONARY_CATEGORIES, type DictionaryCategory } from '@/types/domain'
import { cn } from '@/lib/utils'
import type { DictionaryEntry } from '@/types/database'

const emptyForm = {
  phrase: '',
  meaning: '',
  whenToUse: '',
  whenNotToUse: '',
  example: '',
  category: 'openings' as DictionaryCategory,
}

export default function DictionaryPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<DictionaryCategory | ''>('')
  const [selected, setSelected] = useState<DictionaryEntry | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<DictionaryEntry | null>(null)
  const [form, setForm] = useState(emptyForm)

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

  const submitEntry = async () => {
    if (!user || !form.phrase.trim() || !form.meaning.trim()) return
    setSaving(true)
    try {
      await createDictionaryEntry({
        user_id: user.id,
        category: form.category,
        phrase: form.phrase.trim(),
        meaning: form.meaning.trim(),
        when_to_use: form.whenToUse.trim(),
        when_not_to_use: form.whenNotToUse.trim(),
        example: form.example.trim(),
        language: lang,
      })
      await queryClient.invalidateQueries({ queryKey: ['dictionary'] })
      toast(t('common.saved'), 'success')
      setCreateOpen(false)
      setForm(emptyForm)
    } catch {
      toast(t('error.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const removeEntry = async () => {
    if (!pendingDelete) return
    setSaving(true)
    try {
      await deleteDictionaryEntry(pendingDelete.id)
      await queryClient.invalidateQueries({ queryKey: ['dictionary'] })
      toast(t('common.saved'), 'success')
      setPendingDelete(null)
    } catch {
      toast(t('error.deleteFailed'), 'error')
    } finally {
      setSaving(false)
    }
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('dictionary.title')}</h1>
          <p className="q-muted mt-1.5 leading-7">{t('dictionary.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('dictionary.new')}
        </Button>
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
                    <span className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => favorite(entry)}
                        aria-label={t('common.favorite')}
                      >
                        <Star className="size-4" aria-hidden="true" />
                      </Button>
                      {!entry.is_system ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDelete(entry)}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="size-4 text-red-600" aria-hidden="true" />
                        </Button>
                      ) : null}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge tone="neutral">
                      {label(DICTIONARY_CATEGORY_LABELS[entry.category as DictionaryCategory], lang) || entry.category}
                    </Badge>
                    {!entry.is_system ? <Badge tone="gold">{t('dictionary.mine')}</Badge> : null}
                  </div>
                  <p className="q-muted mt-2.5 text-sm leading-7">{entry.meaning}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('dictionary.new')}
        description={t('dictionary.newHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={saving} disabled={!form.phrase.trim() || !form.meaning.trim()} onClick={submitEntry}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('dictionary.phrase')} required>
            {(p) => <Input {...p} value={form.phrase} onChange={(e) => setForm({ ...form, phrase: e.target.value })} />}
          </Field>

          <Field label={t('dictionary.meaning')} required>
            {(p) => (
              <Textarea {...p} rows={2} value={form.meaning} onChange={(e) => setForm({ ...form, meaning: e.target.value })} />
            )}
          </Field>

          <Field label={t('common.category')}>
            {(p) => (
              <Select
                {...p}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as DictionaryCategory })}
              >
                {DICTIONARY_CATEGORIES.map((key) => (
                  <option key={key} value={key}>
                    {label(DICTIONARY_CATEGORY_LABELS[key], lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`${t('dictionary.whenToUse')} — ${t('common.optional')}`}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={form.whenToUse}
                  onChange={(e) => setForm({ ...form, whenToUse: e.target.value })}
                />
              )}
            </Field>
            <Field label={`${t('dictionary.whenNotToUse')} — ${t('common.optional')}`}>
              {(p) => (
                <Textarea
                  {...p}
                  rows={2}
                  value={form.whenNotToUse}
                  onChange={(e) => setForm({ ...form, whenNotToUse: e.target.value })}
                />
              )}
            </Field>
          </div>

          <Field label={`${t('dictionary.example')} — ${t('common.optional')}`}>
            {(p) => (
              <Textarea {...p} rows={2} value={form.example} onChange={(e) => setForm({ ...form, example: e.target.value })} />
            )}
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={t('common.delete')}
        description={pendingDelete ? `«${pendingDelete.phrase}»` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={saving} onClick={removeEntry}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7">{t('common.irreversible')}</p>
      </Modal>

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
            {selected.when_to_use ? (
              <div>
                <dt className="q-muted text-xs font-semibold">{t('dictionary.whenToUse')}</dt>
                <dd className="mt-1 leading-7">{selected.when_to_use}</dd>
              </div>
            ) : null}
            {selected.when_not_to_use ? (
              <div>
                <dt className="q-muted text-xs font-semibold">{t('dictionary.whenNotToUse')}</dt>
                <dd className="mt-1 leading-7">{selected.when_not_to_use}</dd>
              </div>
            ) : null}
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
