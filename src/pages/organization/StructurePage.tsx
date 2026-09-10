import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Network, Plus, Trash2 } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Field } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import { useToast } from '@/components/ui/Toast'
import {
  buildOrgTree,
  createOrgUnit,
  deleteOrgUnit,
  listMembers,
  listOrgUnits,
  type OrgUnitNode,
} from '@/services/db/organization'
import type { OrgUnitKind } from '@/types/database'
import type { TranslationKey } from '@/i18n'

const KINDS: OrgUnitKind[] = ['organization', 'sector', 'department', 'section', 'unit']

function UnitRow({
  node,
  depth,
  counts,
  onAddChild,
  onDelete,
  canManage,
}: {
  node: OrgUnitNode
  depth: number
  counts: Record<string, number>
  onAddChild: (parentId: string) => void
  onDelete: (node: OrgUnitNode) => void
  canManage: boolean
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(true)
  const hasChildren = node.children.length > 0
  const members = counts[node.id] ?? 0

  return (
    <li>
      <div
        className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-[rgb(var(--q-surface-2))]"
        // المسافة البادئة منطقية الاتجاه فتعمل في RTL و LTR معًا.
        style={{ marginInlineStart: `${depth * 1.25}rem` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={node.name_ar}
            className="shrink-0 rounded p-0.5 hover:bg-[rgb(var(--q-surface))]"
          >
            {open ? (
              <ChevronDown className="size-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            )}
          </button>
        ) : (
          <span className="inline-block size-5 shrink-0" />
        )}

        <span className="min-w-0 flex-1 truncate text-sm font-medium">{node.name_ar}</span>

        <Badge tone="neutral">{t(`structure.kind.${node.kind}` as TranslationKey)}</Badge>
        {members > 0 ? (
          <span className="q-muted shrink-0 text-xs">
            {members} {t('structure.members')}
          </span>
        ) : null}

        {canManage ? (
          <span className="flex shrink-0 gap-1">
            <Button variant="ghost" size="sm" onClick={() => onAddChild(node.id)} aria-label={t('common.add')}>
              <Plus className="size-4" aria-hidden="true" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onDelete(node)} aria-label={t('common.delete')}>
              <Trash2 className="size-4 text-red-600" aria-hidden="true" />
            </Button>
          </span>
        ) : null}
      </div>

      {hasChildren && open ? (
        <ul>
          {node.children.map((child) => (
            <UnitRow
              key={child.id}
              node={child}
              depth={depth + 1}
              counts={counts}
              onAddChild={onAddChild}
              onDelete={onDelete}
              canManage={canManage}
            />
          ))}
        </ul>
      ) : null}
    </li>
  )
}

export default function StructurePage() {
  const { t } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, can } = useAuthorization()
  const orgId = organization?.id

  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<OrgUnitNode | null>(null)
  const [form, setForm] = useState({ name_ar: '', name_en: '', code: '', kind: 'department' as OrgUnitKind, parent_id: '' })

  const units = useQuery({
    queryKey: ['org-units', orgId],
    queryFn: () => listOrgUnits(orgId!),
    enabled: Boolean(orgId),
  })

  const members = useQuery({
    queryKey: ['members', orgId],
    queryFn: () => listMembers(orgId!),
    enabled: Boolean(orgId),
  })

  const tree = useMemo(() => buildOrgTree(units.data ?? []), [units.data])

  /** عدد الأعضاء في كل وحدة — يوضّح أثر حذف وحدة قبل تنفيذه. */
  const counts = useMemo(() => {
    const out: Record<string, number> = {}
    for (const member of members.data ?? []) {
      if (member.org_unit_id) out[member.org_unit_id] = (out[member.org_unit_id] ?? 0) + 1
    }
    return out
  }, [members.data])

  const canManage = can('organization.manage', 'organization')

  const create = useMutation({
    mutationFn: () =>
      createOrgUnit({
        organization_id: orgId!,
        parent_id: form.parent_id || null,
        name_ar: form.name_ar.trim(),
        name_en: form.name_en.trim(),
        code: form.code.trim() || null,
        kind: form.kind,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['org-units', orgId] })
      toast(t('common.saved'), 'success')
      setCreateOpen(false)
      setForm({ name_ar: '', name_en: '', code: '', kind: 'department', parent_id: '' })
    },
    onError: () => toast(t('error.saveFailed'), 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteOrgUnit(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['org-units', orgId] })
      toast(t('common.saved'), 'success')
      setPendingDelete(null)
    },
    // القاعدة تمنع حذف وحدة لها فروع (on delete restrict) — نترجم ذلك لرسالة مفهومة.
    onError: () => toast(t('structure.deleteBlocked'), 'error'),
  })

  const openCreate = (parentId = '') => {
    setForm((prev) => ({ ...prev, parent_id: parentId }))
    setCreateOpen(true)
  }

  if (!orgId) return <Card><EmptyState title={t('org.none')} description={t('org.noneHint')} /></Card>

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('structure.title')}</h1>
          <p className="q-muted mt-1.5 leading-7">{t('structure.subtitle')}</p>
        </div>
        {canManage ? (
          <Button onClick={() => openCreate()}>
            <Plus className="size-4" aria-hidden="true" />
            {t('structure.newUnit')}
          </Button>
        ) : null}
      </header>

      {units.isError ? <ErrorState message={t('error.loadFailed')} onRetry={() => units.refetch()} /> : null}

      {units.isLoading ? (
        <Skeleton className="h-64" />
      ) : tree.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Network className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('structure.empty')}
          />
        </Card>
      ) : (
        <Card>
          <CardBody>
            <ul>
              {tree.map((node) => (
                <UnitRow
                  key={node.id}
                  node={node}
                  depth={0}
                  counts={counts}
                  onAddChild={openCreate}
                  onDelete={setPendingDelete}
                  canManage={canManage}
                />
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('structure.newUnit')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button loading={create.isPending} disabled={!form.name_ar.trim()} onClick={() => create.mutate()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('common.name')} required>
            {(p) => (
              <Input {...p} value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
            )}
          </Field>

          <Field label={t('org.nameEn')}>
            {(p) => (
              <Input {...p} dir="ltr" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('org.code')}>
              {(p) => (
                <Input {...p} dir="ltr" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              )}
            </Field>

            <Field label={t('structure.kind')}>
              {(p) => (
                <Select {...p} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as OrgUnitKind })}>
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`structure.kind.${kind}` as TranslationKey)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>

          <Field label={t('structure.parent')}>
            {(p) => (
              <Select {...p} value={form.parent_id} onChange={(e) => setForm({ ...form, parent_id: e.target.value })}>
                <option value="">{t('structure.noParent')}</option>
                {(units.data ?? []).map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {'— '.repeat(unit.depth)}
                    {unit.name_ar}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={t('common.delete')}
        description={pendingDelete?.name_ar ?? ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(pendingDelete!.id)}>
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
