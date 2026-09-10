<div align="center">

# قلم | QALAM

**مساعد المراسلات المؤسسية الذكي**
_AI Corporate Correspondence Assistant_

</div>

---

## ما هو قلم؟

**قلم** تطبيق ويب عربي/إنجليزي يساعدك على كتابة المراسلات المؤسسية والرسمية باحتراف:

| الوظيفة | الوصف |
|---|---|
| ✍️ **كتابة مراسلة** | تكتب فكرتك بلغتك اليومية → يفهمها قلم → يصوغ ٣ صيغ رسمية مختلفة فعليًا |
| 📥 **الرد على مراسلة** | تلصق المراسلة الواردة → يستخرج ما هو مطلوب منك بالضبط → يسألك عن الناقص → يكتب الرد |
| ✅ **تغطية كل النقاط** | Checklist يتحقق أن الرد غطّى كل طلب ورد في المراسلة الواردة |
| ✨ **تحسين مراسلة** | تصحيح لغوي، أكثر رسمية/دبلوماسية/حزمًا، اختصار، تبسيط، إعادة صياغة |
| 🌐 **ترجمة مؤسسية** | عربي ↔ إنجليزي تحافظ على المعنى والرسمية والمصطلح المؤسسي — لا ترجمة حرفية |
| 🛡️ **قبل أن ترسل** | ١٢ فحصًا (وضوح، نبرة، عبارات حادة، التزامات غير مقصودة…) + درجة من ١٠٠ |
| 🎓 **علّمني** | تمارين واقعية بأربعة مستويات، تقييم على ٨ معايير، ثم صيغة نموذجية |
| 📚 **قاموس قلم** | الصياغات المؤسسية: معناها، متى تُستخدم، متى لا تُستخدم، وبدائلها |
| 📄 **القوالب والمسودات والسجل** | ١٣ قالبًا جاهزًا، حفظ المسودات، سجل قابل للبحث والتصفية |

> **إخلاء مسؤولية:** قلم أداة مساعدة للصياغة. لا يمثل أي جهة رسمية، ولا يُنشئ شعارات أو أختامًا، ولا يُغني عن المراجعة القانونية.

---

## التقنيات

| الطبقة | التقنية |
|---|---|
| الواجهة | React 18 · Vite 6 · TypeScript · Tailwind CSS 3 |
| الحالة | TanStack Query (server state) · React Context (UI state) |
| النماذج | React Hook Form + Zod |
| القاعدة والمصادقة | Supabase (Postgres + Auth + RLS) |
| الذكاء الاصطناعي | OpenAI API — عبر Netlify Function آمنة فقط |
| النشر | Netlify (Static + Functions) |
| الاختبار | Vitest + Testing Library |

---

## 🔐 معمارية الأمان

**القاعدة الأولى: مفتاح OpenAI لا يصل المتصفح إطلاقًا.**

```
المستخدم
  → React App              (لا يحمل أي سر)
  → Netlify Function       (/.netlify/functions/ai)
       ├─ يتحقق من جلسة Supabase (وإلا 401)
       ├─ يحجز حصة من حد المعدّل الدائم في القاعدة (وإلا 429 + Retry-After)
       ├─ يتحقق من المدخلات بـ Zod
       ├─ يبني الـ prompt على الخادم
       → OpenAI API        (المفتاح هنا فقط، بسقف زمني صريح)
       ├─ يتحقق من المخرجات بـ Zod (+ إعادة محاولة واحدة)
       ├─ يسجّل بيانات الاستخدام الوصفية (لا محتوى)
  → React App
```

ضمانات إضافية:

- **RLS إلزامي** على كل جدول. كل سياسة = (المالك) OR (نطاق ممنوح بدور)، فالمالك يصل دائمًا إلى صفوفه.
- **عزل المؤسسات كامل**: مستخدم في مؤسسة لا يملك أي مسار إلى صف في مؤسسة أخرى — لا قراءة ولا تعديل ولا رؤية للهيكل أو الأعضاء.
- **سجل تدقيق إلحاقي** يرفض التعديل والحذف حتى من مالك الجدول، ويُعلّم منح الذات صراحةً.
- **لا Service Role Key** في التطبيق إطلاقًا — حتى حد المعدّل يعمل برمز جلسة المستخدم نفسه.
- **وحدات الـ prompts لا تُشحن إلى المتصفح** — يستوردها الخادم فقط (يتحقق من ذلك اختبار آلي).
- **حد معدّل دائم وذرّي** في PostgreSQL (اندفاع/دقيقة/سقف يومي)، قابل للضبط بلا نشر جديد.
- **سقف زمني** لكل استدعاء خارجي عبر `AbortController`.
- **CSP مُنفَّذة** بلا `unsafe-inline` في `script-src`، و`connect-src` محصورة في Supabase.
- **سجلات مُعقَّمة**: مسار كتابة واحد لا يقبل نصًا حرًّا؛ جسم خطأ المزوّد لا يُقرأ إطلاقًا.
- **حذف كامل**: `delete_my_data()` و `delete_my_account()`.

