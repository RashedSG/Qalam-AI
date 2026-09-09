import { AlertCircle, Sparkles } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { useI18n } from '@/hooks/useI18n'
import { CORRESPONDENCE_TYPE_LABELS, PRIORITY_LABELS, TONE_LABELS, label } from '@/data/reference'
import { CORRESPONDENCE_TYPES, PRIORITIES, TONES, type Language } from '@/types/domain'
import type { RequestAnalysis } from '@/services/ai/schemas'

export interface AnalysisPanelProps {
  analysis: RequestAnalysis
  onChange: (next: RequestAnalysis) => void
  onProceed: () => void
  onReanalyze: () => void
  busy?: boolean
}

/** يعرض فهم النظام للطلب ويسمح بتعديل كل عنصر قبل الصياغة. */
export function AnalysisPanel({ analysis, onChange, onProceed, onReanalyze, busy }: AnalysisPanelProps) {
  const { t, lang } = useI18n()
  const set = <K extends keyof RequestAnalysis>(key: K, value: RequestAnalysis[K]) =>
    onChange({ ...analysis, [key]: value })

  return (
    <Card>
      <CardHeader title={t('analysis.title')} description={t('analysis.subtitle')} />
      <CardBody className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('common.recipient')}>
            {(p) => (
              <Input
                {...p}
                value={analysis.recipientDepartment}
                onChange={(e) => set('recipientDepartment', e.target.value)}
              />
            )}
          </Field>

          <Field label={t('common.type')}>
            {(p) => (
              <Select
                {...p}
                value={analysis.correspondenceType}
                onChange={(e) => set('correspondenceType', e.target.value as RequestAnalysis['correspondenceType'])}
              >
                {CORRESPONDENCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {label(CORRESPONDENCE_TYPE_LABELS[type], lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('common.subject')} className="sm:col-span-2">
            {(p) => <Input {...p} value={analysis.subject} onChange={(e) => set('subject', e.target.value)} />}
          </Field>

          <Field label={t('common.tone')}>
            {(p) => (
              <Select {...p} value={analysis.tone} onChange={(e) => set('tone', e.target.value as RequestAnalysis['tone'])}>
                {TONES.map((tone) => (
                  <option key={tone} value={tone}>
                    {label(TONE_LABELS[tone], lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('common.priority')}>
            {(p) => (
              <Select
                {...p}
                value={analysis.priority}
                onChange={(e) => set('priority', e.target.value as RequestAnalysis['priority'])}
              >
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {label(PRIORITY_LABELS[priority], lang)}
                  </option>
                ))}
              </Select>
            )}
          </Field>

          <Field label={t('common.language')}>
            {(p) => (
              <Select {...p} value={analysis.language} onChange={(e) => set('language', e.target.value as Language)}>
                <option value="ar">{t('common.arabic')}</option>
                <option value="en">{t('common.english')}</option>
              </Select>
            )}
          </Field>

          <Field label={t('analysis.deadline')}>
            {(p) => (
              <Input {...p} value={analysis.deadline} onChange={(e) => set('deadline', e.target.value)} placeholder="—" />
            )}
          </Field>
        </div>

        <div className="rounded-xl bg-[rgb(var(--q-surface-2))] p-4">
          <p className="text-sm font-semibold">{t('analysis.intent')}</p>
          <p className="mt-1.5 text-sm leading-7">{analysis.intent}</p>

          {analysis.keyPoints.length ? (
            <>
              <p className="mt-4 text-sm font-semibold">{t('analysis.keyPoints')}</p>
              <ul className="mt-1.5 space-y-1 text-sm leading-7">
                {analysis.keyPoints.map((point, i) => (
                  <li key={`${point}-${i}`} className="flex gap-2">
                    <span className="text-gold-600" aria-hidden="true">•</span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        {analysis.missingInformation.length ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
              <AlertCircle className="size-4" aria-hidden="true" />
              {t('analysis.missing')}
            </p>
            <p className="q-muted mt-1 text-xs">{t('analysis.missingHint')}</p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {analysis.missingInformation.map((item, i) => (
                <li key={`${item}-${i}`}>
                  <Badge tone="warning">{item}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>

      <CardFooter>
        <Button variant="ghost" onClick={onReanalyze} disabled={busy}>
          {t('analysis.reanalyze')}
        </Button>
        <Button className="ms-auto" onClick={onProceed} loading={busy}>
          <Sparkles className="size-4" aria-hidden="true" />
          {t('analysis.proceed')}
        </Button>
      </CardFooter>
    </Card>
  )
}
