-- =============================================================================
-- قلم | QALAM — Phase 3 (هـ): RLS للمراسلة المؤسسية
--
-- ما يتغيّر عن 0010:
--   • سياسات المراسلات تستخدم الوحدة المالكة الصريحة والتصنيف الأمني.
--   • الإحالة تصبح مسار وصول رابعًا: من أُحيلت إليه مراسلة يراها.
--
-- ترتيب مسارات الوصول في كل سياسة قراءة:
--   ١) المالك        ٢) المُحال إليه        ٣) النطاق الممنوح بدور
-- المالك أولًا فيبقى سلوك التطبيق الشخصي محفوظًا كما هو.
-- =============================================================================

alter table public.classification_levels      enable row level security;
alter table public.reference_number_policies   enable row level security;
alter table public.reference_number_counters   enable row level security;
alter table public.correspondence_links        enable row level security;
alter table public.referral_instructions       enable row level security;
alter table public.referrals                   enable row level security;
alter table public.notifications               enable row level security;


-- -----------------------------------------------------------------------------
-- بيانات مرجعية للمؤسسة — يقرأها أعضاؤها، ويعدّلها من يملك organization.manage
-- -----------------------------------------------------------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array['classification_levels', 'referral_instructions', 'reference_number_policies'] loop
    execute format('drop policy if exists "%1$s_select" on public.%1$s;', tbl);
    execute format($p$
      create policy "%1$s_select" on public.%1$s
        for select to authenticated
        using ((select public.is_org_member(organization_id)));
    $p$, tbl);

    execute format('drop policy if exists "%1$s_write" on public.%1$s;', tbl);
    execute format($p$
      create policy "%1$s_write" on public.%1$s
        for all to authenticated
        using ((select public.has_permission('organization.manage', organization_id)))
        with check ((select public.has_permission('organization.manage', organization_id)));
    $p$, tbl);
  end loop;
end $$;

-- العدّادات حالة داخلية للمولّد. لا يقرأها ولا يكتبها أحد من المتصفح:
-- قراءتها تكشف حجم المراسلات، وكتابتها تُنتج أرقامًا مكرّرة.
revoke all on public.reference_number_counters from public, anon, authenticated;


-- -----------------------------------------------------------------------------
-- كسر الحلقة بين السياسات
--
-- سياسة المراسلات تحتاج «هل أُحيلت إليّ؟»، وسياسة الإحالات تحتاج «هل أرى
-- المراسلة؟». استعلام كل منهما عن جدول الآخر مباشرةً يُنتج تكرارًا لا نهائيًا
-- ترفضه PostgreSQL صراحةً (infinite recursion detected in policy).
--
-- الحل: دالتان security definer تقرآن الجدولين متجاوزتين RLS، فتُقيَّم كل
-- سياسة دون أن تستدعي الأخرى. الدالتان لا تكشفان صفًا — تعيدان قرارًا منطقيًا.
-- -----------------------------------------------------------------------------

/** هل أُحيلت هذه المراسلة إليّ شخصيًا أو إلى وحدتي؟ */
create or replace function public.is_referred_to_me(p_correspondence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.referrals r
    left join public.memberships m
      on m.organization_id = r.organization_id
     and m.user_id = auth.uid()
     and m.status = 'active'
    where r.correspondence_id = p_correspondence_id
      and (r.to_user_id = auth.uid()
           or (r.to_unit_id is not null and r.to_unit_id = m.org_unit_id))
  )
$$;

