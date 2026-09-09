import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FileCheck2 } from 'lucide-react'
import { Card, CardBody, CardFooter, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Field } from '@/components/ui/Field'
import { Textarea } from '@/components/ui/Textarea'
import { ErrorState } from '@/components/ui/States'
import { ProcessingSteps } from '@/components/ui/ProcessingSteps'
import { ReviewPanel } from '@/features/correspondence/ReviewPanel'
import { useI18n } from '@/hooks/useI18n'
import { useAiTask } from '@/hooks/useAi'
import { ai, type ReviewResult } from '@/services/ai'
import type { Language } from '@/types/domain'

export default function ReviewPage() {
  const { t } = useI18n()
  const location = useLocation()
  const seeded = (location.state as { body?: string } | null)?.body ?? ''

  const [text, setText] = useState(seeded)
  const [language, setLanguage] = useState<Language>('ar')
  const [validationError, setValidationError] = useState<string | null>(null)

  const task = useAiTask<ReviewResult>(ai.reviewBeforeSend)

  const run = async () => {
    if (text.trim().length < 10) {
      setValidationError(t('error.generic'))
      return
    }
    setValidationError(null)
    await task.run({ text: text.trim(), language, incomingAnalysis: null })
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">{t('review.title')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('review.subtitle')}</p>
      </header>

      <Card>
        <CardHeader title={t('improve.paste')} />
        <CardBody className="space-y-4">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={10} aria-label={t('improve.paste')} />
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
            <FileCheck2 className="size-4" aria-hidden="true" />
            {t('review.run')}
          </Button>
        </CardFooter>
      </Card>

      {task.loading ? (
        <Card>
          <CardBody>
            <ProcessingSteps steps={[t('loading.understanding'), t('loading.reviewing')]} />
          </CardBody>
        </Card>
      ) : null}

      {task.data ? <ReviewPanel review={task.data} /> : null}
    </div>
  )
}
