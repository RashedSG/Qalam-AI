import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Inbox } from 'lucide-react'
import { Card, CardBody, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import { listMyReferrals, listReferralInstructions, respondToReferral } from '@/services/db/enterprise'
import { listQueue } from '@/services/db/workflow'
import { CorrespondenceList } from '@/features/enterprise/CorrespondenceList'
import { listClassificationLevels } from '@/services/db/enterprise'
import type { CorrespondenceStatus } from '@/types/database'
import { formatRelative } from '@/lib/utils'
import type { Referral } from '@/types/database'
import type { TranslationKey } from '@/i18n'

export default function MyWorkPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, membership } = useAuthorization()
  const orgId = organization?.id

  const [respondTo, setRespondTo] = useState<Referral | null>(null)
  const [response, setResponse] = useState('')

  const referrals = useQuery({
    queryKey: ['my-referrals', user?.id, membership?.org_unit_id],
    queryFn: () => listMyReferrals(user!.id, membership?.org_unit_id ?? null),
    enabled: Boolean(user?.id),
  })
  const instructions = useQuery({
    queryKey: ['referral-instructions', orgId],
    queryFn: () => listReferralInstructions(orgId!),
    enabled: Boolean(orgId),
  })
  const levels = useQuery({
    queryKey: ['classification-levels', orgId],
    queryFn: () => listClassificationLevels(orgId!),
    enabled: Boolean(orgId),
  })

  /**
   * الطوابير تعتمد على RLS لا على تصفية في الواجهة: الاستعلام يطلب كل مراسلات
   * الحالة، وتعيد القاعدة ما يراه المستخدم فقط. من لا يملك نطاقًا يرى قائمة
   * فارغة — لا حاجة لإخفائها هنا.
   */
  const queues: Array<{ key: string; labelKey: TranslationKey; statuses: CorrespondenceStatus[] }> = [
    { key: 'review', labelKey: 'queue.review', statuses: ['in_review'] },
    { key: 'approval', labelKey: 'queue.approval', statuses: ['in_approval'] },
    { key: 'signature', labelKey: 'queue.signature', statuses: ['approved'] },
    { key: 'returned', labelKey: 'queue.returned', statuses: ['returned'] },
  ]

  const reviewQueue = useQuery({
    queryKey: ['queue', orgId, 'in_review'],
    queryFn: () => listQueue(orgId!, ['in_review']),
    enabled: Boolean(orgId),
  })
  const approvalQueue = useQuery({
    queryKey: ['queue', orgId, 'in_approval'],
    queryFn: () => listQueue(orgId!, ['in_approval']),
    enabled: Boolean(orgId),
  })
  const signatureQueue = useQuery({
    queryKey: ['queue', orgId, 'approved'],
    queryFn: () => listQueue(orgId!, ['approved']),
    enabled: Boolean(orgId),
  })
  const returnedQueue = useQuery({
    queryKey: ['queue', orgId, 'returned'],
    queryFn: () => listQueue(orgId!, ['returned']),
    enabled: Boolean(orgId),
  })

  const queueData: Record<string, ReturnType<typeof listQueue> extends Promise<infer T> ? T : never> = {
    review: reviewQueue.data ?? [],
    approval: approvalQueue.data ?? [],
    signature: signatureQueue.data ?? [],
    returned: returnedQueue.data ?? [],
  }

  const instructionName = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of instructions.data ?? []) map.set(item.key, item.name_ar)
    return map
  }, [instructions.data])

  const respond = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'acknowledged' | 'responded' }) =>
      respondToReferral(id, status, status === 'responded' ? response : ''),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['my-referrals'] })
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast(t('common.saved'), 'success')
      setRespondTo(null)
      setResponse('')
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  const now = Date.now()
  // الأقرب استحقاقًا أولًا، وما بلا موعد في الآخر — الترتيب هو الرسالة.
  const sorted = useMemo(() => {
    const items = referrals.data ?? []
    return [...items].sort((a, b) => {
      const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY
      const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY
      return aDue - bDue
    })
  }, [referrals.data])
  const overdueCount = sorted.filter((r) => r.due_at && new Date(r.due_at).getTime() < now).length

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('mywork.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('mywork.subtitle')}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <Badge tone="neutral">
          {t('mywork.referrals')}: {sorted.length}
        </Badge>
        {overdueCount > 0 ? (
          <Badge tone="gold">
            <AlertTriangle className="size-3" aria-hidden="true" />
            {t('mywork.overdue')}: {overdueCount}
          </Badge>
        ) : null}
      </div>

      {referrals.isError ? (
        <ErrorState message={t('error.loadFailed')} onRetry={() => referrals.refetch()} />
      ) : null}

      {referrals.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('mywork.empty')}
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {sorted.map((referral) => {
            const overdue = referral.due_at ? new Date(referral.due_at).getTime() < now : false
            return (
              <li key={referral.id}>
                <Card>
                  <CardBody className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">
                        {instructionName.get(referral.instruction_key) ?? referral.instruction_key}
                      </Badge>
                      <Badge tone={overdue ? 'gold' : 'neutral'}>
                        {t(`referral.status.${referral.status}` as TranslationKey)}
                      </Badge>
                      {overdue ? (
                        <Badge tone="gold">
                          <AlertTriangle className="size-3" aria-hidden="true" />
                          {t('corr.overdue')}
                        </Badge>
                      ) : null}
                      {referral.due_at ? (
                        <span className="q-muted ms-auto text-xs">
                          {t('corr.dueIn')} {formatRelative(referral.due_at, lang)}
                        </span>
                      ) : null}
                    </div>

                    {referral.note ? <p className="text-sm leading-7">{referral.note}</p> : null}
                  </CardBody>

                  <CardFooter>
                    <Link
                      to={`/correspondence/${referral.correspondence_id}`}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--q-border))] px-3 text-sm font-medium hover:bg-[rgb(var(--q-surface-2))]"
                    >
                      <Inbox className="size-3.5" aria-hidden="true" />
                      {t('favorites.open')}
                    </Link>
                    {referral.status === 'pending' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={respond.isPending}
                        onClick={() => respond.mutate({ id: referral.id, status: 'acknowledged' })}
                      >
                        {t('referral.acknowledge')}
                      </Button>
                    ) : null}
                    <Button size="sm" className="ms-auto" onClick={() => setRespondTo(referral)}>
                      {t('referral.respond')}
                    </Button>
                  </CardFooter>
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {/* ------------------------- طوابير سير العمل -------------------------
          كل طابور يعرض ما تسمح به القاعدة فقط، فيبقى فارغًا لمن لا يخصّه. */}
      {orgId
        ? queues.map((queue) => {
            const items = queueData[queue.key] ?? []
            if (items.length === 0) return null
            return (
              <section key={queue.key} className="space-y-3">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  {t(queue.labelKey)}
                  <Badge tone="neutral">{items.length}</Badge>
                </h2>
                <CorrespondenceList
                  items={items}
                  loading={false}
                  emptyLabel={t('mywork.empty')}
                  levels={levels.data ?? []}
                />
              </section>
            )
          })
        : null}

      <Modal
        open={Boolean(respondTo)}
        onClose={() => setRespondTo(null)}
        title={t('referral.respond')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setRespondTo(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={respond.isPending}
              disabled={!response.trim()}
              onClick={() => respondTo && respond.mutate({ id: respondTo.id, status: 'responded' })}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Field label={t('referral.response')} required>
          {(p) => <Textarea {...p} rows={6} value={response} onChange={(e) => setResponse(e.target.value)} />}
        </Field>
      </Modal>
    </div>
  )
}
