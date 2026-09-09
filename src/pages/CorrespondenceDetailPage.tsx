import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Copy, FileCheck2, Sparkles, Trash2 } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useToast } from '@/components/ui/Toast'
import { deleteCorrespondence, getCorrespondence } from '@/services/db/correspondences'
import { CORRESPONDENCE_TYPE_LABELS, PRIORITY_LABELS, TONE_LABELS, label } from '@/data/reference'
import { copyToClipboard, formatDate } from '@/lib/utils'
import type { CorrespondenceType, Tone } from '@/types/domain'

export default function CorrespondenceDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { t, lang, dir } = useI18n()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['correspondence', id],
    queryFn: () => getCorrespondence(id!),
    enabled: Boolean(id),
  })

  const Back = dir === 'rtl' ? ArrowRight : ArrowLeft

  const remove = async () => {
    if (!id) return
    setDeleting(true)
    try {
      await deleteCorrespondence(id)
      toast(t('common.saved'), 'success')
      navigate('/history', { replace: true })
    } catch {
      toast(t('error.deleteFailed'), 'error')
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
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
        <CardBody>
          {data.subject ? (
            <p className="mb-4 text-sm font-semibold">
              <span className="q-muted font-normal">{t('common.subject')}: </span>
              {data.subject}
            </p>
          ) : null}
          <div className="q-letter text-[0.95rem]" dir={data.language === 'ar' ? 'rtl' : 'ltr'}>
            {data.body}
          </div>
        </CardBody>
        <CardFooter>
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
        </CardFooter>
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
        <p className="text-sm leading-7">لا يمكن التراجع عن هذا الإجراء.</p>
      </Modal>
    </div>
  )
}
