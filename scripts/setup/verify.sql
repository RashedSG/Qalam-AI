-- =============================================================================
-- قلم | QALAM — فحص التهيئة
--
-- يُشغَّل بعد التهيئة وقبل إدخال أي بيانات حقيقية. لا يُعدّل شيئًا — يقرأ فقط.
--
--   psql "$SUPABASE_DB_URL" -f scripts/setup/verify.sql
--   أو الصقه في Supabase → SQL Editor.
--
-- أي سطر FAIL يعني أن النظام ليس جاهزًا. الفرق بين «نفّذتُ الخطوات» و«النظام
-- مُهيّأ فعلًا» هو هذا الملف.
-- =============================================================================

-- مخطط `storage` غير موجود في بيئة اختبار محلية، وPostgreSQL يحلّل الاستعلام
-- كلّه قبل تنفيذه — فـ`case` لا يحمي من خطأ «relation does not exist». ولذلك
-- تُفحص حاوية المرفقات بـSQL ديناميكي في دالة جلسية.
create or replace function pg_temp.qalam_storage_checks()
returns table (ord integer, check_name text, result text, detail text)
language plpgsql
as $fn$
declare
  has_buckets boolean := to_regclass('storage.buckets') is not null;
  has_objects boolean := to_regclass('storage.objects') is not null;
  is_public   boolean;
  found       boolean;
  policies    text;
begin
  -- 5) الحاوية موجودة وخاصة.
  if not has_buckets then
    return query select 5, 'حاوية المرفقات خاصة', 'SKIP',
                        'مخطط storage غير موجود (بيئة اختبار)';
  else
    execute $q$ select exists (select 1 from storage.buckets where id = 'correspondence-attachments') $q$
      into found;
    if not found then
      return query select 5, 'حاوية المرفقات خاصة', 'FAIL',
                          'الحاوية غير موجودة — الرفع والتنزيل لن يعملا';
    else
      execute $q$ select public from storage.buckets where id = 'correspondence-attachments' $q$
        into is_public;
      if is_public then
        return query select 5, 'حاوية المرفقات خاصة', 'FAIL',
                            '⚠️ الحاوية عامة — أي مستند مؤسسي مكشوف لمن يعرف المسار';
      else
        return query select 5, 'حاوية المرفقات خاصة', 'PASS', 'موجودة وخاصة';
      end if;
    end if;
  end if;

  -- 6) سياسات Storage مُطبَّقة. بلا هذه لا يُفحَص أحد عند التنزيل.
  if not has_objects then
    return query select 6, 'سياسات Storage مُطبَّقة', 'SKIP',
                        'مخطط storage غير موجود (بيئة اختبار)';
  else
    select string_agg(policyname, ', ') into policies
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname like 'qalam_%';

    if coalesce(array_length(string_to_array(policies, ', '), 1), 0) >= 3 then
      return query select 6, 'سياسات Storage مُطبَّقة', 'PASS', policies;
    else
      return query select 6, 'سياسات Storage مُطبَّقة', 'FAIL',
                          coalesce(policies, 'لا سياسات — أعد تنفيذ 0014_attachments.sql');
    end if;
  end if;
end
$fn$;