/** هل أستطيع الاطّلاع على هذه المراسلة؟ نفس منطق سياستها، بلا استدعائها. */
create or replace function public.can_view_correspondence(p_correspondence_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  row_data record;
begin
  select organization_id, user_id, owner_unit_id, classification_key
    into row_data
  from public.correspondences where id = p_correspondence_id;

  if row_data is null then return false; end if;
  if row_data.user_id = auth.uid() then return true; end if;
  if public.is_referred_to_me(p_correspondence_id) then return true; end if;

  return public.can_access_correspondence(
    'correspondence.view', row_data.organization_id, row_data.user_id,
    row_data.owner_unit_id, row_data.classification_key
  );
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.is_referred_to_me(uuid)',
    'public.can_view_correspondence(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;


-- -----------------------------------------------------------------------------
-- correspondences — تُعاد كتابة سياسات القراءة والتعديل
-- -----------------------------------------------------------------------------
drop policy if exists "correspondences_select" on public.correspondences;
create policy "correspondences_select" on public.correspondences
  for select to authenticated
  using (
    user_id = (select auth.uid())
    -- مسار الإحالة: من أُحيلت إليه يراها، ولو لم يملك نطاقًا يغطيها.
    or (select public.is_referred_to_me(id))
    or (select public.can_access_correspondence(
          'correspondence.view', organization_id, user_id, owner_unit_id, classification_key))
  );

drop policy if exists "correspondences_update" on public.correspondences;
create policy "correspondences_update" on public.correspondences
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.can_access_correspondence(
          'correspondence.edit', organization_id, user_id, owner_unit_id, classification_key))
  )
  with check (
    user_id = (select auth.uid())
    or (select public.can_access_correspondence(
          'correspondence.edit', organization_id, user_id, owner_unit_id, classification_key))
  );

-- الإنشاء والحذف كما هما: للمالك وحده. (سياسات 0010 تبقى سارية.)

-- إصدار الرقم يمر بدالة، لا بتحديث مباشر للعمود: الدالة تفرض الصلاحية
-- وتضمن الذرّية وتكتب في سجل التدقيق.
create or replace function public.guard_reference_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- الدالة المعتمدة ترفع راية محلية بالمعاملة قبل تحديثها، فيسمح الحارس لها
  -- وحدها. الراية تسقط بنهاية المعاملة تلقائيًا فلا تتسرّب إلى طلب آخر.
  if coalesce(current_setting('qalam.issuing_reference', true), '') = 'on' then
    return new;
  end if;
  -- auth.uid() يكون null في الهجرات والعمليات الإدارية — لا نقيّدها.
  if auth.uid() is null then return new; end if;
  if new.reference_number is distinct from old.reference_number then
    raise exception 'reference numbers are issued by issue_reference_number()' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_reference_number_trg on public.correspondences;
create trigger guard_reference_number_trg
  before update of reference_number on public.correspondences
  for each row execute function public.guard_reference_number();


-- -----------------------------------------------------------------------------
-- correspondence_versions — تتبع صلاحية المراسلة الأم (مع التصنيف)
-- -----------------------------------------------------------------------------
drop policy if exists "correspondence_versions_select" on public.correspondence_versions;
create policy "correspondence_versions_select" on public.correspondence_versions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.can_view_correspondence(correspondence_id))
  );


-- -----------------------------------------------------------------------------
-- correspondence_links — تُقرأ إن كان الطرفان مرئيين، وتُكتب لمن يعدّل المصدر
-- -----------------------------------------------------------------------------
drop policy if exists "correspondence_links_select" on public.correspondence_links;
create policy "correspondence_links_select" on public.correspondence_links
  for select to authenticated
  using (
    -- الرابط يكشف وجود المراسلة الأخرى؛ فلا يُرى إلا إن كان الطرفان مرئيين.
    exists (select 1 from public.correspondences c where c.id = from_id)
    and exists (select 1 from public.correspondences c where c.id = to_id)
  );

drop policy if exists "correspondence_links_write" on public.correspondence_links;
create policy "correspondence_links_write" on public.correspondence_links
  for all to authenticated
  using (exists (
    select 1 from public.correspondences c
    where c.id = from_id
      and (c.user_id = (select auth.uid())
           or (select public.can_access_correspondence(
                 'correspondence.edit', c.organization_id, c.user_id, c.owner_unit_id, c.classification_key)))
  ))
  with check (
    created_by = (select auth.uid())
    and exists (
      select 1 from public.correspondences c
      where c.id = from_id
        and (c.user_id = (select auth.uid())
             or (select public.can_access_correspondence(
                   'correspondence.edit', c.organization_id, c.user_id, c.owner_unit_id, c.classification_key)))
    )
    -- لا يُربط بمراسلة لا يراها المستخدم: الربط نفسه يكشف وجودها.
    and exists (select 1 from public.correspondences c where c.id = to_id)
  );


