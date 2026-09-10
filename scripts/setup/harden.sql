-- =============================================================================
-- قلم | QALAM — إغلاق التسجيل ودعوة الأعضاء
--
-- ⚠️ نفّذ هذا **قبل** أن يعرف أحدٌ عنوان موقعك.
--    وضع التسجيل الافتراضي `public`: أي شخص يملك الرابط يُنشئ حسابًا في
--    مؤسستك. والبوابة في القاعدة لا في الواجهة — إخفاء صفحة التسجيل في React
--    ليس تفويضًا.
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f scripts/setup/harden.sql
--   أو الصقه في Supabase → SQL Editor.
--
-- قابل لإعادة التنفيذ.
-- =============================================================================

-- 1) إغلاق التسجيل: لا حساب جديد إلا بدعوة.
insert into public.app_settings (key, value)
values ('signup', '{"mode": "invite_only"}'::jsonb)
on conflict (key) do update
  set value = excluded.value, updated_at = now();

do $$
begin
  raise notice 'signup mode: %', public.signup_mode();
end $$;


-- 2) دعوة عضو جديد.
--
-- كل سطر هنا يسمح لبريدٍ واحد بإنشاء حساب مرة واحدة. الدعوة تُستهلك عند
-- التسجيل، والمنتهية والملغاة تُرفض.
--
-- ⚠️ الدعوة تُنشئ **حسابًا** لا **عضوية**: `handle_new_user` لا يُنشئ عضوية من
--    `organization_id` المرفق بالدعوة. فبعد أن يسجّل الشخص دخوله، أعد تنفيذ
--    `0009_backfill_organization.sql` — فهي تُنشئ العضوية لكل مستخدم قائم
--    وتجعله `employee`. ثم أسند له دوره الفعلي وتخليصه من شاشة «المستخدمون».
--
--    هذه خطوة يدوية لكل عضو، وهي فجوة معلومة في انضمام الأعضاء.
--
-- ألغِ التعليق وعدّل البريد:

-- insert into public.signup_invites (email, organization_id, invited_by, expires_at)
-- select
--   'colleague@example.com',
--   (select id from public.organizations limit 1),
--   (select id from auth.users where lower(email) = lower('you@example.com')),
--   now() + interval '14 days'
-- where not exists (
--   select 1 from public.signup_invites
--   where lower(email) = lower('colleague@example.com')
--     and accepted_at is null and revoked_at is null
-- );


-- 3) الدعوات القائمة.
select
  email                                   as "البريد",
  case
    when accepted_at is not null then 'مُستخدمة'
    when revoked_at  is not null then 'ملغاة'
    when expires_at is not null and expires_at < now() then 'منتهية'
    else 'سارية'
  end                                     as "الحالة",
  expires_at                              as "تنتهي"
from public.signup_invites
order by created_at desc;
