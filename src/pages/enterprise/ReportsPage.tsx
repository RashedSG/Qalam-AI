import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart3 } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Field } from '@/components/ui/Field'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuthorization } from '@/hooks/useAuthorization'
import {
  getAiUsage,
  getByExternalEntity,
  getByUnit,
  getReferralReport,
  getSummary,
} from '@/services/db/reports'
import type { TranslationKey } from '@/i18n'

/**
 * لوحة التقارير.
 *
 * ⚠️ لا تصفية صلاحيات هنا: الدوال في القاعدة `security invoker` فتسري عليها
 * RLS، والموظف والمدير والتنفيذي يستدعون الدالة نفسها ويحصل كلٌّ على نطاقه.
 * ولهذا لا «لوحة للمدير» و«لوحة للموظف» في الكود — اللوحة واحدة والأرقام تختلف.
 */

/** جدول بسيط مع تمرير أفقي — الأرقام العربية تُقرأ في عمود لا في بطاقة. */
function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: string[]
  rows: Array<Array<string | number>>
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem] text-sm">
        {/* العنوان مرئيٌّ لقارئ الشاشة وحده: البطاقة تحمله بصريًّا فوقه. */}
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-[rgb(var(--q-border))] text-start">
            {head.map((cell) => (
              <th key={cell} scope="col" className="px-3 py-2 text-start font-semibold">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[rgb(var(--q-border))] last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Section({
  title,
  loading,
  error,
  onRetry,
  empty,
  children,
}: {
  title: string
  loading: boolean
  error: boolean
  onRetry: () => void
  empty: boolean
  children: React.ReactNode
}) {
  const { t } = useI18n()
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody>
        {loading ? (
          <Skeleton className="h-28" />
        ) : error ? (
          <ErrorState message={t('error.loadFailed')} onRetry={onRetry} />
        ) : empty ? (
          <EmptyState
            icon={<BarChart3 className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('reports.empty')}
          />
        ) : (
          children
        )}
      </CardBody>
    </Card>
  )
}

const hours = (value: number | null) => (value === null ? '—' : value.toFixed(1))

export default function ReportsPage() {
  const { t } = useI18n()
  const { organization } = useAuthorization()
  const orgId = organization?.id

  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  /** يوم النهاية يُشمَل بكامله — وإلّا اختفت مراسلات آخر يوم من كل تقرير. */
  const range = useMemo(
    () => ({
      from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
      to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
    }),
    [from, to],
  )

  const enabled = Boolean(orgId)
  const summary = useQuery({
    queryKey: ['report-summary', orgId, range.from, range.to],
    queryFn: () => getSummary(orgId!, range),
    enabled,
  })
  const byUnit = useQuery({
    queryKey: ['report-unit', orgId, range.from, range.to],
    queryFn: () => getByUnit(orgId!, range),
    enabled,
  })
  const external = useQuery({
    queryKey: ['report-external', orgId],
    queryFn: () => getByExternalEntity(orgId!),
    enabled,
  })
  const referrals = useQuery({
    queryKey: ['report-referrals', orgId],
    queryFn: () => getReferralReport(orgId!),
    enabled,
  })
  /**
   * استخدام الذكاء يتطلب audit.view. لا نُخفي البطاقة بناءً على `can` وحدها —
   * القاعدة هي التي ترفض، ونحن نترجم رفضها إلى سطر مفهوم بدل «فشل التحميل».
   */
  const aiUsage = useQuery({
    queryKey: ['report-ai-usage', orgId],
    queryFn: () => getAiUsage(orgId!),
    enabled,
    retry: false,
  })

  const totals = useMemo(() => {
    const rows = summary.data ?? []
    return {
      total: rows.reduce((sum, row) => sum + row.total, 0),
      overdue: rows.reduce((sum, row) => sum + row.overdue, 0),
    }
  }, [summary.data])

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('reports.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('reports.subtitle')}</p>
      </header>

      <p className="q-muted rounded-lg border border-[rgb(var(--q-border))] bg-[rgb(var(--q-surface-2))] px-4 py-3 text-sm leading-7">
        {t('reports.scopeNote')}
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('reports.from')} className="w-44">
          {(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
        </Field>
        <Field label={t('reports.to')} className="w-44">
          {(p) => <Input {...p} type="date" value={to} onChange={(e) => setTo(e.target.value)} />}
        </Field>
        {from || to ? (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            {t('reports.reset')}
          </Button>
        ) : null}
        <span className="ms-auto flex flex-wrap gap-2">
          <Badge tone="neutral">
            {t('reports.total')}: {totals.total}
          </Badge>
          {totals.overdue > 0 ? (
            <Badge tone="gold">
              {t('reports.overdue')}: {totals.overdue}
            </Badge>
          ) : null}
        </span>
      </div>

      <Section
        title={t('reports.summary')}
        loading={summary.isLoading}
        error={summary.isError}
        onRetry={() => summary.refetch()}
        empty={(summary.data ?? []).length === 0}
      >
        <DataTable
          caption={t('reports.summary')}
          head={[
            t('common.type'),
            t('reports.status'),
            t('reports.total'),
            t('reports.overdue'),
            t('reports.avgHours'),
          ]}
          rows={(summary.data ?? []).map((row) => [
            t(`dir.${row.direction}` as TranslationKey),
            t(`status.${row.current_status}` as TranslationKey),
            row.total,
            row.overdue,
            hours(row.avg_hours_to_issue),
          ])}
        />
      </Section>

      <Section
        title={t('reports.byUnit')}
        loading={byUnit.isLoading}
        error={byUnit.isError}
        onRetry={() => byUnit.refetch()}
        empty={(byUnit.data ?? []).length === 0}
      >
        <DataTable
          caption={t('reports.byUnit')}
          head={[t('reports.unit'), t('dir.incoming'), t('dir.outgoing'), t('reports.overdue')]}
          rows={(byUnit.data ?? []).map((row) => [row.unit_name, row.incoming, row.outgoing, row.overdue])}
        />
      </Section>

      <Section
        title={t('reports.external')}
        loading={external.isLoading}
        error={external.isError}
        onRetry={() => external.refetch()}
        empty={(external.data ?? []).length === 0}
      >
        <DataTable
          caption={t('reports.external')}
          head={[t('reports.entity'), t('dir.incoming'), t('dir.outgoing')]}
          rows={(external.data ?? []).map((row) => [row.entity, row.incoming, row.outgoing])}
        />
      </Section>

      <Section
        title={t('reports.referrals')}
        loading={referrals.isLoading}
        error={referrals.isError}
        onRetry={() => referrals.refetch()}
        empty={(referrals.data ?? []).length === 0}
      >
        <DataTable
          caption={t('reports.referrals')}
          head={[t('reports.status'), t('reports.total'), t('reports.overdue'), t('reports.avgHours')]}
          rows={(referrals.data ?? []).map((row) => [
            t(`referral.status.${row.status}` as TranslationKey),
            row.total,
            row.overdue,
            hours(row.avg_hours_to_respond),
          ])}
        />
      </Section>

      <Card>
        <CardHeader title={t('reports.aiUsage')} description={t('reports.days')} />
        <CardBody>
          {aiUsage.isLoading ? (
            <Skeleton className="h-28" />
          ) : aiUsage.isError ? (
            <p className="q-muted text-sm leading-7">{t('reports.aiUsageDenied')}</p>
          ) : (aiUsage.data ?? []).length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
              title={t('reports.empty')}
            />
          ) : (
            <DataTable
              caption={t('reports.aiUsage')}
              head={[t('reports.day'), t('reports.requests'), t('reports.runs'), t('reports.tokens')]}
              rows={(aiUsage.data ?? []).map((row) => [
                row.day.slice(0, 10),
                row.simple_requests,
                row.agent_runs,
                row.total_tokens,
              ])}
            />
          )}
        </CardBody>
      </Card>
    </div>
  )
}
