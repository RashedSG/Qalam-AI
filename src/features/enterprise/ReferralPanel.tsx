import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Share2 } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import { createReferral, listReferralInstructions, listReferrals } from '@/services/db/enterprise'
import { listMembers, listOrgUnits } from '@/services/db/organization'
import { formatRelative } from '@/lib/utils'
import type { TranslationKey } from '@/i18n'

export function ReferralPanel({ correspondenceId }: { correspondenceId: string }) {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, can } = useAuthorization()
  const orgId = organization?.id

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ target: 'user', toId: '', instruction: '', note: '', dueAt: '' })

  const referrals = useQuery({
    queryKey: ['referrals', correspondenceId],
    queryFn: () => listReferrals(correspondenceId),
  })
  const instructions = useQuery({
    queryKey: ['referral-instructions', orgId],
    queryFn: () => listReferralInstructions(orgId!),
    enabled: Boolean(orgId),
  })
  const members = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => listMembers(orgId!),
    enabled: Boolean(orgId) && open,
  })
  const units = useQuery({
    queryKey: ['org-units', orgId],
    queryFn: () => listOrgUnits(orgId!),
    enabled: Boolean(orgId) && open,
  })

  const names = useMemo(() => {
    const map = new Map<string, string>()
    for (const item of instructions.data ?? []) map.set(item.key, item.name_ar)
    return map
  }, [instructions.data])

  const refer = useMutation({
    mutationFn: () =>
      createReferral({
        correspondenceId,
        instructionKey: form.instruction || (instructions.data ?? [])[0]?.key || '',
        toUserId: form.target === 'user' ? form.toId : null,
        toUnitId: form.target === 'unit' ? form.toId : null,
        note: form.note,
        dueAt: form.dueAt || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['referrals', correspondenceId] })
      toast(t('referral.created'), 'success')
      setOpen(false)
      setForm({ target: 'user', toId: '', instruction: '', note: '', dueAt: '' })
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  const items = referrals.data ?? []
  if (!orgId) return null

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">{t('referral.title')}</h2>
          {can('correspondence.refer') ? (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <Share2 className="size-3.5" aria-hidden="true" />
              {t('referral.new')}
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="q-muted text-sm">{t('referral.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {items.map((referral) => (
              <li key={referral.id} className="rounded-xl border border-[rgb(var(--q-border))] p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="neutral">{names.get(referral.instruction_key) ?? referral.instruction_key}</Badge>
                  <Badge tone={referral.status === 'responded' ? 'gold' : 'neutral'}>
                    {t(`referral.status.${referral.status}` as TranslationKey)}
                  </Badge>
                  <span className="q-muted ms-auto text-xs">{formatRelative(referral.created_at, lang)}</span>
                </div>
                {referral.note ? <p className="mt-1.5 text-sm leading-7">{referral.note}</p> : null}
                {referral.response ? (
                  <p className="q-letter mt-2 rounded-lg bg-[rgb(var(--q-surface-2))] p-2.5 text-sm">
                    {referral.response}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('referral.new')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={refer.isPending} disabled={!form.toId} onClick={() => refer.mutate()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('referral.to')}>
            {(p) => (
              <Select
                {...p}
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value, toId: '' })}
              >
                <option value="user">{t('referral.toUser')}</option>
                <option value="unit">{t('referral.toUnit')}</option>
              </Select>
            )}
          </Field>

          <Field label={form.target === 'user' ? t('referral.toUser') : t('referral.toUnit')} required>
            {(p) => (
              <Select {...p} value={form.toId} onChange={(e) => setForm({ ...form, toId: e.target.value })}>
                <option value="">—</option>
                {form.target === 'user'
                  ? (members.data ?? [])
                      .filter((member) => member.status === 'active')
                      .map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.profile?.full_name || member.profile?.email}
                        </option>
                      ))
                  : (units.data ?? []).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {'— '.repeat(unit.depth)}
                        {unit.name_ar}
                      </option>
                    ))}
              </Select>
            )}
          </Field>

          <Field label={t('referral.instruction')} required>
            {(p) => (
              <Select
                {...p}
                value={form.instruction}
                onChange={(e) => setForm({ ...form, instruction: e.target.value })}
              >
                {(instructions.data ?? []).map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.name_ar}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('referral.due')}>
            {(p) => (
              <Input {...p} type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
            )}
          </Field>

          <Field label={t('referral.note')}>
            {(p) => (
              <Textarea {...p} rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            )}
          </Field>
        </div>
      </Modal>
    </Card>
  )
}
