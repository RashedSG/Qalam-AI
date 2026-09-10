import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  ArrowRight,
  Copy,
  FileCheck2,
  Hash,
  History,
  LayoutTemplate,
  Pencil,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import {
  addVersion,
  deleteCorrespondence,
  getCorrespondence,
  listVersions,
  setArchived,
  updateCorrespondence,
} from '@/services/db/correspondences'
import { addFavorite } from '@/services/db/favorites'
import { createTemplate } from '@/services/db/templates'
import { issueReferenceNumber, listClassificationLevels } from '@/services/db/enterprise'
import { ReferralPanel } from '@/features/enterprise/ReferralPanel'
import { WorkflowPanel } from '@/features/enterprise/WorkflowPanel'
import { AttachmentPanel } from '@/features/enterprise/AttachmentPanel'
import { DocumentPanel } from '@/features/enterprise/DocumentPanel'
import { CORRESPONDENCE_TYPE_LABELS, PRIORITY_LABELS, TONE_LABELS, label } from '@/data/reference'
import { copyToClipboard, deriveTitle, formatDate, formatRelative } from '@/lib/utils'
import type { CorrespondenceType, Tone } from '@/types/domain'

export default function CorrespondenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang, dir } = useI18n()
  const { user } = useAuth()
  const { organization, can } = useAuthorization()
  const [issuing, setIssuing] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [draftSubject, setDraftSubject] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [busyAction, setBusyAction] = useState<'archive' | 'favorite' | 'template' | null>(null)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [templateTitle, setTemplateTitle] = useState('')

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['correspondence', id],
    queryFn: () => getCorrespondence(id!),
    enabled: Boolean(id),
  })

  const levelsQuery = useQuery({
    queryKey: ['classification-levels', organization?.id],
    queryFn: () => listClassificationLevels(organization!.id),
    enabled: Boolean(organization?.id),
  })

  /** اسم التصنيف يُعرض فقط إن كان أعلى من الأدنى — الأدنى ضجيج بصري. */
  const classificationBadge = (() => {
    const level = (levelsQuery.data ?? []).find((item) => item.key === data?.classification_key)
    return level && level.rank > 1 ? level.name_ar : null
  })()

  /** إصدار رقم المراسلة — ذرّي في القاعدة ولا يُعاد إصداره. */
  const issueNumber = async () => {
    if (!data) return
    setIssuing(true)
    try {
      await issueReferenceNumber(data.id)
      await queryClient.invalidateQueries({ queryKey: ['correspondence', id] })
      toast(t('corr.referenceIssued'), 'success')
    } catch {
      toast(t('error.saveFailed'), 'error')
    } finally {
      setIssuing(false)
    }
  }

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

  const toggleArchive = async () => {
    if (!id || !data) return
    setBusyAction('archive')
    try {
      await setArchived(id, !data.is_archived)
      await queryClient.invalidateQueries({ queryKey: ['correspondence', id] })
      await queryClient.invalidateQueries({ queryKey: ['correspondences'] })
      toast(data.is_archived ? t('detail.unarchived') : t('detail.archived'), 'success')
    } catch {
      toast(t('error.saveFailed'), 'error')
    } finally {
      setBusyAction(null)
    }
  }

  const favorite = async () => {
    if (!id || !data || !user) return
    setBusyAction('favorite')
    try {
      await addFavorite({
        user_id: user.id,
        kind: 'correspondence',
        ref_id: id,
        label: data.title || data.subject || '—',
        content: data.recipient,
      })
      await queryClient.invalidateQueries({ queryKey: ['favorites'] })
      toast(t('common.saved'), 'success')
    } catch {
      toast(t('error.saveFailed'), 'error')
    } finally {
      setBusyAction(null)
    }
  }

  /** يحوّل مراسلة أعجبتك إلى قالب تعيد استخدامه لاحقًا. */
  const saveAsTemplate = async () => {
    if (!data || !user) return
    const title = templateTitle.trim()
    if (!title) return
    setBusyAction('template')
    try {
      const isArabic = data.language === 'ar'
      await createTemplate({
        user_id: user.id,
        title_ar: isArabic ? title : '',
        title_en: isArabic ? '' : title,
        body_ar: isArabic ? data.body : '',
        body_en: isArabic ? '' : data.body,
        description_ar: data.subject,
        correspondence_type: data.correspondence_type,
        tone: data.tone,
      })
      await queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast(t('detail.templateSaved'), 'success')
      setTemplateOpen(false)
    } catch {
      toast(t('error.saveFailed'), 'error')
    } finally {
      setBusyAction(null)
    }
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
        {/* عنوان الصفحة الفعلي: كانت الصفحة بلا h1 إطلاقًا، وهي أكثر
            صفحات التطبيق فتحًا. */}
        <CardHeader
          titleAs="h1"
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
              {data.is_archived ? <Badge tone="gold">{t('history.archived')}</Badge> : null}
              {classificationBadge ? <Badge tone="gold">{classificationBadge}</Badge> : null}
              {data.organization_id ? (
                data.reference_number ? (
                  <Badge tone="navy">
                    <span dir="ltr">{data.reference_number}</span>
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={issuing}
                    onClick={issueNumber}
                    title={t('corr.noReference')}
                  >
                    <Hash className="size-3.5" aria-hidden="true" />
                    {t('corr.issueReference')}
                  </Button>
                )
              ) : null}
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
              <Button
                variant="outline"
                size="sm"
                loading={busyAction === 'template'}
                onClick={() => {
                  setTemplateTitle(data.subject || data.title || '')
                  setTemplateOpen(true)
                }}
              >
                <LayoutTemplate className="size-3.5" aria-hidden="true" />
                {t('detail.saveAsTemplate')}
              </Button>
              <Button variant="outline" size="sm" loading={busyAction === 'favorite'} onClick={favorite}>
                <Star className="size-3.5" aria-hidden="true" />
                {t('common.favorite')}
              </Button>
              <Button variant="outline" size="sm" loading={busyAction === 'archive'} onClick={toggleArchive}>
                {data.is_archived ? (
                  <ArchiveRestore className="size-3.5" aria-hidden="true" />
                ) : (
                  <Archive className="size-3.5" aria-hidden="true" />
                )}
                {data.is_archived ? t('detail.unarchive') : t('detail.archive')}
              </Button>
              <Button variant="ghost" size="sm" className="ms-auto" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5 text-red-600" aria-hidden="true" />
                {t('common.delete')}
              </Button>
            </>
          )}
        </CardFooter>
      </Card>

      {/* --------------------- المراسلة المؤسسية (المرحلة ٣) ---------------------
          تظهر فقط للمراسلات المرتبطة بمؤسسة — الوضع الشخصي لا يراها. */}
      {data.organization_id ? (
        <>
          <WorkflowPanel correspondenceId={data.id} currentStatus={data.current_status ?? 'draft'} />
          <ReferralPanel correspondenceId={data.id} />
          <AttachmentPanel
            correspondenceId={data.id}
            organizationId={data.organization_id}
            classificationKey={data.classification_key ?? null}
            canUpload={data.user_id === user?.id || can('attachment.upload')}
          />
          <DocumentPanel correspondence={data} organization={organization ?? null} />
        </>
      ) : null}

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
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        title={t('detail.saveAsTemplate')}
        description={t('detail.saveAsTemplateHint')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setTemplateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={busyAction === 'template'} disabled={!templateTitle.trim()} onClick={saveAsTemplate}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <label htmlFor="tpl-title" className="mb-1.5 block text-sm font-medium">
          {t('templates.name')}
        </label>
        <Input id="tpl-title" value={templateTitle} onChange={(e) => setTemplateTitle(e.target.value)} autoFocus />
      </Modal>

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
