import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, LayoutTemplate, Plus, Star, Trash2 } from 'lucide-react'
import { Card, CardBody, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { createTemplate, deleteTemplate, listTemplates } from '@/services/db/templates'
import { addFavorite } from '@/services/db/favorites'
import { CORRESPONDENCE_TYPE_LABELS, TONE_LABELS, label } from '@/data/reference'
import { CORRESPONDENCE_TYPES, TONES, type CorrespondenceType, type Tone } from '@/types/domain'
import { copyToClipboard } from '@/lib/utils'
import type { Template } from '@/types/database'

/** القوالب المُنشأة من مراسلة إنجليزية تُخزَّن في الحقول الإنجليزية — نقرأ المتاح منهما. */
const titleOf = (tpl: Template) => tpl.title_ar || tpl.title_en || '—'
const bodyOf = (tpl: Template) => tpl.body_ar || tpl.body_en || ''

export default function TemplatesPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<CorrespondenceType | ''>('')

  const [createOpen, setCreateOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<Template | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    body: '',
    correspondenceType: 'official_letter' as CorrespondenceType,
    tone: 'formal' as Tone,
  })

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
        titleOf(tpl).toLowerCase().includes(term) ||
        tpl.description_ar.toLowerCase().includes(term) ||
        bodyOf(tpl).toLowerCase().includes(term)
      )
    })
  }, [data, search, typeFilter])

  const applyTemplate = (body: string) => {
    navigate('/write', { state: { idea: body } })
  }

  const submitTemplate = async () => {
    if (!user || !form.title.trim() || !form.body.trim()) return
    setSaving(true)
    try {
      await createTemplate({
        user_id: user.id,
        title_ar: form.title.trim(),
        description_ar: form.description.trim(),
        body_ar: form.body,
        correspondence_type: form.correspondenceType,
        tone: form.tone,
      })
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast(t('common.saved'), 'success')
      setCreateOpen(false)
      setForm({ title: '', description: '', body: '', correspondenceType: 'official_letter', tone: 'formal' })
    } catch {
      toast(t('error.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const removeTemplate = async () => {
    if (!pendingDelete) return
    setSaving(true)
    try {
      await deleteTemplate(pendingDelete.id)
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast(t('common.saved'), 'success')
      setPendingDelete(null)
    } catch {
      toast(t('error.deleteFailed'), 'error')
    } finally {
      setSaving(false)
    }
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
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('templates.title')}</h1>
          <p className="q-muted mt-1.5 leading-7">{t('templates.subtitle')}</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('templates.new')}
        </Button>
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
                <h2 className="text-base font-semibold">{titleOf(tpl)}</h2>
                {tpl.description_ar ? <p className="q-muted mt-1.5 text-sm leading-7">{tpl.description_ar}</p> : null}
                <p className="q-letter mt-3 max-h-32 overflow-hidden text-xs opacity-70">{bodyOf(tpl)}</p>
              </CardBody>
              <CardFooter>
                <Button size="sm" onClick={() => applyTemplate(bodyOf(tpl))}>
                  {t('templates.use')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (await copyToClipboard(bodyOf(tpl))) toast(t('common.copied'), 'success')
                  }}
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                  {t('common.copy')}
                </Button>
                <span className="ms-auto flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => favorite(tpl.id, titleOf(tpl))}
                    aria-label={t('common.favorite')}
                  >
                    <Star className="size-4" aria-hidden="true" />
                  </Button>
                  {!tpl.is_system ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(tpl)}
                      aria-label={t('common.delete')}
                    >
                      <Trash2 className="size-4 text-red-600" aria-hidden="true" />
                    </Button>
                  ) : null}
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('templates.new')}
        description={t('templates.newHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={saving}
              disabled={!form.title.trim() || !form.body.trim()}
              onClick={submitTemplate}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('templates.name')} required>
            {(p) => (
              <Input {...p} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            )}
          </Field>

          <Field label={`${t('templates.description')} — ${t('common.optional')}`}>
            {(p) => (
              <Input
                {...p}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.type')}>
              {(p) => (
                <Select
                  {...p}
                  value={form.correspondenceType}
                  onChange={(e) => setForm({ ...form, correspondenceType: e.target.value as CorrespondenceType })}
                >
                  {CORRESPONDENCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {label(CORRESPONDENCE_TYPE_LABELS[type], lang)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field label={t('common.tone')}>
              {(p) => (
                <Select {...p} value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value as Tone })}>
                  {TONES.map((tone) => (
                    <option key={tone} value={tone}>
                      {label(TONE_LABELS[tone], lang)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label={t('templates.body')} hint={t('templates.bodyHint')} required>
            {(p) => (
              <Textarea {...p} rows={10} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            )}
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={t('common.delete')}
        description={pendingDelete ? titleOf(pendingDelete) : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={saving} onClick={removeTemplate}>
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7">{t('common.irreversible')}</p>
      </Modal>
    </div>
  )
}
