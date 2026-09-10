-- =============================================================================
-- قلم | QALAM — دليل أعضاء المؤسسة
--
-- ⚠️ خلل كشفه تشغيل الواجهة فعليًّا:
--
--    `profiles` محميّ بـ`auth.uid() = id` — كلٌّ يرى ملفّه وحده. وهذا صحيح
--    للملف الشخصي، لكن `listMembers` تقرأ الأسماء بـ
--    `profiles!inner(full_name, email)`. والصفوف التي لا يُرى ملفّها تُسقَط
--    كلّها في الربط الداخلي — فشاشة «المستخدمون» تعرض **صفًّا واحدًا: أنت**،
--    مهما بلغ عدد أعضاء المؤسسة.
--
--    ولا يظهر هذا في اختبارات RLS: كلٌّ منها يفحص صفوف مستخدم واحد، والخلل
--    في تقاطع سياسةٍ سليمة مع استعلامٍ سليم.
--
--    وأثره أوسع من شاشة: التوقيع على الوثيقة لا يجد اسم الموقّع، والإحالة لا
--    تعرض اسم المُحال إليه.
--
-- الحل: دالة دليلٍ محدودة النطاق. لا فتح `profiles` لكل عضو — فالملف يحمل
-- أكثر من الاسم.
-- =============================================================================

/**
 * أسماء أعضاء مؤسستك.
 *
 * ⚠️ البريد ليس كالاسم: الاسم يحتاجه كل عضو (توقيع، إحالة، سجل)، والبريد
 *    بيانٌ شخصي لا يحتاجه إلا من يدير المستخدمين. فيُعاد الاسم للجميع
 *    ويُحجب البريد عمّن لا يملك `users.manage`.
 */
create or replace function public.org_member_directory(p_organization_id uuid)
returns table (
  user_id   uuid,
  full_name text,
  email     text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.user_id,
    coalesce(nullif(btrim(p.full_name), ''), '—'),
    case
      when public.has_permission('users.manage', p_organization_id) then p.email
      else null
    end
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.organization_id = p_organization_id
    -- الشرط الذي يجعل الدالة آمنة: غير العضو لا يحصل على صفّ واحد.
    and public.is_org_member(p_organization_id)
$$;

revoke all on function public.org_member_directory(uuid) from public, anon;
grant execute on function public.org_member_directory(uuid) to authenticated;
