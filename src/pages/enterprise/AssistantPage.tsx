import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileText, RotateCcw, Send, Sparkles } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { VoicePanel } from '@/features/voice/VoicePanel'
import { askAgent, type AgentCitation, type AgentReply, type AgentTurn } from '@/services/ai/agent'
import { AiError } from '@/services/ai'
import type { TranslationKey } from '@/i18n'

interface Bubble extends AgentTurn {
  citations?: AgentCitation[]
  toolsUsed?: string[]
  stoppedBy?: AgentReply['stoppedBy']
}

/** المصادر تُعرض دائمًا: من أين جاءت الإجابة أهم من الإجابة نفسها. */
function Sources({ citations }: { citations: AgentCitation[] }) {
  const { t } = useI18n()
  if (citations.length === 0) {
    return <p className="q-muted mt-2 text-xs leading-6">{t('agent.noSources')}</p>
  }
  return (
    <div className="mt-3 border-t border-[rgb(var(--q-border))] pt-2">
      <p className="q-muted mb-1.5 text-[0.7rem] font-semibold">{t('agent.sources')}</p>
      <ul className="space-y-1">
        {citations.map((citation) => (
          <li key={citation.correspondenceId}>
            <Link
              to={`/correspondence/${citation.correspondenceId}`}
              className="inline-flex items-center gap-1.5 text-xs hover:underline"
            >
              <FileText className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{citation.subject || '—'}</span>
              {citation.reference ? (
                <span className="q-muted font-mono" dir="ltr">
                  {citation.reference}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function AssistantPage() {
  const { t } = useI18n()
  const { accessToken } = useAuth()

  const [turns, setTurns] = useState<Bubble[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [injectionSeen, setInjectionSeen] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turns, busy])

  const send = async (text: string) => {
    const question = text.trim()
    if (!question || busy) return

    const next: Bubble[] = [...turns, { role: 'user', content: question }]
    setTurns(next)
    setDraft('')
    setBusy(true)
    setError(null)

    try {
      const reply = await askAgent(
        // نُرسل الدور والنص فقط — المصادر والأدوات عرض محلي لا سياق للنموذج.
        next.map((turn) => ({ role: turn.role, content: turn.content })),
        { accessToken },
      )
      if (reply.injectionSignals > 0) setInjectionSeen(true)
      setTurns([
        ...next,
        {
          role: 'assistant',
          content: reply.reply,
          citations: reply.citations,
          toolsUsed: reply.toolsUsed,
          stoppedBy: reply.stoppedBy,
        },
      ])
    } catch (err) {
      setError(err instanceof AiError ? err.message : 'تعذّر إتمام العملية حاليًا. حاول مرة أخرى.')
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    setTurns([])
    setError(null)
    setInjectionSeen(false)
  }

  const examples: TranslationKey[] = ['agent.ex1', 'agent.ex2', 'agent.ex3']

  return (
    <div className="flex min-h-[calc(100dvh-10rem)] flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Sparkles className="size-5 text-gold-600" aria-hidden="true" />
            {t('agent.title')}
          </h1>
          <p className="q-muted mt-1.5 leading-7">{t('agent.subtitle')}</p>
        </div>
        {turns.length > 0 ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="size-3.5" aria-hidden="true" />
            {t('agent.clear')}
          </Button>
        ) : null}
      </header>

      {/* حدود المساعد معلنة دائمًا، لا في التوثيق وحده. */}
      <p className="q-muted rounded-xl bg-[rgb(var(--q-surface-2))] px-3 py-2 text-xs leading-6">
        {t('agent.limits')}
      </p>

      <VoicePanel />

      {injectionSeen ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-gold-500/40 bg-gold-500/5 p-3 text-xs leading-6"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-gold-600" aria-hidden="true" />
          <span>{t('agent.injectionWarning')}</span>
        </div>
      ) : null}

      <div className="flex-1 space-y-3" aria-live="polite">
        {turns.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Sparkles className="size-7 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />}
              title={t('agent.empty')}
            />
            <CardBody className="pt-0">
              <p className="q-muted mb-2 text-xs font-semibold">{t('agent.examples')}</p>
              <div className="flex flex-wrap gap-2">
                {examples.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => send(t(key))}
                    className="rounded-full border border-[rgb(var(--q-border))] px-3 py-1.5 text-xs hover:bg-[rgb(var(--q-surface-2))]"
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : (
          turns.map((turn, index) => (
            <div
              key={index}
              className={
                turn.role === 'user'
                  ? 'ms-auto max-w-[85%] rounded-2xl bg-navy-700 px-4 py-2.5 text-white dark:bg-navy-600'
                  : 'me-auto max-w-[92%] rounded-2xl border border-[rgb(var(--q-border))] bg-[rgb(var(--q-surface))] px-4 py-3'
              }
            >
              <p className="whitespace-pre-wrap text-sm leading-7">{turn.content}</p>

              {turn.role === 'assistant' ? (
                <>
                  <Sources citations={turn.citations ?? []} />
                  {turn.stoppedBy && turn.stoppedBy !== 'completed' ? (
                    <p className="q-muted mt-2 text-xs">
                      {t(`agent.stopped.${turn.stoppedBy}` as TranslationKey)}
                    </p>
                  ) : null}
                  {turn.toolsUsed && turn.toolsUsed.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {[...new Set(turn.toolsUsed)].map((tool) => (
                        <Badge key={tool} tone="neutral">
                          {tool}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ))
        )}

        {busy ? (
          <div className="me-auto flex items-center gap-2 rounded-2xl border border-[rgb(var(--q-border))] px-4 py-3">
            <Spinner className="size-4" />
            <span className="q-muted text-sm">{t('agent.thinking')}</span>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 flex items-end gap-2 bg-[rgb(var(--q-bg))] pb-2 pt-1"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('agent.placeholder')}
          aria-label={t('agent.placeholder')}
          rows={2}
          className="flex-1"
          onKeyDown={(e) => {
            // Enter يُرسل، وShift+Enter سطر جديد — المتوقع في واجهات المحادثة.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send(draft)
            }
          }}
        />
        <Button type="submit" loading={busy} disabled={!draft.trim()}>
          <Send className="size-4 rtl:-scale-x-100" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">{t('agent.send')}</span>
        </Button>
      </form>
    </div>
  )
}
