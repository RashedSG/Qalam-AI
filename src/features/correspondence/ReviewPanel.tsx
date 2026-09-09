import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ScoreBar, ScoreGauge } from '@/components/ui/ScoreGauge'
import { CoverageChecklist } from './CoverageChecklist'
import { useI18n } from '@/hooks/useI18n'
import type { ReviewResult } from '@/services/ai/schemas'

const STATUS_ICON = {
  pass: CheckCircle2,
  warn: AlertTriangle,
  fail: XCircle,
} as const

const STATUS_CLASS = {
  pass: 'text-emerald-600 dark:text-emerald-400',
  warn: 'text-amber-600 dark:text-amber-400',
  fail: 'text-red-600 dark:text-red-400',
} as const

export function ReviewPanel({ review }: { review: ReviewResult }) {
  const { t } = useI18n()

  return (
    <Card>
      <CardHeader
        title={t('review.title')}
        action={
          <Badge tone={review.verdict === 'ready' ? 'success' : 'warning'}>
            {review.verdict === 'ready' ? t('review.ready') : t('review.needsReview')}
          </Badge>
        }
      />
      <CardBody className="space-y-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
          <ScoreGauge score={review.overallScore} label={t('review.score')} />
          <div className="w-full flex-1 space-y-3">
            <ScoreBar label={t('review.clarity')} value={review.scores.clarity} />
            <ScoreBar label={t('review.formality')} value={review.scores.formality} />
            <ScoreBar label={t('review.language')} value={review.scores.language} />
            <ScoreBar label={t('review.conciseness')} value={review.scores.conciseness} />
            <ScoreBar label={t('review.completeness')} value={review.scores.completeness} />
          </div>
        </div>

        {review.coverage.length ? <CoverageChecklist items={review.coverage} /> : null}

        {review.checks.length ? (
          <div>
            <h3 className="mb-3 text-sm font-semibold">{t('review.checks')}</h3>
            <ul className="space-y-2">
              {review.checks.map((check) => {
                const Icon = STATUS_ICON[check.status]
                return (
                  <li key={check.key} className="flex items-start gap-2.5 text-sm">
                    <Icon className={`mt-0.5 size-4 shrink-0 ${STATUS_CLASS[check.status]}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="font-medium">{check.label}</p>
                      {check.detail ? <p className="q-muted mt-0.5 leading-7">{check.detail}</p> : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {review.suggestions.length ? (
          <div className="rounded-xl bg-[rgb(var(--q-surface-2))] p-4">
            <h3 className="mb-2 text-sm font-semibold">{t('review.suggestions')}</h3>
            <ul className="space-y-1.5 text-sm leading-7">
              {review.suggestions.map((s, i) => (
                <li key={`${s}-${i}`} className="flex gap-2">
                  <span className="text-gold-600" aria-hidden="true">•</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="q-muted flex items-start gap-2 text-xs leading-6">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t('review.disclaimer')}
        </p>
      </CardBody>
    </Card>
  )
}
