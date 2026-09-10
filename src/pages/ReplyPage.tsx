import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AlertCircle, ListChecks, RotateCcw, Search, Sparkles } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorState } from '@/components/ui/States'
import { ProcessingSteps } from '@/components/ui/ProcessingSteps'
import { VariantCard } from '@/features/correspondence/VariantCard'
import { ReviewPanel } from '@/features/correspondence/ReviewPanel'
import { CoverageChecklist } from '@/features/correspondence/CoverageChecklist'
import { useCorrespondenceWorkspace } from '@/features/correspondence/useCorrespondenceWorkspace'
import { useWorkspaceSnapshot } from '@/features/correspondence/useWorkspaceSnapshot'
import {
  clearSnapshot,
  isReplySnapshotUseful,
  loadSnapshot,
  type ReplySnapshot,
} from '@/features/correspondence/workspaceStorage'
import { useI18n } from '@/hooks/useI18n'
import { useAiTask } from '@/hooks/useAi'
import { useUserContext } from '@/hooks/useProfile'
import { ai, type CorrespondenceVariant, type IncomingAnalysis, type ReplyDraft } from '@/services/ai'
import { TONES, type Language, type Tone } from '@/types/domain'
import { PRIORITY_LABELS, TONE_LABELS, label } from '@/data/reference'

