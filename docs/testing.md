# قلم | QALAM — الاختبارات

## التشغيل اليومي

```bash
npm run test        # كل الاختبارات ما عدا تكامل قاعدة البيانات
npm run lint
npx tsc -b --force
npm run build
```

## الطبقات

| الطبقة | الملفات | ما تُثبته |
|---|---|---|
| وحدات | `src/lib`, `src/services`, `src/prompts` | منطق خالص |
| مكوّنات | `*.test.tsx` | سلوك الواجهة |
| ساكنة أمنية | `src/test/security.test.ts` | لا أسرار في المتصفح، لا `console` مباشرة في الخادم، رؤوس CSP |
| ساكنة RLS | `src/test/rls.test.ts` | كل جدول محمي، كل إجراء يعمل على `auth.uid()` |
| **تكامل قاعدة بيانات** | `src/test/db.integration.test.ts` | السلوك الفعلي تحت أدوار حقيقية |

الطبقتان الساكنتان تقرآن ملفات SQL نصًّا. مفيدتان ورخيصتان، لكنهما **لا تُثبتان
سلوكًا** — لا تعرفان أن القفل ذرّي فعلًا ولا أن RLS يرفض فعلًا. لذلك توجد طبقة
التكامل.

---

## اختبارات التكامل

تُتخطى تلقائيًا بلا `QALAM_TEST_DATABASE_URL` — لا تُبطئ التطوير ولا تتطلب بنية في CI.

### تجهيز قاعدة اختبار محلية

تحتاج PostgreSQL 15+ (Supabase يستخدم 15/16).

**١. أنشئ قاعدة فارغة**

```bash
createdb qalam_test
```

**٢. أنشئ محاكي Supabase**

الهجرات تفترض وجود مخطط `auth` ودالة `auth.uid()` والأدوار — يوفّرها Supabase.
احفظ هذا في `supabase/test/00_shim.sql` أو نفّذه مباشرة:

```sql
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon')          then create role anon nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
  if not exists (select 1 from pg_roles where rolname='service_role')  then create role service_role nologin noinherit bypassrls; end if;
end $$;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ⚠️ nullif قبل التحويل: current_setting قد يعيد '' لا NULL، و''::jsonb خطأ.
--    هذا ما يفعله auth.uid() الحقيقي في Supabase بالضبط، وإغفاله يجعل
--    الاختبارات تفشل بـ«invalid input syntax for type json» بعد reset.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', ''), 'anon')
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to authenticated, service_role;

-- ⚠️ ضروري: Supabase يمنح هذه الصلاحيات افتراضيًا لكل جدول جديد في public.
-- بدونها لا يطابق بستر الاختبار الإنتاج، وتمر اختبارات سلبية لأسباب خاطئة.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;
```

**٣. طبّق الهجرات بالترتيب**

```bash
for f in supabase/migrations/*.sql; do psql -d qalam_test -v ON_ERROR_STOP=1 -f "$f"; done
```

**٤. شغّل**

```bash
QALAM_TEST_DATABASE_URL=postgres://localhost/qalam_test npm run test
```

### مبادئ الكتابة

- **كل اختبار داخل معاملة تُلغى** (`begin`/`rollback`) — لا أثر متسرّب ولا اعتماد على ترتيب.
- **`set role` لا `set local role`** — الأخيرة تُلغى بنهاية كل عبارة خارج المعاملات،
  فتعود الاستعلامات بصلاحيات المالك وتنجح الاختبارات السلبية لأسباب خاطئة.
- **`expectDenied` بنقطة حفظ** — خطأ داخل معاملة يُجهضها، فتفشل كل عبارة تالية
  بـ«transaction is aborted» بدل الخطأ الحقيقي.
- **الاختبار السلبي يفحص الأثر لا الاستثناء.** غياب سياسة `UPDATE` في RLS لا يرمي
  خطأ: يُحدَّث صفر صفوف بصمت. الادّعاء الصحيح هو `rowCount === 0` وقيمة الصف بعدها.