-- -----------------------------------------------------------------------------
-- referrals
--
-- الإنشاء والرد يمران بدالتين فقط — لا INSERT ولا UPDATE مباشر: الدالتان
-- تفرضان أن المُحال إليه عضو نشط في المؤسسة نفسها وأن التعليمة معرّفة، وتكتبان
-- في سجل التدقيق. سياسة RLS وحدها لا تستطيع فرض ذلك.
-- -----------------------------------------------------------------------------
drop policy if exists "referrals_select" on public.referrals;
create policy "referrals_select" on public.referrals
  for select to authenticated
  using (
    from_user_id = (select auth.uid())
    or (select public.is_referral_target(id))
    or (select public.can_view_correspondence(correspondence_id))
  );

revoke insert, update, delete on public.referrals from authenticated;


-- -----------------------------------------------------------------------------
-- attachments — إعادة كتابة السياسات لتعمل مع INSERT … RETURNING
--
-- ⚠️ خلل حقيقي في 0014: السياسة كانت تستدعي can_access_attachment(id) التي
--    تبحث عن الصف بمعرّفه. الدالة STABLE فتستخدم لقطة ما قبل العبارة، ولا ترى
--    الصف الذي تُدرجه العبارة نفسها — فيفشل كل INSERT … RETURNING، وهو ما
--    يُصدره عميل Supabase عند كل ‎.insert().select()‎.
--
--    الإصلاح: تمرير أعمدة الصف إلى الدالة بدل البحث عنه. المراسلة الأم موجودة
--    مسبقًا فتراها اللقطة، والصف الجديد لم يعد يحتاج قراءة.
-- -----------------------------------------------------------------------------

/** قرار الوصول لمرفق من أعمدته — لا يقرأ جدول المرفقات إطلاقًا. */
create or replace function public.can_access_attachment_row(
  p_permission        text,
  p_correspondence_id uuid,
  p_classification    text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_correspondence(
    p_permission, c.organization_id, c.user_id, c.owner_unit_id,
    -- تصنيف المرفق يتجاوز تصنيف مراسلته عند التشدد.
    coalesce(p_classification, c.classification_key)
  )
  from public.correspondences c
  where c.id = p_correspondence_id
$$;

revoke all on function public.can_access_attachment_row(text, uuid, text) from public, anon;
grant execute on function public.can_access_attachment_row(text, uuid, text) to authenticated;

drop policy if exists "attachments_select" on public.attachments;
create policy "attachments_select" on public.attachments
  for select to authenticated
  using (
    uploaded_by = (select auth.uid())
    or (select public.can_access_attachment_row('attachment.view', correspondence_id, classification_key))
  );

drop policy if exists "attachments_insert" on public.attachments;
create policy "attachments_insert" on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and (select public.can_access_attachment_row('attachment.upload', correspondence_id, classification_key))
  );

drop policy if exists "attachments_delete" on public.attachments;
create policy "attachments_delete" on public.attachments
  for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    or (select public.can_access_attachment_row('attachment.upload', correspondence_id, classification_key))
  );


-- -----------------------------------------------------------------------------
-- notifications — خاصة بصاحبها وحده، ولا تُنشأ إلا بمُشغّل
-- -----------------------------------------------------------------------------
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- لا INSERT: الإشعارات نتيجة أحداث لا مُدخلات. لا UPDATE: القراءة تمر بدالة
-- تقصر التحديث على صفوف المستخدم نفسه.
revoke insert, update on public.notifications from authenticated;


-- =============================================================================
-- منع الوصول المجهول (تكرار مقصود)
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on public.app_settings              from public, anon, authenticated;
revoke all on public.signup_invites            from public, anon, authenticated;
revoke all on public.reference_number_counters from public, anon, authenticated;
revoke insert, update, delete on public.audit_log   from authenticated;
revoke insert, update, delete on public.permissions from authenticated;
revoke insert, update, delete on public.referrals   from authenticated;
revoke insert, update on public.notifications       from authenticated;
revoke update on public.attachments                 from authenticated;
