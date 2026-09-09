import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, FileEdit, Files, Trash2 } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import { deleteDraft, duplicateDraft, listDrafts } from '@/services/db/drafts'
import { CORRESPONDENCE_TYPE_LABELS, LANGUAGE_LABELS, label } from '@/data/reference'
import { copyToClipboard, formatRelative } from '@/lib/utils'
import type { CorrespondenceType } from '@/types/domain'
import type { Draft } from '@/types/database'

export default function DraftsPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<Draft | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['drafts', user?.id],
    queryFn: () => listDrafts(user!.id),
    enabled: Boolean(user?.id),
  })

  const removeMutation = useMutation({
    mutationFn: (id: string) => deleteDraft(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts', user?.id] })
      toast(t('common.saved'), 'success')
      setPendingDelete(null)
    },
    onError: () => toast(t('error.deleteFailed'), 'error'),
  })

  const duplicateMutation = useMutation({
    mutationFn: (draft: Draft) => duplicateDraft(draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['drafts', user?.id] })
      toast(t('common.saved'), 'success')
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('drafts.title')}</h1>
      </header>

      {isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => refetch()} /> : null}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <Card>
          <EmptyState
            icon={<FileEdit className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('drafts.empty')}
            action={
              <Link
                to="/write"
                className="inline-flex h-11 items-center rounded-xl bg-navy-700 px-4 text-sm font-medium text-white hover:bg-navy-800 dark:bg-beige-100 dark:text-navy-900"
              >
                {t('drafts.emptyCta')}
              </Link>
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.map((draft) => (
            <li key={draft.id}>
              <Card>
                <CardBody className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold">{draft.title || draft.subject || '—'}</h2>
                    <div className="q-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span>
                        {label(CORRESPONDENCE_TYPE_LABELS[draft.correspondence_type as CorrespondenceType], lang) ||
                          draft.correspondence_type}
                      </span>
                      {draft.recipient ? <span>· {draft.recipient}</span> : null}
                      <span>· {label(LANGUAGE_LABELS[draft.language], lang)}</span>
                      <span>
                        · {t('drafts.lastEdited')} {formatRelative(draft.updated_at, lang)}
                      </span>
                    </div>
                    <p className="q-letter mt-2 max-h-16 overflow-hidden text-xs opacity-70">{draft.body}</p>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      onClick={() => navigate('/write', { state: { idea: draft.original_input || draft.body } })}
                    >
                      {t('common.open')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (await copyToClipboard(draft.body)) toast(t('common.copied'), 'success')
                      }}
                    >
                      <Copy className="size-3.5" aria-hidden="true" />
                      {t('common.copy')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      loading={duplicateMutation.isPending}
                      onClick={() => duplicateMutation.mutate(draft)}
                    >
                      <Files className="size-3.5" aria-hidden="true" />
                      {t('common.duplicate')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(draft)}>
                      <Trash2 className="size-3.5 text-red-600" aria-hidden="true" />
                      {t('common.delete')}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={t('common.delete')}
        description={pendingDelete?.title || pendingDelete?.subject || ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={removeMutation.isPending}
              onClick={() => pendingDelete && removeMutation.mutate(pendingDelete.id)}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7">لا يمكن التراجع عن هذا الإجراء.</p>
      </Modal>

      {data && data.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">
            {data.length} {t('drafts.title')}
          </Badge>
        </div>
      ) : null}
    </div>
  )
}
