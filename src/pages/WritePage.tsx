import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, FileEdit, RotateCcw, Search, Sparkles } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorState, Skeleton } from '@/components/ui/States'
import { ProcessingSteps } from '@/components/ui/ProcessingSteps'
import { AnalysisPanel } from '@/features/correspondence/AnalysisPanel'
import { VariantCard } from '@/features/correspondence/VariantCard'
import { ReviewPanel } from '@/features/correspondence/ReviewPanel'
import { useCorrespondenceWorkspace } from '@/features/correspondence/useCorrespondenceWorkspace'
import { useWorkspaceSnapshot } from '@/features/correspondence/useWorkspaceSnapshot'
import {
  clearSnapshot,
  isWriteSnapshotUseful,
  loadSnapshot,
  type WriteSnapshot,
} from '@/features/correspondence/workspaceStorage'
import { useI18n } from '@/hooks/useI18n'
import { useAiTask } from '@/hooks/useAi'
import { useUserContext } from '@/hooks/useProfile'
import { getDraft } from '@/services/db/drafts'
import { ai, type CorrespondenceDraft, type CorrespondenceVariant, type RequestAnalysis } from '@/services/ai'
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
import { cn, countWords } from '@/lib/utils'

export default function WritePage() {
  const { t, lang } = useI18n()
  const userContext = useUserContext()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()

  const seeded = (location.state as { idea?: string; body?: string } | null) ?? null
  const seededIdea = seeded?.idea ?? seeded?.body ?? ''
  const draftParam = searchParams.get('draft')

  // لقطة العمل السابقة تُقرأ مرة واحدة عند التركيب.
  // القالب الممرّر أو المسودة المطلوبة يتقدّمان عليها.
  const [restoredSnapshot] = useState<WriteSnapshot | null>(() =>
    seededIdea || draftParam ? null : loadSnapshot<WriteSnapshot>('write'),
  )
  const [showRestoredNotice, setShowRestoredNotice] = useState(
    () => Boolean(restoredSnapshot && isWriteSnapshotUseful(restoredSnapshot)),
  )

  const [idea, setIdea] = useState(seededIdea || restoredSnapshot?.idea || '')
  const [showOptions, setShowOptions] = useState(false)
  const [language, setLanguage] = useState<Language>(
    restoredSnapshot?.language ?? userContext?.preferredLanguage ?? 'ar',
  )
  const [recipient, setRecipient] = useState(restoredSnapshot?.recipient ?? '')
  const [correspondenceType, setCorrespondenceType] = useState<CorrespondenceType | ''>(
    restoredSnapshot?.correspondenceType ?? '',
  )
  const [formality, setFormality] = useState<Formality | ''>(restoredSnapshot?.formality ?? '')
  const [priority, setPriority] = useState<Priority | ''>(restoredSnapshot?.priority ?? '')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<RequestAnalysis | null>(restoredSnapshot?.analysis ?? null)
  const [draftId, setDraftId] = useState<string | null>(restoredSnapshot?.draftId ?? draftParam)

  const analyzeTask = useAiTask<RequestAnalysis>(ai.analyzeRequest)
  const generateTask = useAiTask<CorrespondenceDraft>(ai.generateCorrespondence)
  const ws = useCorrespondenceWorkspace(restoredSnapshot?.variants ?? null, restoredSnapshot?.review ?? null)

  /* ------------------------ تحميل مسودة محفوظة للتعديل ------------------------ */
  const draftQuery = useQuery({
    queryKey: ['draft', draftParam],
    queryFn: () => getDraft(draftParam!),
    enabled: Boolean(draftParam),
    staleTime: Infinity,
  })

  const loadedDraft = draftQuery.data
  useEffect(() => {
    if (!loadedDraft) return
    setIdea(loadedDraft.original_input || loadedDraft.body || '')
    setRecipient(loadedDraft.recipient || '')
    setLanguage(loadedDraft.language)
    setCorrespondenceType((loadedDraft.correspondence_type as CorrespondenceType) || '')
    setDraftId(loadedDraft.id)
    setAnalysis((loadedDraft.analysis as RequestAnalysis | null) ?? null)

    // نعرض النص المحفوظ كصيغة قابلة للتحرير وإعادة الصياغة فورًا.
    if (loadedDraft.body) {
      ws.setVariants([
        {
          kind: 'recommended',
          title: '',
          subject: loadedDraft.subject,
          body: loadedDraft.body,
          wordCount: countWords(loadedDraft.body),
        },
      ])
    }
    // ws مستقر عبر useCallback؛ الاعتماد على المسودة وحدها كافٍ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedDraft])

  /* ------------------------------ حفظ تلقائي محلي ------------------------------ */
  const snapshot: WriteSnapshot = {
    idea,
    language,
    recipient,
    correspondenceType,
    formality,
    priority,
    analysis,
    variants: ws.variants,
    review: ws.review,
    draftId,
  }
  useWorkspaceSnapshot('write', snapshot, isWriteSnapshotUseful(snapshot))

  /* --------------------------------- إجراءات --------------------------------- */
  const startFresh = () => {
    clearSnapshot('write')
    setShowRestoredNotice(false)
    setIdea('')
    setRecipient('')
    setCorrespondenceType('')
    setFormality('')
    setPriority('')
    setAnalysis(null)
    setValidationError(null)
    setDraftId(null)
    ws.reset()
    analyzeTask.reset()
    generateTask.reset()
    if (draftParam) setSearchParams({}, { replace: true })
  }

  const analyzePayload = () => ({
    idea: idea.trim(),
    language,
    recipient: recipient.trim() || undefined,
    correspondenceType: correspondenceType || undefined,
    formality: formality || undefined,
    priority: priority || undefined,
    userContext,
  })

  const runAnalyze = async () => {
    if (idea.trim().length < 10) {
      setValidationError(t('write.err.tooShort'))
      return
    }
    setValidationError(null)
    setShowRestoredNotice(false)
    ws.reset()
    const result = await analyzeTask.run(analyzePayload())
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
    setShowRestoredNotice(false)
    ws.reset()
    const result = await analyzeTask.run(analyzePayload())
    if (result) {
      setAnalysis(result)
      await runGenerate(result)
    }
  }

  const handleSaveDraft = async (variant: CorrespondenceVariant) => {
    if (!saveMeta) return
    const saved = await ws.saveDraft(variant, saveMeta, draftId)
    if (saved) {
      setDraftId(saved.id)
      clearSnapshot('write')
    }
  }

  const handleSaveFinal = async (variant: CorrespondenceVariant) => {
    if (!saveMeta) return
    const saved = await ws.saveFinal(variant, saveMeta)
    if (saved) clearSnapshot('write')
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

  if (draftParam && draftQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-1/3" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{t('write.title')}</h1>
        {idea || ws.variants ? (
          <Button variant="ghost" size="sm" onClick={startFresh}>
            <RotateCcw className="size-4" aria-hidden="true" />
            {t('write.startFresh')}
          </Button>
        ) : null}
      </header>

      {draftId ? (
        <div
          className="flex items-center gap-2.5 rounded-xl border p-3.5 text-sm"
          style={{ borderColor: 'rgb(var(--q-border))' }}
        >
          <FileEdit className="size-4 shrink-0 text-gold-600" aria-hidden="true" />
          <span>
            <b>{t('write.editingDraft')}</b>
            <span className="q-muted"> — {t('write.editingDraftHint')}</span>
          </span>
        </div>
      ) : null}

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
