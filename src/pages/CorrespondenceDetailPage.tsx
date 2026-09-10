import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Copy, FileCheck2, History, Pencil, Sparkles, Trash2, X } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import {
  addVersion,
  deleteCorrespondence,
  getCorrespondence,
  listVersions,
  updateCorrespondence,
} from '@/services/db/correspondences'
import { CORRESPONDENCE_TYPE_LABELS, PRIORITY_LABELS, TONE_LABELS, label } from '@/data/reference'
import { copyToClipboard, deriveTitle, formatDate, formatRelative } from '@/lib/utils'
import type { CorrespondenceType, Tone } from '@/types/domain'

export default function CorrespondenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang, dir } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['correspondence', id],
    queryFn: () => getCorrespondence(id!),
    enabled: Boolean(id),
  })

  const versionsQuery = useQuery({
    queryKey: ['correspondence-versions', id],
    queryFn: () => listVersions(id!),
    enabled: Boolean(id),
  })

  // نُهيّئ المحرر من المراسلة المحمّلة، ولا نُغيّره أثناء التحرير.
  useEffect(() => {
    if (!data || editing) return
    setDraftSubject(data.subject)
    setDraftBody(data.body)
  }, [data, editing])

  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft

  const remove = async () => {
    if (!id) return
    setDeleting(true)
    try {
      await deleteCorrespondence(id)
      await queryClient.invalidateQueries({ queryKey: ['correspondences'] })
      toast(t('common.saved'), 'success')
      navigate('/history', { replace: true })
    } catch {
      toast(t('error.deleteFailed'), 'error')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  /**
   * يحفظ التعديل بعد أرشفة النص السابق كإصدار،
   * فلا يُفقد أي نص سابق ويمكن الرجوع إليه لاحقًا.
   */
  const saveEdit = async () => {
    if (!id || !data || !user) return
    const unchanged = draftBody === data.body && draftSubject === data.subject
    if (unchanged) {
      setEditing(false)
      return
    }

    setSavingEdit(true)
    try {
      await addVersion({
        correspondence_id: id,
        user_id: user.id,
        variant_kind: 'previous',
        subject: data.subject,
        body: data.body,
        note: t('detail.autoVersionNote'),
      })

      await updateCorrespondence(id, {
        subject: draftSubject,
        body: draftBody,
        title: deriveTitle(draftSubject, draftBody),
      })

      await queryClient.invalidateQueries({ queryKey: ['correspondence', id] })
      await queryClient.invalidateQueries({ queryKey: ['correspondence-versions', id] })
      await queryClient.invalidateQueries({ queryKey: ['correspondences'] })
      toast(t('common.saved'), 'success')
      setEditing(false)
    } catch {
      toast(t('error.saveFailed'), 'error')
    } finally {
      setSavingEdit(false)
    }
  }

  const cancelEdit = () => {
    if (data) {
      setDraftSubject(data.subject)
      setDraftBody(data.body)
    }
    setEditing(false)
  }

  /** يحمّل نص إصدار سابق في المحرر — لا يُثبَّت إلا بالحفظ. */
  const loadVersion = (subject: string, body: string) => {
    setDraftSubject(subject)
    setDraftBody(body)
    setEditing(true)
    toast(t('detail.versionLoaded'), 'info')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (isError) return <ErrorState message={t('error.loadFailed')} onRetry={() => refetch()} />

  if (!data) {
    return (
      <Card>
        <EmptyState
          title={t('error.notFound')}
          description={t('error.notFoundBody')}
          action={
            <Link to="/history" className="font-semibold underline">
              {t('history.title')}
            </Link>
          }
        />
      </Card>
    )
  }

  const versions = versionsQuery.data ?? []

  return (
    <div className="space-y-6">
      <Link to="/history" className="q-muted inline-flex items-center gap-1.5 text-sm hover:underline">
        <Back className="size-4" aria-hidden="true" />
        {t('history.title')}
      </Link>

      <Card>
        <CardHeader
          title={data.title || data.subject || '—'}
          description={`${data.recipient || '—'} · ${formatDate(data.created_at, lang)}`}
          action={
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="navy">
                {label(CORRESPONDENCE_TYPE_LABELS[data.correspondence_type as CorrespondenceType], lang) ||
                  data.correspondence_type}
              </Badge>
              <Badge tone="neutral">{label(TONE_LABELS[data.tone as Tone], lang) || data.tone}</Badge>
              <Badge tone={data.priority === 'urgent' ? 'danger' : 'neutral'}>
                {label(PRIORITY_LABELS[data.priority], lang)}
              </Badge>
            </div>
          }
        />

        <CardBody className="space-y-4">
          {editing ? (
            <>
              <div>
                <label htmlFor="detail-subject" className="mb-1.5 block text-sm font-medium">
                  {t('common.subject')}
                </label>
                <Input
                  id="detail-subject"
                  value={draftSubject}
                  onChange={(e) => setDraftSubject(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="detail-body" className="mb-1.5 block text-sm font-medium">
                  {t('detail.editBody')}
                </label>
                <Textarea
                  id="detail-body"
                  value={draftBody}
                  onChange={(e) => setDraftBody(e.target.value)}
                  rows={16}
                  dir={data.language === 'ar' ? 'rtl' : 'ltr'}
                />
              </div>
            </>
          ) : (
            <>
              {data.subject ? (
                <p className="text-sm font-semibold">
                  <span className="q-muted font-normal">{t('common.subject')}: </span>
                  {data.subject}
                </p>
              ) : null}
              <div className="q-letter text-[0.95rem]" dir={data.language === 'ar' ? 'rtl' : 'ltr'}>
                {data.body}
              </div>
            </>
          )}
        </CardBody>

        <CardFooter>
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={cancelEdit} disabled={savingEdit}>
                <X className="size-3.5" aria-hidden="true" />
                {t('common.cancel')}
              </Button>
              <Button className="ms-auto" size="sm" loading={savingEdit} onClick={saveEdit}>
                {t('detail.saveChanges')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="size-3.5" aria-hidden="true" />
                {t('common.edit')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (await copyToClipboard(data.body)) toast(t('common.copied'), 'success')
                }}
              >
                <Copy className="size-3.5" aria-hidden="true" />
                {t('common.copy')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/improve', { state: { body: data.body } })}>
                <Sparkles className="size-3.5" aria-hidden="true" />
                {t('nav.improve')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate('/review', { state: { body: data.body } })}>
                <FileCheck2 className="size-3.5" aria-hidden="true" />
                {t('result.review')}
              </Button>
              <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5 text-red-600" aria-hidden="true" />
                {t('common.delete')}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>

      {/* ------------------------------ سجل الإصدارات ------------------------------ */}
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <History className="size-4 text-gold-600" aria-hidden="true" />
              {t('detail.versions')}
            </span>
          }
          description={t('detail.versionsHint')}
          action={versions.length ? <Badge tone="neutral">{versions.length}</Badge> : undefined}
        />

        {versionsQuery.isLoading ? (
          <CardBody className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </CardBody>
        ) : versions.length === 0 ? (
          <CardBody>
            <p className="q-muted text-sm">{t('detail.noVersions')}</p>
          </CardBody>
        ) : (
          <ul>
            {versions.map((version, index) => (
              <li
                key={version.id}
                className={`flex flex-wrap items-start gap-3 px-5 py-4 ${index > 0 ? 'border-t' : ''}`}
                style={index > 0 ? { borderColor: 'rgb(var(--q-border))' } : undefined}
              >
                <div className="min-w-0 flex-1">
                  <p className="q-muted text-xs">
                    {formatDate(version.created_at, lang)} · {formatRelative(version.created_at, lang)}
                  </p>
                  {version.subject ? <p className="mt-0.5 text-sm font-medium">{version.subject}</p> : null}
                  <p className="q-letter mt-1 max-h-16 overflow-hidden text-xs opacity-70">{version.body}</p>
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (await copyToClipboard(version.body)) toast(t('common.copied'), 'success')
                    }}
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                    {t('common.copy')}
                  </Button>
                  <Button size="sm" onClick={() => loadVersion(version.subject, version.body)}>
                    {t('detail.restore')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('common.delete')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={deleting} onClick={remove}>
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
