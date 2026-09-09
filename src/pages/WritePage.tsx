import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronDown, Search, Sparkles } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorState } from '@/components/ui/States'
import { ProcessingSteps } from '@/components/ui/ProcessingSteps'
import { AnalysisPanel } from '@/features/correspondence/AnalysisPanel'
import { VariantCard } from '@/features/correspondence/VariantCard'
import { ReviewPanel } from '@/features/correspondence/ReviewPanel'
import { useCorrespondenceWorkspace } from '@/features/correspondence/useCorrespondenceWorkspace'
import { useI18n } from '@/hooks/useI18n'
import { useAiTask } from '@/hooks/useAi'
import { useUserContext } from '@/hooks/useProfile'
import { ai, type CorrespondenceDraft, type RequestAnalysis } from '@/services/ai'
import {
  CORRESPONDENCE_TYPES,
  FORMALITY_LEVELS,
  PRIORITIES,
  type CorrespondenceType,
  type Formality,
  type Language,
  type Priority,
} from '@/types/domain'
import { CORRESPONDENCE_TYPE_LABELS, FORMALITY_LABELS, PRIORITY_LABELS, label } from '@/data/reference'
import { cn } from '@/lib/utils'

export default function WritePage() {
  const { t, lang } = useI18n()
  const userContext = useUserContext()
  const location = useLocation()
  const seeded = (location.state as { idea?: string; body?: string } | null) ?? null

  const [idea, setIdea] = useState(seeded?.idea ?? seeded?.body ?? '')
  const [showOptions, setShowOptions] = useState(false)
  const [language, setLanguage] = useState<Language>(userContext?.preferredLanguage ?? 'ar')
  const [recipient, setRecipient] = useState('')
  const [correspondenceType, setCorrespondenceType] = useState<CorrespondenceType | ''>('')
  const [formality, setFormality] = useState<Formality | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const [analysis, setAnalysis] = useState<RequestAnalysis | null>(null)

  const analyzeTask = useAiTask<RequestAnalysis>(ai.analyzeRequest)
  const generateTask = useAiTask<CorrespondenceDraft>(ai.generateCorrespondence)
  const ws = useCorrespondenceWorkspace()

  const runAnalyze = async () => {
    if (idea.trim().length < 10) {
      setValidationError(t('write.err.tooShort'))
      return
    }
    setValidationError(null)
    ws.reset()
    const result = await analyzeTask.run({
      idea: idea.trim(),
      language,
      recipient: recipient.trim() || undefined,
      correspondenceType: correspondenceType || undefined,
      formality: formality || undefined,
      priority: priority || undefined,
      userContext,
    })
    if (result) setAnalysis(result)
  }

  const runGenerate = async (source: RequestAnalysis) => {
    const result = await generateTask.run({ idea: idea.trim(), analysis: source, userContext })
    if (result) {
      ws.setVariants(result.variants)
      ws.setReview(null)
    }
  }

  /** إنشاء مباشر: تحليل ثم صياغة في خطوة واحدة. */
  const runDirect = async () => {
    if (idea.trim().length < 10) {
      setValidationError(t('write.err.tooShort'))
      return
    }
    setValidationError(null)
    ws.reset()
    const result = await analyzeTask.run({
      idea: idea.trim(),
      language,
      recipient: recipient.trim() || undefined,
      correspondenceType: correspondenceType || undefined,
      formality: formality || undefined,
      priority: priority || undefined,
      userContext,
    })
    if (result) {
      setAnalysis(result)
      await runGenerate(result)
    }
  }

  const busy = analyzeTask.loading || generateTask.loading
  const error = validationError ?? analyzeTask.error ?? generateTask.error

  const saveMeta = analysis
    ? {
        language: analysis.language,
        correspondenceType: analysis.correspondenceType,
        tone: analysis.tone,
        priority: analysis.priority,
        recipient: analysis.recipientDepartment,
        departmentKey: null,
        source: 'written' as const,
        originalInput: idea.trim(),
        analysis,
      }
    : null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('write.title')}</h1>
      </header>

      <Card>
        <CardHeader title={t('write.prompt')} />
        <CardBody className="space-y-4">
          <Textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder={t('write.placeholder')}
            rows={7}
            aria-label={t('write.prompt')}
            className="text-[1.02rem]"
          />

          <div>
            <button
              type="button"
              onClick={() => setShowOptions((v) => !v)}
              aria-expanded={showOptions}
              className="q-muted flex items-center gap-1.5 text-sm font-medium hover:text-[rgb(var(--q-text))]"
            >
              <ChevronDown
                className={cn('size-4 transition-transform', showOptions && 'rotate-180')}
                aria-hidden="true"
              />
              {t('write.options')}
            </button>

            {showOptions ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label={t('common.language')}>
                  {(p) => (
                    <Select {...p} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                      <option value="ar">{t('common.arabic')}</option>
                      <option value="en">{t('common.english')}</option>
                    </Select>
                  )}
                </Field>

                <Field label={t('common.recipient')}>
                  {(p) => (
                    <Input
                      {...p}
                      value={recipient}
                      onChange={(e) => setRecipient(e.target.value)}
                      placeholder={t('write.recipientPlaceholder')}
                    />
                  )}
                </Field>

                <Field label={t('common.type')}>
                  {(p) => (
                    <Select
                      {...p}
                      value={correspondenceType}
                      onChange={(e) => setCorrespondenceType(e.target.value as CorrespondenceType | '')}
                    >
                      <option value="">{t('common.all')}</option>
                      {CORRESPONDENCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {label(CORRESPONDENCE_TYPE_LABELS[type], lang)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label={t('write.formality')}>
                  {(p) => (
                    <Select {...p} value={formality} onChange={(e) => setFormality(e.target.value as Formality | '')}>
                      <option value="">{t('common.none')}</option>
                      {FORMALITY_LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {label(FORMALITY_LABELS[level], lang)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>

                <Field label={t('common.priority')}>
                  {(p) => (
                    <Select {...p} value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
                      <option value="">{t('common.none')}</option>
                      {PRIORITIES.map((value) => (
                        <option key={value} value={value}>
                          {label(PRIORITY_LABELS[value], lang)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            ) : null}
          </div>

          {error ? <ErrorState message={error} /> : null}
        </CardBody>

        <CardFooter>
          <Button variant="outline" onClick={runAnalyze} loading={analyzeTask.loading} disabled={busy}>
            <Search className="size-4" aria-hidden="true" />
            {t('write.analyze')}
          </Button>
          <Button className="ms-auto" onClick={runDirect} disabled={busy} loading={generateTask.loading}>
            <Sparkles className="size-4" aria-hidden="true" />
            {t('write.generate')}
          </Button>
        </CardFooter>
      </Card>

      {busy ? (
        <Card>
          <CardBody>
            <ProcessingSteps
              steps={[
                t('loading.understanding'),
                t('loading.identifying'),
                t('loading.tone'),
                t('loading.drafting'),
              ]}
            />
          </CardBody>
        </Card>
      ) : null}

      {analysis && !busy ? (
        <AnalysisPanel
          analysis={analysis}
          onChange={setAnalysis}
          onProceed={() => runGenerate(analysis)}
          onReanalyze={runAnalyze}
          busy={generateTask.loading}
        />
      ) : null}

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
              onRefine={(action) => ws.refine(variant, action, saveMeta.language)}
              onTranslate={() => ws.translate(variant, saveMeta.language)}
              onReview={() => ws.runReview(variant, saveMeta.language)}
              onSaveDraft={() => ws.saveDraft(variant, saveMeta)}
              onSaveFinal={() => ws.saveFinal(variant, saveMeta)}
            />
          ))}
        </section>
      ) : null}

      {ws.review ? <ReviewPanel review={ws.review} /> : null}
    </div>
  )
}
