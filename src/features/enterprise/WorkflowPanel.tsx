import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GitBranch, PenLine, ShieldCheck } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { useI18n } from '@/hooks/useI18n'
import { useToast } from '@/components/ui/Toast'
import {
  listAvailableTransitions,
  listSignatures,
  listTransitions,
  signCorrespondence,
  transitionCorrespondence,
} from '@/services/db/workflow'
import { formatRelative } from '@/lib/utils'
import type { AvailableTransition, CorrespondenceStatus } from '@/types/database'
import type { TranslationKey } from '@/i18n'

/**
 * أزرار سير العمل تُبنى مما تعيده القاعدة، لا من قائمة في الواجهة.
 * فرق جوهري: ما تعيده `available_transitions` مرّ فعلًا بفحص الصلاحية والتصنيف
 * وفصل المهام — فلا يظهر زر يفشل عند الضغط، ولا يُخفى زر مسموح.
 */
export function WorkflowPanel({
  correspondenceId,
  currentStatus,
}: {
  correspondenceId: string
  currentStatus: CorrespondenceStatus
}) {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [pending, setPending] = useState<AvailableTransition | null>(null)
  const [comment, setComment] = useState('')

  const transitions = useQuery({
    queryKey: ['available-transitions', correspondenceId, currentStatus],
    queryFn: () => listAvailableTransitions(correspondenceId),
  })
  const history = useQuery({
    queryKey: ['transitions', correspondenceId],
    queryFn: () => listTransitions(correspondenceId),
  })
  const signatures = useQuery({
    queryKey: ['signatures', correspondenceId],
    queryFn: () => listSignatures(correspondenceId),
  })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['correspondence'] })
    await queryClient.invalidateQueries({ queryKey: ['available-transitions', correspondenceId] })
    await queryClient.invalidateQueries({ queryKey: ['transitions', correspondenceId] })
    await queryClient.invalidateQueries({ queryKey: ['signatures', correspondenceId] })
  }

  const act = useMutation({
    mutationFn: (transition: AvailableTransition) =>
      // التوقيع يمر بإجراء خاص يسجّل بصمة النص، وباقي الانتقالات بالإجراء العام.
      transition.to_status === 'signed'
        ? signCorrespondence(correspondenceId, comment)
        : transitionCorrespondence(correspondenceId, transition.to_status, comment),
    onSuccess: async (_data, transition) => {
      await refresh()
      toast(transition.to_status === 'signed' ? t('wf.signed') : t('wf.done'), 'success')
      setPending(null)
      setComment('')
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  const run = (transition: AvailableTransition) => {
    if (transition.requires_comment) {
      setPending(transition)
      return
    }
    act.mutate(transition)
  }

  const available = transitions.data ?? []
  const log = history.data ?? []
  const signed = signatures.data ?? []

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <GitBranch className="size-4 text-gold-600" aria-hidden="true" />
          <h2 className="text-base font-semibold">{t('wf.title')}</h2>
          <Badge tone="navy">{t(`status.${currentStatus}` as TranslationKey)}</Badge>
        </div>

        {available.length === 0 ? (
          <p className="q-muted text-sm leading-7">{t('wf.noActions')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((transition) => (
              <Button
                key={transition.to_status}
                size="sm"
                variant={transition.to_status === 'returned' ? 'outline' : 'primary'}
                loading={act.isPending}
                onClick={() => run(transition)}
              >
                {transition.to_status === 'signed' ? (
                  <PenLine className="size-3.5" aria-hidden="true" />
                ) : null}
                {lang === 'ar' ? transition.label_ar : transition.label_en || transition.label_ar}
              </Button>
            ))}
          </div>
        )}

        {/* ------------------------------ التواقيع ------------------------------ */}
        {signed.length > 0 ? (
          <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gold-600 dark:text-gold-400">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {t('wf.signatures')}
            </p>
            <ul className="space-y-1.5">
              {signed.map((signature) => (
                <li key={signature.id} className="text-xs leading-6">
                  {t('wf.signedBy')} · {formatRelative(signature.signed_at, lang)}
                  {signature.content_hash ? (
                    <span className="q-muted ms-2 font-mono" dir="ltr">
                      {signature.content_hash.slice(0, 12)}…
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {/* الصدق أهم من الطمأنة: لا نُوهم بأن هذا توقيع قانوني مؤهَّل. */}
            <p className="q-muted mt-2 text-[0.7rem] leading-5">{t('wf.signatureNote')}</p>
          </div>
        ) : null}

        {/* ---------------------------- سجل الإجراءات ---------------------------- */}
        <div>
          <p className="q-muted mb-2 text-xs font-semibold">{t('wf.history')}</p>
          {log.length === 0 ? (
            <p className="q-muted text-sm">{t('wf.noHistory')}</p>
          ) : (
            <ol className="space-y-2">
              {log.map((entry) => (
                <li key={entry.id} className="rounded-lg bg-[rgb(var(--q-surface-2))] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-medium">
                      {t(`status.${entry.from_status}` as TranslationKey)} →{' '}
                      {t(`status.${entry.to_status}` as TranslationKey)}
                    </span>
                    <span className="q-muted ms-auto">{formatRelative(entry.created_at, lang)}</span>
                  </div>
                  {entry.comment ? <p className="mt-1 text-sm leading-6">{entry.comment}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </CardBody>

      <Modal
        open={Boolean(pending)}
        onClose={() => setPending(null)}
        title={pending ? (lang === 'ar' ? pending.label_ar : pending.label_en || pending.label_ar) : ''}
        description={t('wf.commentRequired')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={act.isPending}
              disabled={!comment.trim()}
              onClick={() => pending && act.mutate(pending)}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <Field label={t('wf.comment')} required>
          {(p) => <Textarea {...p} rows={4} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </Field>
      </Modal>
    </Card>
  )
}
