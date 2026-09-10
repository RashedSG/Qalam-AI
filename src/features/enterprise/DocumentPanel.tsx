import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer, ShieldCheck } from 'lucide-react'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { useI18n } from '@/hooks/useI18n'
import { listSignatures } from '@/services/db/workflow'
import { listMemberDirectory } from '@/services/db/organization'
import { PrintableDocument } from './PrintableDocument'
import type { Correspondence, Organization } from '@/types/database'

/** المراسلة صالحة للطباعة الرسمية بعد الإصدار وحده. */
const ISSUED_STATUSES = new Set(['issued', 'closed', 'archived'])

export function DocumentPanel({
  correspondence,
  organization,
}: {
  correspondence: Correspondence
  organization: Organization | null
}) {
  const { t } = useI18n()
  const [preview, setPreview] = useState(false)

  const signatures = useQuery({
    queryKey: ['signatures', correspondence.id],
    queryFn: () => listSignatures(correspondence.id),
  })
  const directory = useQuery({
    queryKey: ['member-directory', correspondence.organization_id],
    queryFn: () => listMemberDirectory(correspondence.organization_id!),
    enabled: Boolean(correspondence.organization_id),
  })

  /**
   * التوقيع المعروض على الوثيقة.
   *
   * ⚠️ الاسم يأتي من دليل الأعضاء لا من `profiles`: الأخير محميّ بـ
   * `auth.uid() = id`، فلا أحد يقرأ اسم غيره منه — وكانت النتيجة وثيقةً موقّعة
   * بلا اسم موقّع.
   */
  const signature = useMemo(() => {
    const latest = (signatures.data ?? [])[0]
    if (!latest) return null
    const signer = (directory.data ?? []).find((entry) => entry.user_id === latest.signer_id)
    return {
      name: signer?.full_name ?? t('doc.signerUnknown'),
      signedAt: latest.signed_at,
    }
  }, [signatures.data, directory.data, t])

  const issued =
    ISSUED_STATUSES.has(correspondence.current_status ?? '') && Boolean(correspondence.reference_number)

  /**
   * رابط التحقق يُبنى من رمز الوثيقة إن وصل. لا يُبنى من المعرّف: المعرّف
   * يخصّ من يملك الوصول أصلًا، والرمز وحده هو ما يجوز أن يحمله ورقٌ علني.
   */
  const verifyUrl = useMemo(() => {
    if (!correspondence.verification_token) return null
    return `${window.location.origin}/verify?code=${correspondence.verification_token}`
  }, [correspondence.verification_token])

  if (!issued) {
    return (
      <Card>
        <CardBody className="q-muted text-sm leading-7">{t('doc.notIssued')}</CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title={t('doc.printPreview')}
        description={t('doc.printHint')}
        action={
          <div className="flex flex-wrap gap-1.5">
            <Button variant="outline" size="sm" onClick={() => setPreview((v) => !v)}>
              {t('brand.preview')}
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer className="size-3.5" aria-hidden="true" />
              {t('doc.print')}
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-4">
        {/* لا ادّعاء اعتماد — بند صريح في متطلبات المرحلة نلتزم به حرفيًا. */}
        <p className="q-muted flex items-start gap-2 text-xs leading-6">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t('brand.disclaimer')}
        </p>

        {preview ? (
          <div className="overflow-x-auto rounded-xl border border-[rgb(var(--q-border))] bg-white p-6 text-black">
            <PrintableDocument
              correspondence={correspondence}
              organization={organization}
              verifyUrl={verifyUrl}
              verifyCode={correspondence.verification_token ?? null}
              signature={signature}
              preview
            />
          </div>
        ) : null}
      </CardBody>

      {/* الوثيقة المطبوعة تعيش خارج شجرة التطبيق: عند الطباعة يُخفى الجذر
          كلّه وتبقى هي. فلا تتسرّب لوحةٌ أو زرٌّ إلى الورقة الرسمية. */}
      {createPortal(
        <div className="q-print-portal">
          <PrintableDocument
            correspondence={correspondence}
            organization={organization}
            verifyUrl={verifyUrl}
            verifyCode={correspondence.verification_token ?? null}
            signature={signature}
          />
        </div>,
        document.body,
      )}
    </Card>
  )
}
