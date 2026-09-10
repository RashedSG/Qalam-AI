import { useMemo } from 'react'
import { encodeQr, qrToSvgPath } from '@/lib/qr'

/**
 * رمز QR مرسوم SVG داخل الصفحة.
 *
 * لا صورة خارجية ولا خدمة توليد: إرسال رابط الوثيقة إلى خادم طرفٍ ثالث
 * ليرسم الرمز تسريبٌ صامت — والرابط يحمل رمز التحقق.
 */
export function QrCode({
  value,
  size = 96,
  className,
  title,
}: {
  value: string
  size?: number
  className?: string
  title?: string
}) {
  const code = useMemo(() => {
    try {
      return encodeQr(value)
    } catch {
      return null // نصٌّ أطول من السعة — نُسقط الرمز ولا نُسقط الوثيقة.
    }
  }, [value])

  if (!code) return null

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`-2 -2 ${code.size + 4} ${code.size + 4}`}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      shapeRendering="crispEdges"
    >
      {/* المنطقة الهادئة بيضاء دائمًا: الماسح يحتاجها ولو طُبعت الصفحة داكنة. */}
      <rect x={-2} y={-2} width={code.size + 4} height={code.size + 4} fill="#ffffff" />
      <path d={qrToSvgPath(code)} fill="#000000" />
    </svg>
  )
}
