import type { Correspondence, Organization } from '@/types/database'
import { useI18n } from '@/hooks/useI18n'
import { QrCode } from '@/components/ui/QrCode'
import { formatDate } from '@/lib/utils'

/**
 * الوثيقة النهائية كما تُطبع.
 *
 * ⚠️ لا ادّعاء اعتماد: هذا قالب عام. لا يُعدّ معتمدًا من أي جهة ما لم تُدخل
 * المؤسسة قالبها المعتمد وتراجعه بنفسها — وهو ما تقوله الواجهة صراحةً في
 * صفحة هوية المؤسسة.
 *
 * التخطيط مُراجَع على ورق فعليًّا (محاكاة طباعة A4، لا على الشاشة وحدها):
 * الترويسة كتلة واحدة متمركزة كما هو عُرف المخاطبات الرسمية العربية، لا ثلاث
 * قطع متناثرة على السطر.
 */
export interface DocumentSignature {
  name: string
  title?: string
  signedAt: string
}

export function PrintableDocument({
  correspondence,
  organization,
  verifyUrl,
  verifyCode,
  signature,
  preview = false,
}: {
  correspondence: Correspondence
  organization: Organization | null
  verifyUrl: string | null
  /** رمز التحقق وحده — يُعرض مقروءًا لمن لا يستطيع مسح الرمز. */
  verifyCode?: string | null
  signature?: DocumentSignature | null
  preview?: boolean
}) {
  const { t, lang } = useI18n()
  const branding = (organization?.branding ?? {}) as {
    letterhead?: string
    footer?: string
    logo_url?: string
  }

  /** أصل الرابط دون الرمز — الرمز يُعرض تحته منفصلًا فلا يبتلع السطر. */
  const verifyOrigin = (() => {
    if (!verifyUrl) return null
    try {
      const url = new URL(verifyUrl)
      return `${url.origin}${url.pathname}`
    } catch {
      return verifyUrl
    }
  })()

  return (
    <div className={preview ? 'q-preview q-print-document' : 'q-print-document'}>
      <div className="q-print-header text-center">
        {branding.logo_url ? (
          // صورة على نفس النطاق فقط — CSP تحجب الخارجية.
          <img src={branding.logo_url} alt="" className="mx-auto mb-2 max-h-16" />
        ) : null}
        <p className="text-lg font-bold leading-snug">{organization?.name ?? ''}</p>
        {organization?.name_en ? (
          <p className="text-sm leading-snug" dir="ltr">
            {organization.name_en}
          </p>
        ) : null}
        {branding.letterhead ? (
          <p className="mt-1 whitespace-pre-line text-xs leading-6">{branding.letterhead}</p>
        ) : null}
      </div>

      <div className="mb-6 flex flex-wrap justify-between gap-2 text-sm">
        <span>
          <strong>{t('corr.reference')}:</strong>{' '}
          <span dir="ltr">{correspondence.reference_number ?? '—'}</span>
        </span>
        <span>
          <strong>{t('common.date')}:</strong>{' '}
          {formatDate(correspondence.issued_at ?? correspondence.created_at, lang)}
        </span>
      </div>

      <div className="mb-4 space-y-1 text-sm">
        {correspondence.recipient ? (
          <p>
            <strong>{t('common.recipient')}:</strong> {correspondence.recipient}
          </p>
        ) : null}
        <p>
          <strong>{t('common.subject')}:</strong> {correspondence.subject}
        </p>
      </div>

      <div className="q-print-body q-letter whitespace-pre-wrap">{correspondence.body}</div>

      {/* كتلة التوقيع. وثيقة صادرة موقّعة بلا موضع توقيع تلفت النظر فورًا في
          أي مخاطبة رسمية. تظهر حين يوجد توقيع فعلي في القاعدة لا دائمًا. */}
      {signature ? (
        <div className="q-print-signature">
          <p className="font-semibold">{signature.name}</p>
          {signature.title ? <p className="text-sm">{signature.title}</p> : null}
          <p className="q-print-signed-note text-xs">
            {t('doc.signedElectronically')} — {formatDate(signature.signedAt, lang)}
          </p>
        </div>
      ) : null}

      <div className="q-print-footer">
        <div className="flex items-end justify-between gap-6">
          <div className="min-w-0 flex-1">
            {branding.footer ? <p className="whitespace-pre-line leading-6">{branding.footer}</p> : null}
            {verifyOrigin ? (
              <p className="mt-1 leading-6">
                {t('doc.verifyLink')}: <span dir="ltr">{verifyOrigin}</span>
              </p>
            ) : null}
            {/* الرمز على سطره: ٤٨ محرفًا داخل جملة تبتلع التذييل كلّه. */}
            {verifyCode ? (
              <p className="q-print-code leading-6">
                {t('doc.verifyCode')}:{' '}
                <span className="break-all font-mono" dir="ltr">
                  {verifyCode}
                </span>
              </p>
            ) : null}
          </div>

          {/* الرمز يحمل رابط التحقق لا محتوى الوثيقة — من يمسحه يرى الرقم
              والتاريخ والجهة فقط، وهو ما تراه صفحة التحقق نفسها. */}
          {verifyUrl ? (
            <div className="shrink-0 text-center">
              {/* ٩٦ بكسل = بوصة مطبوعة. رابط التحقق يبلغ الإصدار السادس
                  (٤١ وحدة)، فتصير الوحدة ٠٫٦٢ ملم — فوق الحد الأدنى لقارئ
                  الهاتف بهامش. عند ٨٠ بكسل تنزل إلى ٠٫٥٢ ملم، وهو الحد نفسه. */}
              <QrCode value={verifyUrl} size={96} title={t('doc.qrAlt')} />
              <p className="q-print-qr-caption mt-1 text-[9px] leading-tight">{t('doc.scanToVerify')}</p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
