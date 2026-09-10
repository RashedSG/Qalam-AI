import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
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
  deleteClassificationLevel,
  getClassificationImpact,
  getReferencePolicy,
  listClassificationLevels,
  previewReferenceFormat,
  reorderClassificationLevels,
  updateReferencePolicy,
  upsertClassificationLevel,
  validateReferenceFormat,
} from '@/services/db/enterprise'
import type { ClassificationLevel } from '@/types/database'
import type { TranslationKey } from '@/i18n'

const PLACEHOLDERS = ['{ORG}', '{UNIT}', '{DIR}', '{YYYY}', '{YY}', '{MM}', '{SEQ}'] as const

/**
 * إعدادات المراسلة المؤسسية.
 *
 * كانت هذه الإعدادات تُقرأ ولا تُكتب من الواجهة: تسمية مستوى تصنيف تحتاج SQL
 * يدويًّا، وصيغة رقم المراسلة لا شاشة لها. وهذا غير مقبول في نظام يُسلَّم
 * لمؤسسة.
 *
 * ⚠️ والأهم: كل ما هنا محروس في القاعدة لا في هذه الشاشة. الصيغة يتحقّق منها
 * قيدٌ على الجدول، والرتبة تُسجَّل في سجل التدقيق، والحذف يرفضه مفتاح أجنبي.
 * ما تفعله الشاشة هو أن تُفهم المستخدمَ ما سيحدث قبل أن يحدث.
 */
