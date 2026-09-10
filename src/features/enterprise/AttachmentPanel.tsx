import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Paperclip, Trash2, Upload } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/components/ui/Toast'
import {
  deleteAttachment,
  getAttachmentUrl,
  listAttachments,
  uploadAttachment,
} from '@/services/db/enterprise'
import { formatRelative } from '@/lib/utils'
import type { Attachment } from '@/types/database'

/** حد عملي يمنع رفع ملف يفشل عند الخادم بعد انتظار طويل. */
const MAX_BYTES = 25 * 1024 * 1024

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AttachmentPanel({
  correspondenceId,
  organizationId,
  classificationKey,
  canUpload,
}: {
  correspondenceId: string
  organizationId: string | null
  classificationKey: string | null
  canUpload: boolean
}) {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const attachments = useQuery({
    queryKey: ['attachments', correspondenceId],
    queryFn: () => listAttachments(correspondenceId),
  })

  const upload = useMutation({
    mutationFn: (file: File) =>
      uploadAttachment({
        correspondenceId,
        organizationId,
        file,
        uploadedBy: user!.id,
        // المرفق يرث تصنيف مراسلته ما لم يُشدَّد صراحةً لاحقًا.
        classificationKey,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attachments', correspondenceId] })
      toast(t('common.saved'), 'success')
    },
    // الحاوية قد تكون غير مُنشأة بعد — رسالة تدل على الخطوة اليدوية.
    onError: () => toast(t('attach.notConfigured'), 'error'),
  })

  const remove = useMutation({
    mutationFn: (attachment: Attachment) => deleteAttachment(attachment),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['attachments', correspondenceId] })
      toast(t('common.saved'), 'success')
    },
    onError: () => toast(t('error.deleteFailed'), 'error'),
  })

  const download = async (attachment: Attachment) => {
    setBusy(true)
    try {
      // رابط موقَّع قصير الأجل — لا رابط عام لمستند مؤسسي إطلاقًا.
      const url = await getAttachmentUrl(attachment.storage_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      toast(t('attach.notConfigured'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const items = attachments.data ?? []

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t('attach.title')}</h2>
          {canUpload ? (
            <>
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  if (file.size > MAX_BYTES) {
                    toast(t('attach.tooLarge'), 'error')
                    return
                  }
                  upload.mutate(file)
                }}
              />
              <Button
                size="sm"
                variant="outline"
                loading={upload.isPending}
                onClick={() => fileInput.current?.click()}
              >
                <Upload className="size-3.5" aria-hidden="true" />
                {upload.isPending ? t('attach.uploading') : t('attach.upload')}
              </Button>
            </>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="q-muted text-sm">{t('attach.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center gap-3 rounded-xl border border-[rgb(var(--q-border))] p-3"
              >
                <Paperclip className="size-4 shrink-0 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{attachment.filename}</p>
                  <p className="q-muted text-xs">
                    {formatSize(attachment.size_bytes)} · {formatRelative(attachment.created_at, lang)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  loading={busy}
                  onClick={() => download(attachment)}
                  aria-label={t('attach.download')}
                >
                  <Download className="size-4" aria-hidden="true" />
                </Button>
                {attachment.uploaded_by === user?.id ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove.mutate(attachment)}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="size-4 text-red-600" aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
