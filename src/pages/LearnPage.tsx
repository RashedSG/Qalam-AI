import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, GraduationCap, Lightbulb, RefreshCw, Send } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorState, EmptyState, Skeleton } from '@/components/ui/States'
import { ProcessingSteps } from '@/components/ui/ProcessingSteps'
import { ScoreBar, ScoreGauge } from '@/components/ui/ScoreGauge'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { useAiTask } from '@/hooks/useAi'
import { useProfile } from '@/hooks/useProfile'
import { useToast } from '@/components/ui/Toast'
import { ai, type TutorEvaluation, type TutorExercise } from '@/services/ai'
import {
  completeSession,
  createSession,
  fetchProgress,
  listSessions,
  recordResult,
  updateProgressNotes,
} from '@/services/db/learning'
import { LEARNING_LEVELS, type LearningLevel } from '@/types/domain'
import { LEARNING_LEVEL_LABELS, label } from '@/data/reference'
import { cn, formatRelative } from '@/lib/utils'

export default function LearnPage() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const { data: profile } = useProfile()
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [level, setLevel] = useState<LearningLevel | null>(null)
  const [exercise, setExercise] = useState<TutorExercise | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [evaluation, setEvaluation] = useState<TutorEvaluation | null>(null)
  const [showModel, setShowModel] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const exerciseTask = useAiTask<TutorExercise>(ai.tutorExercise)
  const evaluateTask = useAiTask<TutorEvaluation>(ai.tutorEvaluate)

  const { data: progress, isLoading: progressLoading } = useQuery({
    queryKey: ['learning-progress', user?.id],
    queryFn: () => fetchProgress(user!.id),
    enabled: Boolean(user?.id),
  })

  const { data: sessions } = useQuery({
    queryKey: ['learning-sessions', user?.id],
    queryFn: () => listSessions(user!.id, 8),
    enabled: Boolean(user?.id),
  })

  const activeLevel: LearningLevel = level ?? progress?.level ?? 'beginner'
  const exerciseLanguage = profile?.preferred_language ?? 'ar'

  const startExercise = async () => {
    if (!user) return
    setValidationError(null)
    setEvaluation(null)
    setShowModel(false)
    setAnswer('')
    setSessionId(null)

    const generated = await exerciseTask.run({
      level: activeLevel,
      language: exerciseLanguage,
      department: profile?.department_custom || profile?.department_key || undefined,
      recentScenarios: sessions?.map((s) => s.scenario).slice(0, 5),
    })
    if (!generated) return

    setExercise(generated)
    try {
      const session = await createSession({
        user_id: user.id,
        level: activeLevel,
        language: exerciseLanguage,
        scenario: generated.scenario,
        expected_type: generated.expectedType,
        expected_tone: generated.expectedTone,
      })
      setSessionId(session.id)
    } catch {
      // التمرين يظل قابلًا للحل حتى لو تعذّر الحفظ؛ لا نوقف المستخدم.
      toast(t('error.saveFailed'), 'error')
    }
  }

  const submitAnswer = async () => {
    if (!exercise) return
    if (answer.trim().length < 30) {
      setValidationError(t('learn.err.tooShort'))
      return
    }
    setValidationError(null)

    const result = await evaluateTask.run({
      scenario: exercise.scenario,
      userAnswer: answer.trim(),
      level: activeLevel,
      language: exerciseLanguage,
      expectedType: exercise.expectedType,
      expectedTone: exercise.expectedTone,
    })
    if (!result || !user) return

    setEvaluation(result)
    setSaving(true)
    try {
      if (sessionId) await completeSession(sessionId, answer.trim(), result)
      await recordResult(result.overallScore)
      await updateProgressNotes(user.id, result.strengths, result.improvements)
      await queryClient.invalidateQueries({ queryKey: ['learning-progress', user.id] })
      await queryClient.invalidateQueries({ queryKey: ['learning-sessions', user.id] })
    } catch {
      toast(t('error.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('learn.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('learn.subtitle')}</p>
      </header>

      {/* لوحة التقدم */}
      <Card>
        <CardBody>
          {progressLoading ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : (
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="q-muted text-xs">{t('learn.level')}</dt>
                <dd className="mt-1 text-lg font-semibold">
                  {label(LEARNING_LEVEL_LABELS[progress?.level ?? 'beginner'], lang)}
                </dd>
              </div>
              <div>
                <dt className="q-muted text-xs">{t('learn.exercises')}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{progress?.exercises_count ?? 0}</dd>
              </div>
              <div>
                <dt className="q-muted text-xs">{t('learn.average')}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">
                  {Math.round(Number(progress?.average_score ?? 0))}%
                </dd>
              </div>
            </dl>
          )}
        </CardBody>
        <CardFooter>
          <div className="flex flex-wrap items-center gap-2">
            <span className="q-muted text-sm">{t('learn.chooseLevel')}:</span>
            {LEARNING_LEVELS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLevel(value)}
                aria-pressed={activeLevel === value}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  activeLevel === value
                    ? 'border-navy-700 bg-navy-700 text-white dark:border-beige-200 dark:bg-beige-100 dark:text-navy-900'
                    : 'border-[rgb(var(--q-border))] hover:bg-[rgb(var(--q-surface-2))]',
                )}
              >
                {label(LEARNING_LEVEL_LABELS[value], lang)}
              </button>
            ))}
          </div>
          <Button className="ms-auto" onClick={startExercise} loading={exerciseTask.loading}>
            <RefreshCw className="size-4" aria-hidden="true" />
            {t('learn.newExercise')}
          </Button>
        </CardFooter>
      </Card>

      {exerciseTask.error ? <ErrorState message={exerciseTask.error} onRetry={startExercise} /> : null}

      {/* التمرين */}
      {exercise ? (
        <Card>
          <CardHeader
            title={t('learn.scenario')}
            action={<Badge tone="gold">{label(LEARNING_LEVEL_LABELS[activeLevel], lang)}</Badge>}
          />
          <CardBody className="space-y-5">
            <p className="q-letter rounded-xl bg-[rgb(var(--q-surface-2))] p-4 text-[0.95rem]">
              {exercise.scenario}
            </p>

            {exercise.hints.length ? (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <Lightbulb className="size-4 text-gold-600" aria-hidden="true" />
                  {t('learn.hints')}
                </h3>
                <ul className="space-y-1 text-sm leading-7">
                  {exercise.hints.map((hint, i) => (
                    <li key={`${hint}-${i}`} className="flex gap-2">
                      <span className="text-gold-600" aria-hidden="true">•</span>
                      <span>{hint}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div>
              <label htmlFor="learn-answer" className="mb-1.5 block text-sm font-medium">
                {t('learn.yourAnswer')}
              </label>
              <Textarea
                id="learn-answer"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={t('learn.answerPlaceholder')}
                rows={12}
                disabled={Boolean(evaluation)}
              />
            </div>

            {validationError || evaluateTask.error ? (
              <ErrorState message={validationError ?? evaluateTask.error!} />
            ) : null}
          </CardBody>
          <CardFooter>
            <Button
              className="ms-auto"
              onClick={submitAnswer}
              loading={evaluateTask.loading || saving}
              disabled={Boolean(evaluation)}
            >
              <Send className="size-4" aria-hidden="true" />
              {t('learn.submit')}
            </Button>
          </CardFooter>
        </Card>
      ) : !exerciseTask.loading ? (
        <Card>
          <EmptyState
            icon={<GraduationCap className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
            title={t('learn.newExercise')}
            description={t('learn.subtitle')}
            action={
              <Button onClick={startExercise} loading={exerciseTask.loading}>
                {t('learn.newExercise')}
              </Button>
            }
          />
        </Card>
      ) : null}

      {evaluateTask.loading ? (
        <Card>
          <CardBody>
            <ProcessingSteps steps={[t('loading.understanding'), t('loading.evaluating'), t('loading.reviewing')]} />
          </CardBody>
        </Card>
      ) : null}

      {/* التقييم */}
      {evaluation ? (
        <Card>
          <CardHeader title={t('learn.evaluation')} />
          <CardBody className="space-y-6">
            <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
              <ScoreGauge score={evaluation.overallScore} />
              <div className="w-full flex-1 space-y-2.5">
                <ScoreBar label="وضوح الموضوع" value={evaluation.criteria.subjectClarity} />
                <ScoreBar label="تحديد المطلوب" value={evaluation.criteria.requestClarity} />
                <ScoreBar label="الرسمية" value={evaluation.criteria.formality} />
                <ScoreBar label="اللغة" value={evaluation.criteria.language} />
                <ScoreBar label="الاختصار" value={evaluation.criteria.conciseness} />
                <ScoreBar label="المقدمة" value={evaluation.criteria.opening} />
                <ScoreBar label="الخاتمة" value={evaluation.criteria.closing} />
                <ScoreBar label="الملاءمة للمخاطَب" value={evaluation.criteria.audienceFit} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-600/25 bg-emerald-600/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  {t('learn.strengths')}
                </h3>
                <ul className="space-y-1.5 text-sm leading-7">
                  {evaluation.strengths.map((s, i) => (
                    <li key={`${s}-${i}`}>• {s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                <h3 className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
                  {t('learn.improvements')}
                </h3>
                <ul className="space-y-1.5 text-sm leading-7">
                  {evaluation.improvements.map((s, i) => (
                    <li key={`${s}-${i}`}>• {s}</li>
                  ))}
                </ul>
              </div>
            </div>

            {evaluation.explanation ? (
              <div>
                <h3 className="mb-2 text-sm font-semibold">{t('learn.explanation')}</h3>
                <p className="q-letter text-sm">{evaluation.explanation}</p>
              </div>
            ) : null}

            {/* الصيغة النموذجية تُعرض بعد المحاولة فقط، وبطلب المستخدم */}
            <div>
              {showModel ? (
                <>
                  <h3 className="mb-2 text-sm font-semibold">{t('learn.modelAnswer')}</h3>
                  <div className="q-letter rounded-xl bg-[rgb(var(--q-surface-2))] p-4 text-sm">
                    {evaluation.modelAnswer}
                  </div>
                </>
              ) : (
                <Button variant="outline" onClick={() => setShowModel(true)}>
                  <Eye className="size-4" aria-hidden="true" />
                  {t('learn.showModel')}
                </Button>
              )}
            </div>
          </CardBody>
          <CardFooter>
            <Button className="ms-auto" onClick={startExercise} loading={exerciseTask.loading}>
              <RefreshCw className="size-4" aria-hidden="true" />
              {t('learn.newExercise')}
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {/* آخر التدريبات */}
      {sessions && sessions.length > 0 ? (
        <Card>
          <CardHeader title={t('learn.recent')} />
          <ul>
            {sessions.map((session, index) => (
              <li
                key={session.id}
                className={cn('flex items-center gap-3 px-5 py-3.5 text-sm', index > 0 && 'border-t')}
                style={index > 0 ? { borderColor: 'rgb(var(--q-border))' } : undefined}
              >
                <span className="min-w-0 flex-1 truncate">{session.scenario}</span>
                <span className="q-muted shrink-0 text-xs">{formatRelative(session.created_at, lang)}</span>
                {session.score !== null ? (
                  <Badge tone={session.score >= 85 ? 'success' : session.score >= 65 ? 'warning' : 'danger'}>
                    {session.score}
                  </Badge>
                ) : (
                  <Badge tone="neutral">—</Badge>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  )
}
