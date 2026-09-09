import { useState } from 'react'
import { ArrowLeftRight, Check, Copy, Sparkles } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { FieldGroup } from '@/components/ui/FieldGroup'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorState } from '@/components/ui/States'
import { ProcessingSteps } from '@/components/ui/ProcessingSteps'
import { useI18n } from '@/hooks/useI18n'
import { useAiTask } from '@/hooks/useAi'
import { useToast } from '@/components/ui/Toast'
import { ai, type ImprovedText } from '@/services/ai'
import { IMPROVE_ACTIONS, type ImproveAction, type Language } from '@/types/domain'
import { IMPROVE_ACTION_LABELS, label } from '@/data/reference'
import { cn, copyToClipboard } from '@/lib/utils'

export default function ImprovePage() {
  const { t, lang } = useI18n()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [language, setLanguage] = useState<Language>('ar')
  const [actions, setActions] = useState<ImproveAction[]>(['proofread'])
  const [validationError, setValidationError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const task = useAiTask<ImprovedText>(ai.improveText)

  const toggle = (action: ImproveAction) => {
    setActions((prev) => (prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]))
  }

  const run = async () => {
    if (text.trim().length < 5) {
      setValidationError(t('improve.err.noAction'))
      return
    }
    if (!actions.length) {
      setValidationError(t('improve.err.noAction'))
      return
    }
    setValidationError(null)
    setCopied(false)
    await task.run({ text: text.trim(), actions, language })
  }

  const handleCopy = async () => {
    if (!task.data) return
    const ok = await copyToClipboard(task.data.improved)
    if (ok) {
      setCopied(true)
      toast(t('common.copied'), 'success')
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('improve.title')}</h1>
      </header>

      <Card>
        <CardHeader title={t('improve.paste')} />
        <CardBody className="space-y-5">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            aria-label={t('improve.paste')}
          />

          <FieldGroup label={t('improve.actions')}>
            <div className="flex flex-wrap gap-2">
                {IMPROVE_ACTIONS.map((action) => {
                  const active = actions.includes(action)
                  return (
                    <button
                      key={action}
                      type="button"
                      onClick={() => toggle(action)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                        active
                          ? 'border-navy-700 bg-navy-700 text-white dark:border-beige-200 dark:bg-beige-100 dark:text-navy-900'
                          : 'border-[rgb(var(--q-border))] hover:bg-[rgb(var(--q-surface-2))]',
                      )}
                    >
                      {label(IMPROVE_ACTION_LABELS[action], lang)}
                    </button>
                )
              })}
            </div>
          </FieldGroup>

          <Field label={t('common.language')} className="max-w-xs">
            {(p) => (
              <Select {...p} value={language} onChange={(e) => setLanguage(e.target.value as Language)}>
                <option value="ar">{t('common.arabic')}</option>
                <option value="en">{t('common.english')}</option>
              </Select>
            )}
          </Field>

          {validationError || task.error ? <ErrorState message={validationError ?? task.error!} /> : null}
        </CardBody>
        <CardFooter>
          <Button className="ms-auto" onClick={run} loading={task.loading}>
            <Sparkles className="size-4" aria-hidden="true" />
            {t('improve.run')}
          </Button>
        </CardFooter>
      </Card>

      {task.loading ? (
        <Card>
          <CardBody>
            <ProcessingSteps steps={[t('loading.understanding'), t('loading.drafting'), t('loading.reviewing')]} />
          </CardBody>
        </Card>
      ) : null}

      {task.data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={t('improve.original')} />
              <CardBody>
                <div className="q-letter text-sm opacity-70">{text}</div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={t('improve.improved')}
                action={
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                    {copied ? t('common.copied') : t('common.copy')}
                  </Button>
                }
              />
              <CardBody>
                <div className="q-letter text-sm">{task.data.improved}</div>
              </CardBody>
            </Card>
          </div>

          {task.data.changeSummary.length ? (
            <Card>
              <CardHeader title={t('improve.changes')} />
              <CardBody>
                <ul className="space-y-2 text-sm leading-7">
                  {task.data.changeSummary.map((change, i) => (
                    <li key={`${change}-${i}`} className="flex gap-2">
                      <ArrowLeftRight className="mt-1.5 size-3.5 shrink-0 text-gold-600" aria-hidden="true" />
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
