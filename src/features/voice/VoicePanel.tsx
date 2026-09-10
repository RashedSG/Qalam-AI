import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileText, Mic, Square, Volume2, VolumeX, X } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useI18n } from '@/hooks/useI18n'
import { useVoiceSession } from '@/hooks/useVoiceSession'
import { cn } from '@/lib/utils'
import type { TranslationKey } from '@/i18n'

/**
 * ⚠️ الوصولية: كل رد صوتي معروض نصًّا هنا، والكتم يوقف الصوت ويُبقي النص.
 * الصوت إضافة لا بديل — من لا يسمع أو لا يريد سماعًا يحصل على كل شيء.
 */
export function VoicePanel() {
  const { t } = useI18n()
  const [muted, setMuted] = useState(false)
  const session = useVoiceSession({ muted })

  const {
    state,
    error,
    exchanges,
    partial,
    supported,
    sttOnDevice,
    ttsOnDevice,
    startListening,
    stopListening,
    cancelListening,
    stopSpeaking,
  } = session

  if (!supported) {
    return (
      <Card>
        <CardBody className="text-sm leading-7">{t('voice.notSupported')}</CardBody>
      </Card>
    )
  }

  const listening = state === 'listening'
  const busy = state === 'processing'

  return (
    <Card>
      <CardBody className="space-y-4">
        {/* ------------------------- الحالة والأزرار ------------------------- */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={listening ? stopListening : startListening}
            disabled={busy}
            aria-label={listening ? t('voice.stopListening') : t('voice.button')}
            aria-pressed={listening}
            className={cn(
              'relative flex size-14 shrink-0 items-center justify-center rounded-full transition-colors',
              listening
                ? 'bg-red-600 text-white'
                : 'bg-navy-700 text-white hover:bg-navy-800 dark:bg-beige-100 dark:text-navy-900',
              busy && 'opacity-60',
            )}
          >
            {listening ? (
              <Square className="size-5" aria-hidden="true" />
            ) : (
              <Mic className="size-6" aria-hidden="true" />
            )}
            {/* مؤشر بصري واضح أثناء التسجيل — لا تسجيل خفي. */}
            {listening ? (
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" aria-hidden="true" />
            ) : null}
          </button>

          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {busy ? <Spinner className="size-3.5" /> : null}
              {t(`voice.state.${state}` as TranslationKey)}
              {listening ? (
                <Badge tone="danger">
                  <span className="me-1 inline-block size-1.5 rounded-full bg-current" aria-hidden="true" />
                  {t('voice.recording')}
                </Badge>
              ) : null}
            </p>
            <p className="q-muted mt-0.5 text-xs leading-6">{t('voice.hint')}</p>
          </div>

          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMuted((value) => !value)}
              aria-label={muted ? t('voice.unmute') : t('voice.mute')}
              aria-pressed={muted}
            >
              {muted ? (
                <VolumeX className="size-4" aria-hidden="true" />
              ) : (
                <Volume2 className="size-4" aria-hidden="true" />
              )}
            </Button>
            {state === 'speaking' ? (
              <Button variant="ghost" size="sm" onClick={stopSpeaking}>
                {t('voice.stopSpeaking')}
              </Button>
            ) : null}
            {listening ? (
              <Button variant="ghost" size="sm" onClick={cancelListening} aria-label={t('voice.cancel')}>
                <X className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </div>
        </div>

        {/* الخصوصية معلنة دائمًا، لا في التوثيق وحده. */}
        <p className="q-muted rounded-lg bg-[rgb(var(--q-surface-2))] px-3 py-2 text-xs leading-6">
          {t('voice.privacy')} {sttOnDevice ? '' : t('voice.privacyServer')}{' '}
          {ttsOnDevice ? t('voice.privacyOnDevice') : ''}
        </p>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {/* --------------------------- المحادثة --------------------------- */}
        {partial ? (
          <p className="q-muted text-sm leading-7">
            <span className="font-semibold">{t('voice.youSaid')}:</span> {partial}
          </p>
        ) : null}

        {exchanges.length > 0 ? (
          <ul className="space-y-3" aria-live="polite">
            {exchanges.map((exchange, index) => (
              <li key={index} className="space-y-1.5">
                <p className="q-muted text-xs">
                  <span className="font-semibold">{t('voice.youSaid')}:</span> {exchange.spoken}
                </p>
                <div
                  className={cn(
                    'rounded-xl border p-3',
                    exchange.blockedIntent
                      ? 'border-gold-500/40 bg-gold-500/5'
                      : 'border-[rgb(var(--q-border))]',
                  )}
                >
                  {exchange.blockedIntent ? (
                    <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gold-600 dark:text-gold-400">
                      <AlertTriangle className="size-3.5" aria-hidden="true" />
                      {t('voice.blocked')}
                    </p>
                  ) : null}

                  {/* كل ما يُنطق مكتوب هنا — لا رد صوتي بلا نص. */}
                  <p className="whitespace-pre-wrap text-sm leading-7">{exchange.reply}</p>

                  {exchange.citations.length > 0 ? (
                    <ul className="mt-2 space-y-1 border-t border-[rgb(var(--q-border))] pt-2">
                      {exchange.citations.map((citation) => (
                        <li key={citation.correspondenceId}>
                          <Link
                            to={`/correspondence/${citation.correspondenceId}`}
                            className="inline-flex items-center gap-1.5 text-xs hover:underline"
                          >
                            <FileText className="size-3 shrink-0" aria-hidden="true" />
                            <span className="truncate">{citation.subject || '—'}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </CardBody>
    </Card>
  )
}
