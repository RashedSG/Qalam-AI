import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, ShieldQuestion, XCircle } from 'lucide-react'
import { Card, CardBody } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Field } from '@/components/ui/Field'
import { Logo } from '@/components/ui/Logo'
import { useI18n } from '@/hooks/useI18n'
import { verifyDocument, type VerificationResult } from '@/services/db/reports'
import { formatDate } from '@/lib/utils'

/**
 * صفحة التحقق العلني — الصفحة الوحيدة التي تعمل بلا تسجيل دخول.
 *
 * ⚠️ ما تعرضه مقصود بحرفيته: رقم المراسلة، تاريخ الإصدار، الجهة المُصدِرة.
 * لا موضوع ولا نص ولا أطراف ولا تصنيف. من يحمل الورقة يعرفها أصلًا؛ ومن لا
 * يحملها لا يجوز أن يعرف شيئًا عنها.
 */
export default function VerifyPage() {
  const { t, lang } = useI18n()
  const [params] = useSearchParams()
  const [code, setCode] = useState(params.get('code') ?? '')
  const [result, setResult] = useState<VerificationResult | null>(null)
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const check = async (token: string) => {
    const trimmed = token.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      setResult(await verifyDocument(trimmed))
      setChecked(true)
    } catch {
      setError(t('error.loadFailed'))
    } finally {
      setBusy(false)
    }
  }

  // رمز في الرابط (من QR) يُتحقَّق منه تلقائيًا.
  useEffect(() => {
    const fromUrl = params.get('code')
    if (fromUrl) void check(fromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-10">
      <div className="text-center">
        <Logo className="mx-auto mb-6" />
        <h1 className="text-2xl font-bold">{t('doc.verifyTitle')}</h1>
        <p className="q-muted mt-1.5 leading-7">{t('doc.verifySubtitle')}</p>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void check(code)
            }}
          >
            <Field label={t('doc.verifyCode')}>
              {(p) => (
                <Input
                  {...p}
                  dir="ltr"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="a1b2c3…"
                  autoComplete="off"
                />
              )}
            </Field>
            <Button type="submit" loading={busy} disabled={!code.trim()} className="w-full">
              {t('doc.verifyButton')}
            </Button>
          </form>

          {error ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : null}

          {checked && !busy ? (
            result ? (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-4" role="status">
                <p className="mb-3 flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="size-5" aria-hidden="true" />
                  {t('doc.verified')}
                </p>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="q-muted text-xs">{t('corr.reference')}</dt>
                    <dd className="font-mono" dir="ltr">
                      {result.reference_number}
                    </dd>
                  </div>
                  <div>
                    <dt className="q-muted text-xs">{t('doc.verifyIssuedBy')}</dt>
                    <dd>{lang === 'en' && result.organization_name_en ? result.organization_name_en : result.organization_name}</dd>
                  </div>
                  <div>
                    <dt className="q-muted text-xs">{t('doc.verifyIssuedAt')}</dt>
                    <dd>{formatDate(result.issued_at, lang)}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-[rgb(var(--q-border))] p-4" role="status">
                <XCircle className="mt-0.5 size-5 shrink-0 text-[rgb(var(--q-text-muted))]" aria-hidden="true" />
                <p className="text-sm leading-7">{t('doc.notFound')}</p>
              </div>
            )
          ) : null}
        </CardBody>
      </Card>

      {/* حدود التحقق معلنة للزائر، لا مخفية. */}
      <p className="q-muted flex items-start gap-2 text-xs leading-6">
        <ShieldQuestion className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {t('doc.verifyPrivacy')}
      </p>
    </div>
  )
}