export default function ReplyPage() {
  const { t, lang } = useI18n()
  const userContext = useUserContext()

  // لقطة العمل السابقة تُقرأ مرة واحدة عند التركيب.
  // المساعد الصوتي يمرّر ما قاله المستخدم هنا، فلا يضيع كلامه عند التنقّل.
  const location = useLocation()
  const seededIncoming = (location.state as { incomingText?: string } | null)?.incomingText ?? ''

  const [restored] = useState<ReplySnapshot | null>(() => loadSnapshot<ReplySnapshot>('reply'))
  const [showRestoredNotice, setShowRestoredNotice] = useState(
    () => Boolean(restored && isReplySnapshotUseful(restored)),
  )

  const [incomingText, setIncomingText] = useState(seededIncoming || restored?.incomingText || '')
  const [replyLanguage, setReplyLanguage] = useState<Language>(
    restored?.replyLanguage ?? userContext?.preferredLanguage ?? 'ar',
  )
  const [tone, setTone] = useState<Tone>(restored?.tone ?? 'formal')
  const [analysis, setAnalysis] = useState<IncomingAnalysis | null>(restored?.analysis ?? null)
  const [answers, setAnswers] = useState<Record<string, string>>(restored?.answers ?? {})
  const [validationError, setValidationError] = useState<string | null>(null)
  const [coverage, setCoverage] = useState<ReplyDraft['coverage']>(restored?.coverage ?? [])

  const analyzeTask = useAiTask<IncomingAnalysis>(ai.analyzeIncoming)
  const replyTask = useAiTask<ReplyDraft>(ai.generateReply)
  const ws = useCorrespondenceWorkspace(restored?.variants ?? null, restored?.review ?? null)

  /* ------------------------------ حفظ تلقائي محلي ------------------------------ */
  const snapshot: ReplySnapshot = {
    incomingText,
    replyLanguage,
    tone,
    analysis,
    answers,
    variants: ws.variants,
    coverage,
    review: ws.review,
  }
  useWorkspaceSnapshot('reply', snapshot, isReplySnapshotUseful(snapshot))

  const startFresh = () => {
    clearSnapshot('reply')
    setShowRestoredNotice(false)
    setIncomingText('')
    setAnalysis(null)
    setAnswers({})
    setCoverage([])
    setValidationError(null)
    ws.reset()
    analyzeTask.reset()
    replyTask.reset()
  }

  const handleSaveDraft = async (variant: CorrespondenceVariant) => {
    if (!saveMeta) return
    const saved = await ws.saveDraft(variant, saveMeta)
    if (saved) clearSnapshot('reply')
  }

  const handleSaveFinal = async (variant: CorrespondenceVariant) => {
    if (!saveMeta) return
    const saved = await ws.saveFinal(variant, saveMeta)
    if (saved) clearSnapshot('reply')
  }

  const runAnalyze = async () => {
    if (incomingText.trim().length < 20) {
      setValidationError(t('reply.err.tooShort'))
      return
    }
    setValidationError(null)
    setShowRestoredNotice(false)
    ws.reset()
    setAnswers({})
    setCoverage([])
    const result = await analyzeTask.run({
      incomingText: incomingText.trim(),
      replyLanguage,
      userContext,
    })
    if (result) setAnalysis(result)
  }

  const runReply = async () => {
    if (!analysis) return
    const result = await replyTask.run({
      incomingText: incomingText.trim(),
      analysis,
      answers: analysis.clarifyingQuestions.map((question) => ({
        question,
        answer: (answers[question] ?? '').trim(),
      })),
      language: replyLanguage,
      tone,
      userContext,
    })
    if (result) {
      ws.setVariants(result.variants)
      setCoverage(result.coverage)
      ws.setReview(null)
    }
  }

  const busy = analyzeTask.loading || replyTask.loading
  const error = validationError ?? analyzeTask.error ?? replyTask.error

  const saveMeta = analysis
    ? {
        language: replyLanguage,
        correspondenceType: 'formal_reply',
        tone,
        priority: analysis.urgency,
        recipient: analysis.senderEntity || analysis.senderName || '',
        departmentKey: null,
        source: 'reply' as const,
        originalInput: incomingText.trim(),
        analysis,
      }
    : null

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('reply.title')}</h1>
        {incomingText || ws.variants ? (
          <Button variant="ghost" size="sm" onClick={startFresh}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('write.startFresh')}
          </Button>
        ) : null}
      </header>

      {showRestoredNotice ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-gold-500/35 bg-gold-500/5 p-3.5 text-sm"
        >
          <RotateCcw className="size-4 shrink-0 text-gold-600" aria-hidden="true" />
          <span className="flex-1">
            <b>{t('write.restored')}</b>
            <span className="q-muted"> — {t('write.restoredHint')}</span>
          </span>
          <Button variant="outline" size="sm" onClick={startFresh}>
            {t('write.startFresh')}
          </Button>
        </div>
      ) : null}

      <Card>
        <CardHeader title={t('reply.paste')} />
        <CardBody className="space-y-4">
          <Textarea
            value={incomingText}
            onChange={(e) => setIncomingText(e.target.value)}
            placeholder={t('reply.placeholder')}
            rows={9}
            aria-label={t('reply.paste')}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('common.language')}>
              {(p) => (
                <Select {...p} value={replyLanguage} onChange={(e) => setReplyLanguage(e.target.value as Language)}>
                  <option value="ar">{t('common.arabic')}</option>
                  <option value="en">{t('common.english')}</option>
                </Select>
              )}
            </Field>
            <Field label={t('common.tone')}>
              {(p) => (
                <Select {...p} value={tone} onChange={(e) => setTone(e.target.value as Tone)}>
                  {TONES.map((value) => (
                    <option key={value} value={value}>
                      {label(TONE_LABELS[value], lang)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          {error ? <ErrorState message={error} /> : null}
        </CardBody>
        <CardFooter>
          <Button className="ms-auto" onClick={runAnalyze} loading={analyzeTask.loading} disabled={busy}>
            <Search className="size-4" aria-hidden="true" />
            {t('reply.analyze')}
          </Button>
        </CardFooter>
      </Card>

      {busy ? (
        <Card>
          <CardBody>
            <ProcessingSteps
              steps={
                analyzeTask.loading
                  ? [t('loading.analyzingIncoming'), t('loading.extracting'), t('loading.reviewing')]
                  : [t('loading.understanding'), t('loading.tone'), t('loading.drafting')]
              }
            />
          </CardBody>
        </Card>
      ) : null}

      {analysis && !analyzeTask.loading ? (
        <Card>
          <CardHeader
            title={t('reply.understanding')}
            action={
              <div className="flex flex-wrap gap-1.5">
                <Badge tone={analysis.urgency === 'urgent' ? 'danger' : analysis.urgency === 'important' ? 'warning' : 'neutral'}>
                  {t('reply.urgency')}: {label(PRIORITY_LABELS[analysis.urgency], lang)}
                </Badge>
                <Badge tone={analysis.needsReply ? 'navy' : 'neutral'}>
                  {analysis.needsReply ? t('reply.needsReply') : t('reply.noReplyNeeded')}
                </Badge>
              </div>
            }
          />
          <CardBody className="space-y-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              {analysis.subject ? (
                <div>
                  <dt className="q-muted text-xs">{t('common.subject')}</dt>
                  <dd className="mt-0.5 font-medium">{analysis.subject}</dd>
                </div>
              ) : null}
              {analysis.senderName || analysis.senderEntity ? (
                <div>
                  <dt className="q-muted text-xs">{t('common.recipient')}</dt>
                  <dd className="mt-0.5 font-medium">
                    {[analysis.senderName, analysis.senderEntity].filter(Boolean).join(' — ')}
                  </dd>
                </div>
              ) : null}
            </dl>

            <p className="q-letter rounded-xl bg-[rgb(var(--q-surface-2))] p-4 text-sm">{analysis.summary}</p>

            {analysis.requestedFromUser.length ? (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ListChecks className="size-4 text-gold-600" aria-hidden="true" />
                  {t('reply.requestedFromYou')}
                </h3>
                <ol className="space-y-2 text-sm">
                  {analysis.requestedFromUser.map((point, index) => (
                    <li key={point.id} className="flex gap-2.5 leading-7">
                      <span className="q-muted shrink-0 tabular-nums">{index + 1}.</span>
                      <span>
                        {point.text}
                        {point.dueDate ? (
                          <span className="q-muted"> — {point.dueDate}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {analysis.dates.length ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="q-muted text-xs">{t('common.date')}:</span>
                {analysis.dates.map((d, i) => (
                  <Badge key={`${d}-${i}`} tone="gold">
                    {d}
                  </Badge>
                ))}
              </div>
            ) : null}

            {analysis.clarifyingQuestions.length ? (
              <div className="rounded-xl border border-gold-500/30 bg-gold-500/5 p-4">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <AlertCircle className="size-4 text-gold-600" aria-hidden="true" />
                  {t('reply.questions')}
                </h3>
                <p className="q-muted mt-1 text-xs">{t('reply.questionsHint')}</p>
                <div className="mt-4 space-y-3">
                  {analysis.clarifyingQuestions.map((question) => (
                    <Field key={question} label={question}>
                      {(p) => (
                        <Input
                          {...p}
                          value={answers[question] ?? ''}
                          onChange={(e) => setAnswers((prev) => ({ ...prev, [question]: e.target.value }))}
                        />
                      )}
                    </Field>
                  ))}
                </div>
              </div>
            ) : null}
          </CardBody>
          <CardFooter>
            <Button className="ms-auto" onClick={runReply} loading={replyTask.loading}>
              <Sparkles className="size-4" aria-hidden="true" />
              {t('reply.generate')}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {coverage.length ? <CoverageChecklist items={coverage} className="q-surface" /> : null}

      {ws.variants && saveMeta ? (
        <section className="space-y-4" aria-label={t('result.title')}>
          <h2 className="text-lg font-semibold">{t('result.title')}</h2>
          {ws.variants.map((variant) => (
            <VariantCard
              key={variant.kind}
              variant={variant}
              busy={ws.busyKind === variant.kind}
              saving={ws.saving}
              onChange={ws.updateVariant}
              onRefine={(action) => ws.refine(variant, action, replyLanguage)}
              onTranslate={() => ws.translate(variant, replyLanguage)}
              onReview={() => ws.runReview(variant, replyLanguage, analysis)}
              onSaveDraft={() => handleSaveDraft(variant)}
              onSaveFinal={() => handleSaveFinal(variant)}
            />
          ))}
        </section>
      ) : null}

      {ws.review ? <ReviewPanel review={ws.review} /> : null}
    </div>
  )
}