اختبارات `src/test/security.test.ts` تفشل البناء تلقائيًا إذا لامس كود المتصفح أي سر.

📄 التفصيل الكامل في **[`docs/security.md`](docs/security.md)**.

---

## 🚀 التشغيل من الصفر

### المتطلبات

- Node.js **20+**
- حساب [Supabase](https://supabase.com)
- مفتاح [OpenAI API](https://platform.openai.com/api-keys)
- حساب [Netlify](https://netlify.com) (للنشر)

### 1) التثبيت

```bash
git clone https://github.com/RashedSG/Qalam-AI.git
cd Qalam-AI
npm install
cp .env.example .env
```

### 2) إعداد Supabase

1. أنشئ مشروعًا جديدًا في [Supabase Dashboard](https://supabase.com/dashboard).
2. افتح **SQL Editor** ونفّذ ملفات الهجرة **بالترتيب**:

   | # | الملف | الغرض |
   |---|---|---|
   | 1 | `supabase/migrations/0001_schema.sql` | الجداول والفهارس والـ triggers |
   | 2 | `supabase/migrations/0002_rls.sql` | **سياسات RLS — إلزامي** |
   | 3 | `supabase/migrations/0003_seed.sql` | الأقسام + ١٣ قالبًا + قاموس قلم |
   | 4 | `supabase/migrations/0004_account.sql` | دوال الحساب والتقدّم |
   | 5 | `supabase/migrations/0005_seed_idempotency.sql` | يمنع تكرار بذور النظام عند إعادة التنفيذ |
   | 6 | `supabase/migrations/0006_phase1_security.sql` | حد معدّل دائم، تتبّع استخدام، سياسة تسجيل |
   | 7 | `supabase/migrations/0007_org_rbac_schema.sql` | المؤسسات، الهيكل، الأدوار، الصلاحيات، سجل التدقيق |
   | 8 | `supabase/migrations/0008_authorization.sql` | دوال التفويض التي تعتمد عليها كل السياسات |
   | 9 | `supabase/migrations/0009_backfill_organization.sql` | **نقل البيانات القائمة** — يتحقق ويفشل بصوت عالٍ |
   | 10 | `supabase/migrations/0010_rls_rbac.sql` | RLS واعية بالمؤسسة والدور والنطاق |
   | 11 | `supabase/migrations/0011_audit_triggers.sql` | تدقيق تلقائي للتغييرات الحاكمة |

   جميع الملفات آمنة لإعادة التنفيذ (تم التحقق منها بتنفيذها فعليًا على PostgreSQL 16).

   للتأكد بعد التنفيذ:

   ```sql
   select
     (select count(*) from departments        where is_system) as departments,  -- 13
     (select count(*) from templates          where is_system) as templates,    -- 13
     (select count(*) from dictionary_entries where is_system) as phrases;      -- 17
   ```

   > بديل عبر Supabase CLI: `supabase db push`

3. من **Project Settings → API** انسخ `Project URL` و `anon public key` إلى `.env`:

   ```bash
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   ```

4. **تسجيل الدخول عبر Google** (اختياري): **Authentication → Providers → Google** → فعّله وأضف `Client ID/Secret`.
   أضف في **URL Configuration → Redirect URLs**: `http://localhost:8888/dashboard` وعنوان موقعك على Netlify.

   > Microsoft لاحقًا: فعّل مزوّد `azure` في Supabase — الكود جاهز (`signInWithOAuth('azure')`) ولا يحتاج تعديلًا.

### 3) إعداد OpenAI

أضف إلى `.env` (**بدون** بادئة `VITE_` — سر خادم):

```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
```

> `SUPABASE_URL` / `SUPABASE_ANON_KEY` تستخدمهما الدالة للتحقق من جلسة المستخدم قبل أي استدعاء لـ OpenAI.

### 4) التطوير

```bash
# الواجهة فقط (بدون دوال AI)
npm run dev            # http://localhost:5173

# الواجهة + دوال Netlify معًا — الوضع الموصى به
npm i -g netlify-cli
netlify dev            # http://localhost:8888
```

### 5) النشر على Netlify

```bash
netlify init      # اربط المستودع
netlify deploy --prod
```

أو من لوحة Netlify: **Add new site → Import an existing project** ثم اختر المستودع. الإعدادات تُقرأ من `netlify.toml`:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

ثم **Site settings → Environment variables** أضف:

| المتغير | مرئي للمتصفح؟ | ملاحظات |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ نعم | عام بطبيعته |
| `VITE_SUPABASE_ANON_KEY` | ✅ نعم | عام — الحماية من RLS |
| `OPENAI_API_KEY` | ❌ **لا** | سر — الخادم فقط |
| `OPENAI_MODEL` | ❌ لا | اختياري (افتراضي `gpt-4o`) |
| `SUPABASE_URL` | ❌ لا | للتحقق من الجلسة داخل الدالة |
| `SUPABASE_ANON_KEY` | ❌ لا | للتحقق من الجلسة داخل الدالة |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ **لا تستخدمه** | غير مطلوب في V1 |

بعد النشر: `https://<site>/.netlify/functions/health` يجب أن يعيد `{"ok":true,"config":{"openai":true,"supabase":true}}`.

---

## أوامر npm

| الأمر | الوظيفة |
|---|---|
| `npm run dev` | خادم التطوير |
| `npm run build` | فحص الأنواع + بناء الإنتاج |
| `npm run preview` | معاينة حزمة الإنتاج |
| `npm run lint` | ESLint |
| `npm run lint:fix` | إصلاح تلقائي |
| `npm run test` | تشغيل كل الاختبارات |
| `npm run test:watch` | اختبارات تفاعلية |
| `npm run netlify:dev` | الواجهة + الدوال معًا |

---

## بنية المشروع

```
src/
├── components/
│   ├── ui/            مكوّنات أساسية (Button, Field, Modal, ScoreGauge…)
│   └── layout/        AppShell · Sidebar · BottomNav · Guards · ErrorBoundary
├── pages/             ٢١ صفحة (Welcome → Settings)
├── features/
│   └── correspondence/ AnalysisPanel · VariantCard · ReviewPanel · CoverageChecklist
├── services/
│   ├── ai/            طبقة تجريد AI: types · aiProvider · openaiProvider · schemas
│   └── db/            وصول Supabase مقسّم حسب المجال
├── prompts/           ⚠️ وحدات prompt — تُستخدم على الخادم فقط
├── hooks/             useAuth · useI18n · useTheme · useProfile · useAi
├── contexts/          Auth · I18n · Theme
├── i18n/              قاموس عربي/إنجليزي كامل
├── data/              التسميات المرجعية ثنائية اللغة
├── types/             domain · database
└── lib/               supabase · queryClient · utils

netlify/functions/
├── ai.ts              🔐 نقطة الاتصال الآمنة الوحيدة بـ OpenAI
├── health.ts          فحص الجاهزية
└── _shared/           env · auth · rateLimit · openai · registry

supabase/migrations/   0001 schema · 0002 RLS · 0003 seed · 0004 account
```

---

## طبقة الذكاء الاصطناعي القابلة للتبديل

الواجهة **لا تعرف** أي مزود يُستخدم. لإضافة Claude أو Gemini لاحقًا:

```ts
// 1) src/services/ai/anthropicProvider.ts
export const anthropicProvider: AiProvider = {
  id: 'anthropic',
  label: 'Claude',
  run: async (task, payload, options) => { /* … */ },
}

// 2) src/services/ai/aiProvider.ts
registerAiProvider(anthropicProvider)
setActiveAiProvider('anthropic')
```

لا تتغير أي صفحة أو مكوّن. (يغطي هذا السيناريو اختبار في `aiProvider.test.ts`.)

---

## الاختبارات

`npm run test` — **167 اختبارًا** تغطي:

- مخططات مخرجات AI (Structured Outputs) ورفض الاستجابات غير الصالحة
- وحدات الـ prompts: اختلاف الصيغ الثلاث فعليًا، تغطية النقاط، منع اختراع المعلومات، نفي الضمان القانوني
- مسار AI الآمن: لا اتصال مباشر بـ OpenAI، تحويل ٤٠١/٤٢٩/٥٠٤/أخطاء الشبكة إلى رسائل عربية
- تعقيم السجلات: حجب المفاتيح والرموز والبريد، وإسقاط أي نص طويل أو متعدد الأسطر
- السقف الزمني: انتهاء المهلة مُميَّز عن الإلغاء، وعدم قراءة جسم خطأ المزوّد إطلاقًا
- رؤوس الأمان: CSP تمنع السكربت المضمّن وتحصر الاتصالات، وكل مصدر في `index.html` مسموح فيها
- طبقة التجريد: تسجيل مزود جديد وتفعيله
- تدفق تسجيل الدخول: التحقق، الأخطاء، الاستدعاء الصحيح
- خدمة المسودات: الإنشاء والتحديث والحذف والاستنساخ
- افتراضات RLS في ملفات الهجرة، وأن كل إجراء يعمل على `auth.uid()` فقط
- فحص تسريب الأسرار في كود المتصفح وكود الخادم

بالإضافة إلى **٦١ اختبار تكامل** على PostgreSQL حقيقي — حد المعدّل، بوابة التسجيل،
وعزل المؤسسات والأدوار والنطاقات وسجل التدقيق. معظمها **سلبي**: «هذا المستخدم يجب
ألا…». تُتخطى تلقائيًا بلا `QALAM_TEST_DATABASE_URL`.
راجع **[`docs/testing.md`](docs/testing.md)** و**[`docs/authorization.md`](docs/authorization.md)**.

---

## غير مشمول في V1 (البنية جاهزة له)

Microsoft 365 · إرسال مباشر عبر Outlook/Gmail · SSO · OCR · رفع PDF/Word · إدخال صوتي · Fine-tuning · RAG على وثائق المؤسسة · تطبيق جوال أصلي.

**أُنجز منذ V1:** المؤسسات والهيكل التنظيمي والأدوار والصلاحيات ولوحة الإدارة وسجل التدقيق (المرحلة ٢).

---

## الترخيص

خاص — جميع الحقوق محفوظة.
