/**
 * معاينة الوثيقة المطبوعة — أداة تطوير لا جزء من التطبيق.
 *
 * الوثيقة النهائية أهم مخرج في النظام، والوصول إليها في التطبيق يمر بتسجيل
 * دخول ومؤسسة ودورة اعتماد كاملة. فلا يراها من يريد مراجعة الترويسة أو تشكيل
 * الحروف أو موضع رمز QR إلا بعد عشر خطوات — وهذا يعني أنها لا تُراجَع.
 *
 * هذه الصفحة تعرضها ببيانات وهمية مباشرة. لا تُبنى مع التطبيق: vite لا يبني
 * إلا index.html.
 *
 *   npx vite --config vite.config.ts   ثم افتح /scripts/dev/print-preview.html
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { I18nProvider } from '@/contexts/I18nContext'
import { PrintableDocument } from '@/features/enterprise/PrintableDocument'
import type { Correspondence, Organization } from '@/types/database'
import '@/index.css'

const SAMPLE: Correspondence = {
  id: '00000000-0000-4000-8000-000000000001',
  user_id: '00000000-0000-4000-8000-000000000002',
  organization_id: '00000000-0000-4000-8000-000000000003',
  title: 'تعميم بشأن تنظيم الإجازات',
  subject: 'تنظيم الإجازات السنوية للعام المالي القادم',
  body: `سعادة مدير عام الشؤون الإدارية\tالمحترم

السلام عليكم ورحمة الله وبركاته، وبعد:

إشارةً إلى الاجتماع المنعقد بتاريخ ١٤ من الشهر الجاري بشأن تنظيم الإجازات السنوية، وبناءً على ما انتهت إليه اللجنة من توصيات، نودّ إحاطة سعادتكم بما يلي:

أولًا: تُرفع طلبات الإجازات السنوية قبل موعد الإجازة بمدة لا تقل عن خمسة عشر يومًا عملًا، عبر النظام الإلكتروني المعتمد.

ثانيًا: يُراعى ألّا يتجاوز عدد المتغيّبين في الإدارة الواحدة ربع عدد العاملين فيها في الوقت نفسه، حفاظًا على انتظام سير العمل.

ثالثًا: تُعتمد الإجازات من الرئيس المباشر ثم من إدارة الموارد البشرية، ولا تُعدّ نافذة قبل صدور الموافقة النهائية.

آمل من سعادتكم التوجيه بتعميم ما سبق على الإدارات التابعة لكم، واتخاذ ما يلزم نحو تطبيقه.

وتفضلوا بقبول فائق الاحترام والتقدير.`,
  language: 'ar',
  correspondence_type: 'official_letter',
  tone: 'formal',
  priority: 'normal',
  recipient: 'سعادة مدير عام الشؤون الإدارية',
  department_key: null,
  source: 'written',
  original_input: null,
  analysis: null,
  review: null,
  is_archived: false,
  created_at: '2026-09-01T08:00:00.000Z',
  updated_at: '2026-09-01T08:00:00.000Z',
  reference_number: 'MOT/ROOT/OUT/2026/0001',
  issued_at: '2026-09-10T11:30:00.000Z',
  current_status: 'issued',
  verification_token: 'a'.repeat(48),
}

const ORG: Organization = {
  id: '00000000-0000-4000-8000-000000000003',
  name: 'وزارة التجربة',
  name_en: 'Ministry of Trial',
  code: 'MOT',
  status: 'active',
  settings: {},
  branding: {
    letterhead: 'المملكة — وزارة التجربة — الإدارة العامة للشؤون الإدارية\nص.ب ١٢٣٤٥ — الرمز البريدي ١١١١١',
    footer: 'هاتف ٠١١٢٣٤٥٦٧٨ — البريد info@example.gov — www.example.gov',
  },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
} as Organization

const SIGNATURE = {
  name: 'د. عبدالله بن محمد الفهد',
  title: 'وكيل الوزارة للشؤون الإدارية',
  signedAt: '2026-09-10T11:25:00.000Z',
}

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root not found')

const VERIFY_URL = `https://qalam.example.gov/verify?code=${'a'.repeat(48)}`

/* حاوية الطباعة كما يُنشئها DocumentPanel — بها وحدها تُحاكى الطباعة الحقيقية. */
const portal = document.createElement('div')
portal.className = 'q-print-portal'
document.body.appendChild(portal)

createRoot(container).render(
  <StrictMode>
    <I18nProvider>
      <div className="mx-auto max-w-3xl bg-white p-10 text-black">
        <PrintableDocument
          correspondence={SAMPLE}
          organization={ORG}
          verifyUrl={VERIFY_URL}
          verifyCode={'a'.repeat(48)}
          signature={SIGNATURE}
          preview
        />
      </div>
    </I18nProvider>
  </StrictMode>,
)

createRoot(portal).render(
  <StrictMode>
    <I18nProvider>
      <PrintableDocument
        correspondence={SAMPLE}
        organization={ORG}
        verifyUrl={VERIFY_URL}
        verifyCode={'a'.repeat(48)}
        signature={SIGNATURE}
      />
    </I18nProvider>
  </StrictMode>,
)