### ما تُثبته حاليًا (١٥٤ اختبارًا)

**سير العمل — `workflow.integration.test.ts` (٤٢):**

- بوابة المرحلة: موظف→اعتماد، مراجع→توقيع، مؤسسة أخرى→اعتماد — كلها تفشل
- آلة الحالة: الدورة الكاملة، رفض القفز فوق مرحلة، إلزام التعليق، الأرشفة
- النسخة المعتمدة: لا تُعدَّل في مكانها، والتنقيح يحفظها ويعيد الدورة
- التوقيع: للمعتمد فقط، ببصمة النص، لا يُعدَّل، ولا يشلّ الحذف المتتالي
- فصل المهام: مُطفأ افتراضيًا، ويعمل عند التفعيل في الاتجاهين
- التفويض: يمنح، ولا يتجاوز المفوِّض، وينتهي بنفسه، ويسقط إن فقد المفوِّض صلاحيته

**المراسلة المؤسسية — `correspondence.integration.test.ts` (٥١):**

- التصنيف يحجب فعلًا: تخليص أدنى لا يرى الأشد سرية، والمالك لا يُحجب عن مراسلته،
  والإصدارات السابقة محجوبة أيضًا فلا تسريب من باب خلفي
- أرقام المراسلات: الصيغة، استقلال العدّاد لكل اتجاه ووحدة، نهائية الرقم،
  رفض الإصدار بلا صلاحية، ورفض التعديل المباشر
- الإحالات: تمنح وصولًا، تصل كل عضو في الوحدة، لا تتجاوز المؤسسة، الرد مقصور
  على المُحال إليه، وكل شيء مُسجَّل
- المرفقات: تتبع المراسلة، تصنيفها يتجاوزها عند التشدد، المسار مُولَّد لا يُلفَّق،
  وقرار Storage يطابق قرار الجدول
- الإشعارات: بلا محتوى، خاصة بصاحبها، لا تُنشأ من المتصفح

**التفويض المؤسسي — `rbac.integration.test.ts` (٤٠):**

**التفويض المؤسسي — `rbac.integration.test.ts` (٤٠):**

- انحدار: كل مستخدم يرى مراسلاته، ولا يرى زميلًا في وحدة أخرى، وصف بلا مؤسسة يبقى لمالكه
- النطاقات: `descendants` يرى ما تحته لا ما فوقه ولا الوحدة الشقيقة؛ تعدد الأدوار يأخذ الأوسع
- عزل المؤسسات: نطاق «المؤسسة كاملة» في (ب) لا يرى مراسلة ولا هيكلًا ولا عضوًا في (أ)
- منع التصعيد: أدوار النظام غير قابلة للتعديل؛ منح الذات ممكن لكنه مُسجَّل ومُعلَّم
- دورة الحياة: التعطيل والتعليق يُنهيان الوصول فورًا؛ نقل موظف ينقل نطاق رؤيته
- الشجرة: صيانة المسار، إعادة بناء مسارات الأحفاد، منع الحلقات وعبور المؤسسات
- السجل: إلحاقي فعلًا، ولا يمنع حذف الحساب (انحدار مُثبَت)

**المرحلة ١ — `db.integration.test.ts` (٢١):**

- حد المعدّل: الاندفاع، الدقيقة، السقف اليومي، العزل بين المستخدمين، الضبط من `app_settings`
- التتبّع: لا عمود محتوى، لا حسم لطلب غيرك، لا إعادة كتابة لسجل محسوم، قصّ رمز الخطأ
- سلبية: `app_settings` و`signup_invites` محجوبان، لا `UPDATE` ولا `DELETE` لسجل غيرك،
  لا رؤية لمراسلات غيرك، لا انتحال `user_id` عند الإدراج
- التسجيل: الوضع العام يعمل، وضع الدعوة يرفض غير المدعو بلا أثر، الدعوة تُستهلك مرة واحدة،
  المنتهية والملغاة تُرفض