with checks as (

  -- 1) RLS مفعّلة على كل جدول في public. جدولٌ بلا RLS مكشوف لكل مستخدم مسجَّل.
  select 1 as ord, 'RLS على كل جدول' as check_name,
         case when count(*) = 0 then 'PASS' else 'FAIL' end as result,
         case when count(*) = 0 then 'كل الجداول محمية'
              else count(*)::text || ' جدول بلا RLS: ' || string_agg(relname, ', ') end as detail
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  -- 2) لا جدول مُنح لـanon. الزائر بلا حساب لا يقرأ جدولًا إطلاقًا.
  union all
  select 2, 'لا جدول متاح لـanon',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         case when count(*) = 0 then 'لا صلاحية جدول لـanon'
              else string_agg(distinct table_name, ', ') end
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public'

  -- 3) الدالة الوحيدة المتاحة لـanon هي التحقق العلني.
  --
  -- ⚠️ يُقصَر الفحص على دوالّنا `security definer` غير التابعة لامتداد: هي
  --    وحدها تتجاوز RLS. وفحصُ كل الدوال بلا تمييز عديم المعنى — PUBLIC يملك
  --    EXECUTE افتراضيًا، فيظهر كل شيء «متاحًا لـanon» بما فيه دوال pgcrypto.
  union all
  select 3, 'anon لا يتجاوز RLS إلا بالتحقق العلني',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         case when count(*) = 0 then 'verify_correspondence وحدها'
              else 'دوال definer مكشوفة: ' || string_agg(p.proname, ', ') end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef                                   -- تتجاوز RLS
    and p.prorettype <> 'trigger'::regtype            -- دوال المُشغّلات لا تُنادى
    and p.proname <> 'verify_correspondence'           -- الاستثناء المُعلَن
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and not exists (                                   -- ليست من امتداد
      select 1 from pg_depend d
      where d.objid = p.oid and d.deptype = 'e'
    )

  -- 4) وضع التسجيل. 'public' يعني أن أي أحد يُنشئ حسابًا في مؤسستك.
  union all
  select 4, 'التسجيل مُغلق (invite_only)',
         case when coalesce(value ->> 'mode', 'public') = 'invite_only' then 'PASS' else 'FAIL' end,
         'الوضع الحالي: ' || coalesce(value ->> 'mode', 'public')
  from (select value from public.app_settings where key = 'signup'
        union all select null where not exists (select 1 from public.app_settings where key='signup')) s

  -- 5 و6) حاوية المرفقات وسياساتها — بـSQL ديناميكي (انظر أعلاه).
  union all
  select * from pg_temp.qalam_storage_checks()

  -- 7) كل مؤسسة لها مستويات تصنيف.
  union all
  select 7, 'لكل مؤسسة مستويات تصنيف',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         case when count(*) = 0 then 'مُهيّأة'
              else 'بلا مستويات: ' || string_agg(code, ', ') end
  from public.organizations o
  where not exists (select 1 from public.classification_levels l where l.organization_id = o.id)

  -- 8) كل مؤسسة لها سياسة أرقام نشطة، وصيغتها سليمة.
  union all
  select 8, 'سياسة أرقام المراسلات سليمة',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         case when count(*) = 0 then 'سليمة'
              else 'مشكلة في: ' || string_agg(code, ', ') end
  from public.organizations o
  where not exists (
    select 1 from public.reference_number_policies p
    where p.organization_id = o.id and p.direction is null and p.is_active
      and cardinality(public.validate_reference_format(p.format)) = 0
  )

  -- 9) لكل مؤسسة مسؤول واحد على الأقل — وإلا فلا أحد يستطيع إدارتها.
  union all
  select 9, 'لكل مؤسسة مسؤول نشط',
         case when count(*) = 0 then 'PASS' else 'FAIL' end,
         case when count(*) = 0 then 'موجود'
              else 'بلا مسؤول: ' || string_agg(code, ', ') end
  from public.organizations o
  where not exists (
    select 1 from public.memberships m
    join public.membership_roles mr on mr.membership_id = m.id
    join public.roles r on r.id = mr.role_id
    where m.organization_id = o.id and m.status = 'active' and r.key = 'organization_admin'
  )

  -- 10) لا عضوٍ تخليصه أدنى من أعلى تصنيف بلا قصد — تنبيه لا خطأ.
  union all
  select 10, 'تخليص المسؤول يغطي أعلى تصنيف',
         case when count(*) = 0 then 'PASS' else 'WARN' end,
         case when count(*) = 0 then 'مُغطّى'
              else count(*)::text || ' مسؤول لا يرى أعلى تصنيف في مؤسسته' end
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.roles r on r.id = mr.role_id and r.key = 'organization_admin'
  where m.status = 'active'
    and m.clearance_rank < (
      select max(rank) from public.classification_levels l
      where l.organization_id = m.organization_id
    )

  -- 11) سجل التدقيق إلحاقي فعلًا (مُشغّل موجود).
  union all
  select 11, 'سجل التدقيق إلحاقي',
         case when count(*) > 0 then 'PASS' else 'FAIL' end,
         case when count(*) > 0 then 'المُشغّل مُطبَّق' else 'المُشغّل غائب — السجل قابل للتعديل' end
  from pg_trigger where tgname = 'audit_log_no_update'

  -- 12) سير العمل لا يُتجاوَز بتحديث مباشر على العمود.
  --
  -- ⚠️ لا يُفحَص بـ`has_column_privilege`: الهجرات تنفّذ
  --    `revoke update (current_status) … from authenticated`، وPostgreSQL لا
  --    يُنقص صلاحية عمود من منحةٍ على مستوى الجدول — فالفحص يعود `true` دائمًا
  --    ويقول «مكشوف» وهو ليس كذلك. الحاجز الفعلي مُشغّل.
  union all
  select 12, 'سير العمل محميّ من التحديث المباشر',
         case when count(*) > 0 then 'PASS' else 'FAIL' end,
         case when count(*) > 0 then 'المُشغّل مُطبَّق — الانتقال عبر الدالة وحدها'
              else '⚠️ المُشغّل غائب: يمكن تجاوز سير العمل بـUPDATE' end
  from pg_trigger
  where tgrelid = 'public.correspondences'::regclass
    and tgname = 'guard_status_column_trg'

  -- 13) الرقم الصادر لا يُعدَّل، والنص المعتمد لا يُغيَّر في مكانه.
  union all
  select 13, 'الرقم والنص المعتمد محميّان',
         case when count(*) = 2 then 'PASS' else 'FAIL' end,
         case when count(*) = 2 then 'المُشغّلان مُطبَّقان'
              else 'ناقص: ' || count(*)::text || '/2' end
  from pg_trigger
  where tgrelid = 'public.correspondences'::regclass
    and tgname in ('guard_reference_number_trg', 'guard_approved_content_trg')
)
select
  case result when 'PASS' then '✅' when 'WARN' then '⚠️ ' when 'SKIP' then '—' else '❌' end
    || ' ' || result as "الحالة",
  check_name as "الفحص",
  detail as "التفصيل"
from checks order by ord;
