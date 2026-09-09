import { useState } from 'react'
import { ArrowLeftRight, Check, Copy, Languages } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorState } from '@/components/ui/States'
import { ProcessingSteps } from '@/components/ui/ProcessingSteps'
import { useI18n } from '@/hooks/useI18n'
import { useAiTask } from '@/hooks/useAi'
import { useToast } from '@/components/ui/Toast'
import { ai, type Translation } from '@/services/ai'
import type { Language } from '@/types/domain'
import { copyToClipboard } from '@/lib/utils'

export default function TranslatePage() {
  const { t } = useI18n()
  const { toast } = useToast()
  const [text, setText] = useState('')
  const [target, setTarget] = useState<Language>('en')
  const [copied, setCopied] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const task = useAiTask<Translation>(ai.translateCorporate)

  const run = async () => {
    if (text.trim().length < 2) {
      setValidationError(t('error.generic'))
      return
    }
    setValidationError(null)
    setCopied(false)
    await task.run({ text: text.trim(), targetLanguage: target })
  }

  const handleCopy = async () => {
    if (!task.data) return
    if (await copyToClipboard(task.data.translated)) {
      setCopied(true)
      toast(t('common.copied'), 'success')
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('translate.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('translate.subtitle')}</p>
      </header>

      <Card>
        <CardHeader
          title={t('translate.source')}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => setTarget((prev) => (prev === 'ar' ? 'en' : 'ar'))}
            >
              <ArrowLeftRight className="size-3.5" aria-hidden="true" />
              {t('translate.to')}: {target === 'ar' ? t('common.arabic') : t('common.english')}
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={9}
            dir={target === 'ar' ? 'ltr' : 'rtl'}
            aria-label={t('translate.source')}
          />
          {validationError || task.error ? <ErrorState message={validationError ?? task.error!} /> : null}
        </CardBody>
        <CardFooter>
          <Button className="ms-auto" onClick={run} loading={task.loading}>
            <Languages className="size-4" aria-hidden="true" />
            {t('translate.run')}
          </Button>
        </CardFooter>
      </Card>

      {task.loading ? (
        <Card>
          <CardBody>
            <ProcessingSteps steps={[t('loading.understanding'), t('loading.translating'), t('loading.reviewing')]} />
          </CardBody>
        </Card>
      ) : null}

      {task.data ? (
        <Card>
          <CardHeader
            title={t('translate.target')}
            action={
              <Button variant="ghost" size="sm" onClick={handleCopy}>
                {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                {copied ? t('common.copied') : t('common.copy')}
              </Button>
            }
          />
          <CardBody className="space-y-5">
            <div className="q-letter text-sm" dir={task.data.targetLanguage === 'ar' ? 'rtl' : 'ltr'}>
              {task.data.translated}
            </div>

            {task.data.terminologyNotes.length ? (
              <div className="rounded-xl bg-[rgb(var(--q-surface-2))] p-4">
                <h3 className="mb-2 text-sm font-semibold">{t('translate.notes')}</h3>
                <ul className="space-y-1.5 text-sm leading-7">
                  {task.data.terminologyNotes.map((note, i) => (
                    <li key={`${note}-${i}`} className="flex gap-2">
                      <span className="text-gold-600" aria-hidden="true">•</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}
    </div>
  )
}