export default function CorrespondenceSettingsPage() {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { organization, loading, can } = useAuthorization()
  const orgId = organization?.id
  const editable = can('organization.manage', 'organization')

  const levels = useQuery({
    queryKey: ['classification-levels', orgId],
    queryFn: () => listClassificationLevels(orgId!),
    enabled: Boolean(orgId),
  })
  const policy = useQuery({
    queryKey: ['reference-policy', orgId],
    queryFn: () => getReferencePolicy(orgId!),
    enabled: Boolean(orgId),
  })

  /* ----------------------------- صيغة الرقم ----------------------------- */

  const [form, setForm] = useState({
    format: '',
    seq_padding: 4,
    reset_yearly: true,
    per_unit: true,
    per_direction: true,
  })
  const [scopeTouched, setScopeTouched] = useState(false)

  useEffect(() => {
    if (!policy.data) return
    setForm({
      format: policy.data.format,
      seq_padding: policy.data.seq_padding,
      reset_yearly: policy.data.reset_yearly,
      per_unit: policy.data.per_unit,
      per_direction: policy.data.per_direction,
    })
    setScopeTouched(false)
  }, [policy.data])

  // الفحص في القاعدة لا هنا: مصدر الحقيقة واحد، ولا منطق مكرّر ينحرف.
  const problems = useQuery({
    queryKey: ['reference-format-problems', form.format],
    queryFn: () => validateReferenceFormat(form.format),
    enabled: Boolean(orgId) && form.format.length > 0,
  })
  const preview = useQuery({
    queryKey: ['reference-preview', form.format, form.seq_padding],
    queryFn: () => previewReferenceFormat(form.format, form.seq_padding),
    enabled: Boolean(orgId) && (problems.data ?? []).length === 0 && form.format.length > 0,
  })

  const problemText = (code: string) => {
    if (code.startsWith('unknown_placeholder:')) {
      return `${t('refpolicy.unknownPlaceholder')} ${code.slice('unknown_placeholder:'.length)}`
    }
    if (code === 'missing_seq') return t('refpolicy.missingSeq')
    if (code === 'empty') return t('refpolicy.emptyFormat')
    if (code === 'too_long') return t('refpolicy.tooLong')
    return code
  }

  const savePolicy = useMutation({
    mutationFn: () => updateReferencePolicy(orgId!, form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reference-policy', orgId] })
      toast(t('common.saved'), 'success')
      setScopeTouched(false)
    },
    onError: (error: Error) => toast(error.message || t('error.saveFailed'), 'error'),
  })

  const scopeChanged =
    Boolean(policy.data) &&
    (form.reset_yearly !== policy.data!.reset_yearly ||
      form.per_unit !== policy.data!.per_unit ||
      form.per_direction !== policy.data!.per_direction)

  /* --------------------------- مستويات التصنيف --------------------------- */

  const sorted = useMemo(
    () => [...(levels.data ?? [])].sort((a, b) => a.rank - b.rank),
    [levels.data],
  )
  const levelName = (level: ClassificationLevel) =>
    lang === 'en' && level.name_en ? level.name_en : level.name_ar

  const [editing, setEditing] = useState<ClassificationLevel | null>(null)
  const [creating, setCreating] = useState(false)
  const [levelForm, setLevelForm] = useState({ key: '', nameAr: '', nameEn: '', isDefault: false })
  const [pendingDelete, setPendingDelete] = useState<ClassificationLevel | null>(null)
  const [pendingMove, setPendingMove] = useState<{ level: ClassificationLevel; keys: string[]; newRank: number } | null>(
    null,
  )

  const openCreate = () => {
    setLevelForm({ key: '', nameAr: '', nameEn: '', isDefault: false })
    setCreating(true)
  }
  const openEdit = (level: ClassificationLevel) => {
    setLevelForm({
      key: level.key,
      nameAr: level.name_ar,
      nameEn: level.name_en,
      isDefault: level.is_default,
    })
    setEditing(level)
  }

  const invalidateLevels = async () => {
    await queryClient.invalidateQueries({ queryKey: ['classification-levels', orgId] })
  }

  const saveLevel = useMutation({
    mutationFn: () =>
      upsertClassificationLevel({
        organizationId: orgId!,
        key: levelForm.key.trim(),
        nameAr: levelForm.nameAr.trim(),
        nameEn: levelForm.nameEn.trim(),
        isDefault: levelForm.isDefault,
      }),
    onSuccess: async () => {
      await invalidateLevels()
      toast(t('common.saved'), 'success')
      setCreating(false)
      setEditing(null)
    },
    onError: (error: Error) => toast(error.message || t('error.saveFailed'), 'error'),
  })

  const removeLevel = useMutation({
    mutationFn: (key: string) => deleteClassificationLevel(orgId!, key),
    onSuccess: async () => {
      await invalidateLevels()
      toast(t('common.saved'), 'success')
      setPendingDelete(null)
    },
    // الرسالة من القاعدة تقول العدد المستعمِل — أنفع من «فشل الحذف».
    onError: (error: Error) => toast(error.message || t('error.deleteFailed'), 'error'),
  })

  const reorder = useMutation({
    mutationFn: (keys: string[]) => reorderClassificationLevels(orgId!, keys),
    onSuccess: async () => {
      await invalidateLevels()
      toast(t('common.saved'), 'success')
      setPendingMove(null)
    },
    onError: (error: Error) => toast(error.message || t('error.saveFailed'), 'error'),
  })

  /** يبني الترتيب المقترح ويطلب تأكيدًا يعرض الأثر قبل تنفيذه. */
  const askMove = (index: number, delta: number) => {
    const next = [...sorted]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    const [moved] = next.splice(index, 1)
    next.splice(target, 0, moved)
    setPendingMove({ level: moved, keys: next.map((l) => l.key), newRank: target + 1 })
  }

  const impact = useQuery({
    queryKey: ['classification-impact', orgId, pendingMove?.level.key, pendingMove?.newRank],
    queryFn: () => getClassificationImpact(orgId!, pendingMove!.level.key, pendingMove!.newRank),
    enabled: Boolean(orgId && pendingMove),
  })

  if (loading) return <Skeleton className="h-64" />
  if (!orgId) {
    return (
      <Card>
        <EmptyState title={t('org.none')} description={t('org.noneHint')} />
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('corrsettings.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('corrsettings.subtitle')}</p>
      </header>

      {!editable ? (
        <p className="q-muted rounded-lg border border-[rgb(var(--q-border))] bg-[rgb(var(--q-surface-2))] px-4 py-3 text-sm leading-7">
          {t('corrsettings.readOnly')}
        </p>
      ) : null}

      {/* ========================== مستويات التصنيف ========================== */}
      <Card>
        <CardHeader
          title={t('classification.title')}
          description={t('classification.subtitle')}
          action={
            editable ? (
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" aria-hidden="true" />
                {t('classification.add')}
              </Button>
            ) : undefined
          }
        />
        <CardBody className="space-y-4">
          {/* الترتيب هو المعنى: الأعلى في القائمة أدنى سرية. */}
          <p className="q-muted flex items-start gap-2 text-sm leading-7">
            <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t('classification.orderNote')}
          </p>

          {levels.isError ? (
            <ErrorState message={t('error.loadFailed')} onRetry={() => levels.refetch()} />
          ) : levels.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <ol className="space-y-2">
              {sorted.map((level, index) => (
                <li
                  key={level.key}
                  className="flex flex-wrap items-center gap-2 rounded-lg border border-[rgb(var(--q-border))] px-3 py-2"
                >
                  <span className="q-muted w-6 text-sm tabular-nums">{level.rank}</span>
                  <span className="font-medium">{levelName(level)}</span>
                  <code className="q-muted text-xs" dir="ltr">
                    {level.key}
                  </code>
                  {level.is_default ? <Badge tone="gold">{t('classification.default')}</Badge> : null}

                  {editable ? (
                    <span className="ms-auto flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={index === 0 || reorder.isPending}
                        onClick={() => askMove(index, -1)}
                        aria-label={t('classification.moveDown')}
                      >
                        <ArrowUp className="size-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={index === sorted.length - 1 || reorder.isPending}
                        onClick={() => askMove(index, 1)}
                        aria-label={t('classification.moveUp')}
                      >
                        <ArrowDown className="size-4" aria-hidden="true" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(level)}>
                        {t('common.edit')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingDelete(level)}
                        aria-label={t('common.delete')}
                      >
                        <Trash2 className="size-4 text-red-600" aria-hidden="true" />
                      </Button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </CardBody>
      </Card>

      {/* ========================= صيغة رقم المراسلة ========================= */}
      <Card>
        <CardHeader title={t('refpolicy.title')} description={t('refpolicy.subtitle')} />
        <CardBody className="space-y-4">
          <Field
            label={t('refpolicy.format')}
            hint={`${t('refpolicy.placeholders')}: ${PLACEHOLDERS.join(' · ')}`}
            error={
              (problems.data ?? []).length > 0
                ? (problems.data ?? []).map(problemText).join(' — ')
                : undefined
            }
          >
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                value={form.format}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, format: e.target.value })}
              />
            )}
          </Field>

          <div className="rounded-lg border border-[rgb(var(--q-border))] bg-[rgb(var(--q-surface-2))] px-4 py-3">
            <p className="q-muted mb-1 text-xs">{t('refpolicy.preview')}</p>
            <p className="font-mono text-sm" dir="ltr">
              {preview.data ?? '—'}
            </p>
          </div>

          <Field label={t('refpolicy.padding')} hint={t('refpolicy.paddingHint')}>
            {(p) => (
              <Select
                {...p}
                value={String(form.seq_padding)}
                disabled={!editable}
                onChange={(e) => setForm({ ...form, seq_padding: Number(e.target.value) })}
                className="sm:w-32"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">{t('refpolicy.scope')}</legend>
            {(
              [
                ['reset_yearly', 'refpolicy.resetYearly'],
                ['per_unit', 'refpolicy.perUnit'],
                ['per_direction', 'refpolicy.perDirection'],
              ] as const
            ).map(([key, labelKey]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[rgb(var(--q-gold))]"
                  checked={form[key]}
                  disabled={!editable}
                  onChange={(e) => {
                    setForm({ ...form, [key]: e.target.checked })
                    setScopeTouched(true)
                  }}
                />
                {t(labelKey as TranslationKey)}
              </label>
            ))}
          </fieldset>

          {/* تغيير النطاق يُنشئ عدّادًا جديدًا يبدأ من ١ — يُفسَّر قبل الحفظ. */}
          {scopeChanged && scopeTouched ? (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm leading-7"
            >
              <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {t('refpolicy.scopeWarning')}
            </p>
          ) : null}
        </CardBody>

        {editable ? (
          <CardFooter>
            <Button
              loading={savePolicy.isPending}
              disabled={(problems.data ?? []).length > 0 || !form.format.trim()}
              onClick={() => savePolicy.mutate()}
            >
              {t('common.save')}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      {/* ============================== النوافذ ============================== */}

      <Modal
        open={creating || Boolean(editing)}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
        title={editing ? t('classification.edit') : t('classification.add')}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setCreating(false)
                setEditing(null)
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              loading={saveLevel.isPending}
              disabled={!levelForm.key.trim() || !levelForm.nameAr.trim()}
              onClick={() => saveLevel.mutate()}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label={t('classification.key')}
            hint={editing ? t('classification.keyImmutable') : t('classification.keyHint')}
            required
          >
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                value={levelForm.key}
                /* المفتاح مُعرِّف ثابت: تغييره يُعيد تصنيف مراسلات صادرة. */
                disabled={Boolean(editing)}
                placeholder="top_secret"
                onChange={(e) => setLevelForm({ ...levelForm, key: e.target.value })}
              />
            )}
          </Field>

          <Field label={t('classification.nameAr')} required>
            {(p) => (
              <Input
                {...p}
                value={levelForm.nameAr}
                onChange={(e) => setLevelForm({ ...levelForm, nameAr: e.target.value })}
              />
            )}
          </Field>

          <Field label={t('classification.nameEn')}>
            {(p) => (
              <Input
                {...p}
                dir="ltr"
                value={levelForm.nameEn}
                onChange={(e) => setLevelForm({ ...levelForm, nameEn: e.target.value })}
              />
            )}
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-[rgb(var(--q-gold))]"
              checked={levelForm.isDefault}
              onChange={(e) => setLevelForm({ ...levelForm, isDefault: e.target.checked })}
            />
            {t('classification.makeDefault')}
          </label>

          {!editing ? <p className="q-muted text-xs leading-6">{t('classification.addNote')}</p> : null}
        </div>
      </Modal>

      {/* تأكيد إعادة الترتيب — يعرض الأثر بالأرقام قبل تنفيذه. */}
      <Modal
        open={Boolean(pendingMove)}
        onClose={() => setPendingMove(null)}
        title={t('classification.confirmMove')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingMove(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              loading={reorder.isPending}
              onClick={() => pendingMove && reorder.mutate(pendingMove.keys)}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        {pendingMove ? (
          <div className="space-y-3 text-sm leading-7">
            <p>
              <strong>{levelName(pendingMove.level)}</strong>: {pendingMove.level.rank} →{' '}
              {pendingMove.newRank}
            </p>

            {impact.isLoading ? (
              <Skeleton className="h-20" />
            ) : impact.data ? (
              <>
                <dl className="space-y-1">
                  <div className="flex justify-between gap-4">
                    <dt className="q-muted">{t('classification.affected')}</dt>
                    <dd className="tabular-nums">{impact.data.correspondence_count}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="q-muted">{t('classification.membersNow')}</dt>
                    <dd className="tabular-nums">{impact.data.members_now}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="q-muted">{t('classification.membersAfter')}</dt>
                    <dd className="tabular-nums">{impact.data.members_after}</dd>
                  </div>
                </dl>

                {/* الكشف هو الخطر، لا الحجب. يُقال صريحًا. */}
                {impact.data.members_after > impact.data.members_now ? (
                  <p
                    role="status"
                    className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 px-3 py-2"
                  >
                    <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {t('classification.widensWarning')}
                  </p>
                ) : null}
              </>
            ) : null}

            <p className="q-muted text-xs">{t('classification.auditNote')}</p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title={t('common.delete')}
        description={pendingDelete ? levelName(pendingDelete) : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={removeLevel.isPending}
              onClick={() => pendingDelete && removeLevel.mutate(pendingDelete.key)}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7">{t('classification.deleteNote')}</p>
      </Modal>
    </div>
  )
}
