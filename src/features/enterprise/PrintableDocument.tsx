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
 */
export function PrintableDocument({
  correspondence,
  organization,
  verifyUrl,
  preview = false,
}: {
  correspondence: Correspondence
  organization: Organization | null
  verifyUrl: string | null
  preview?: boolean
}) {
  const { t, lang } = useI18n()
  const branding = (organization?.branding ?? {}) as {
    letterhead?: string
    footer?: string
    logo_url?: string
  }

  return (
    <div className={preview ? 'q-preview q-print-document' : 'q-print-document'}>
      <div className="q-print-header">
        {branding.logo_url ? (
          // صورة على نفس النطاق فقط — CSP تحجب الخارجية.
          <img src={branding.logo_url} alt="" className="mb-2 max-h-16" />
        ) : null}
        <p className="text-lg font-bold">{organization?.name ?? ''}</p>
        {organization?.name_en ? (
          <p className="text-sm" dir="ltr">
            {organization.name_en}
          </p>
        ) : null}
        {branding.letterhead ? <p className="mt-1 text-xs leading-6">{branding.letterhead}</p> : null}
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

      <div className="q-print-footer">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            {branding.footer ? <p className="leading-6">{branding.footer}</p> : null}
            {verifyUrl ? (
              <p className="mt-1 leading-6">
                {t('doc.verifyLink')}: <span dir="ltr">{verifyUrl}</span>
              </p>
            ) : null}
          </div>
          {/* الرمز يحمل رابط التحقق لا محتوى الوثيقة — من يمسحه يرى الرقم
              والتاريخ والجهة فقط، وهو ما تراه صفحة التحقق نفسها. */}
          {verifyUrl ? (
            <QrCode value={verifyUrl} size={84} title={t('doc.qrAlt')} className="shrink-0" />
          ) : null}
        </div>
      </div>
    </div>
  )
}
