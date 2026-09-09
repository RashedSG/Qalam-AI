import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  FileCheck2,
  Languages,
  Minimize2,
  Pencil,
  RefreshCw,
  Save,
  Scale,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardBody, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { useI18n } from '@/hooks/useI18n'
import { useToast } from '@/components/ui/Toast'
import { copyToClipboard, countWords } from '@/lib/utils'
import type { TranslationKey } from '@/i18n'
import type { CorrespondenceVariant } from '@/services/ai/schemas'
import type { ImproveAction } from '@/types/domain'

export interface VariantCardProps {
  variant: CorrespondenceVariant
  busy?: boolean
  onChange: (next: CorrespondenceVariant) => void
  onRefine: (action: ImproveAction) => void
  onTranslate: () => void
  onReview: () => void
  onSaveDraft: () => void
  onSaveFinal: () => void
  saving?: boolean
}

const KIND_TONE = {
  recommended: 'navy',
  concise: 'neutral',
  more_formal: 'gold',
} as const

const REFINE_ACTIONS: Array<{ action: ImproveAction; labelKey: TranslationKey; icon: typeof RefreshCw }> = [
  { action: 'full_rewrite', labelKey: 'result.rewrite', icon: RefreshCw },
  { action: 'shorten', labelKey: 'result.shorten', icon: Minimize2 },
  { action: 'more_formal', labelKey: 'result.moreFormal', icon: Scale },
  { action: 'more_diplomatic', labelKey: 'result.moreDiplomatic', icon: ShieldAlert },
  { action: 'more_firm', labelKey: 'result.moreFirm', icon: FileCheck2 },
]

export function VariantCard({
  variant,
  busy,
  onChange,
  onRefine,
  onTranslate,
  onReview,
  onSaveDraft,
  onSaveFinal,
  saving,
}: VariantCardProps) {
  const { t } = useI18n()
  const { toast } = useToast()
  const [editing, setEditing] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const id = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(id)
  }, [copied])

  const kindLabel =
    variant.kind === 'recommended'
      ? t('result.recommended')
      : variant.kind === 'concise'
        ? t('result.concise')
        : t('result.more_formal')

  const handleCopy = async () => {
    const text = variant.subject ? `${variant.subject}\n\n${variant.body}` : variant.body
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopied(true)
      toast(t('common.copied'), 'success')
    } else {
      toast(t('error.generic'), 'error')
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
        <div className="flex items-center gap-2">
          <Badge tone={KIND_TONE[variant.kind]}>{kindLabel}</Badge>
          <span className="q-muted text-xs tabular-nums">
            {countWords(variant.body)} {t('common.words')}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
            <span className="hidden sm:inline">{copied ? t('common.copied') : t('common.copy')}</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
            <Pencil className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">{editing ? t('result.editDone') : t('common.edit')}</span>
          </Button>
        </div>
      </div>

      <CardBody className="pt-4">
        {variant.subject ? (
          <p className="mb-3 text-sm font-semibold">
            <span className="q-muted font-normal">{t('common.subject')}: </span>
            {variant.subject}
          </p>
        ) : null}

        {editing ? (
          <Textarea
            value={variant.body}
            rows={14}
            onChange={(e) => onChange({ ...variant, body: e.target.value })}
            aria-label={t('common.edit')}
          />
        ) : (
          <div className="q-letter text-[0.95rem]">{variant.body}</div>
        )}
      </CardBody>

      <CardFooter className="gap-1.5">
        {REFINE_ACTIONS.map(({ action, labelKey, icon: Icon }) => (
          <Button key={action} variant="outline" size="sm" disabled={busy} onClick={() => onRefine(action)}>
            <Icon className="size-3.5" aria-hidden="true" />
            {t(labelKey)}
          </Button>
        ))}
        <Button variant="outline" size="sm" disabled={busy} onClick={onTranslate}>
          <Languages className="size-3.5" aria-hidden="true" />
          {t('result.translate')}
        </Button>

        <span className="ms-auto flex flex-wrap gap-1.5">
          <Button variant="secondary" size="sm" disabled={busy} onClick={onReview}>
            <FileCheck2 className="size-3.5" aria-hidden="true" />
            {t('result.review')}
          </Button>
          <Button variant="outline" size="sm" loading={saving} onClick={onSaveDraft}>
            <Save className="size-3.5" aria-hidden="true" />
            {t('result.saveDraft')}
          </Button>
          <Button size="sm" loading={saving} onClick={onSaveFinal}>
            {t('result.saveFinal')}
          </Button>
        </span>
      </CardFooter>
    </Card>
  )
}
