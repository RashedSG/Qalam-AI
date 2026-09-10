-- =============================================================================
-- قلم | QALAM — Phase 2 (د): إعادة كتابة RLS بنموذج واعٍ بالمؤسسة والدور والنطاق
--
-- المبدأ الحاكم: توسيع لا استبدال.
--   كل سياسة = (المالك) OR (نطاق ممنوح بدور).
--   المالك يصل دائمًا إلى صفوفه، فسلوك التطبيق الحالي محفوظ حرفيًا،
--   وصف بلا organization_id لا يصل إليه إلا مالكه مهما كانت الأدوار.
--
-- عزل المؤسسات: can_access_row تتحقق من عضوية نشطة في مؤسسة الصف نفسها.
--   مستخدم في مؤسسة (أ) لا يملك أي مسار إلى صف في مؤسسة (ب).
--
-- الأداء: كل استدعاء داخل السياسات ملفوف بـ (select …) ليُحسب InitPlan مرة
--   واحدة لكل عبارة بدل مرة لكل صف.
-- =============================================================================

alter table public.org_units       enable row level security;
alter table public.permissions     enable row level security;
alter table public.roles           enable row level security;
alter table public.role_permissions enable row level security;
alter table public.memberships     enable row level security;
alter table public.membership_roles enable row level security;
alter table public.audit_log       enable row level security;


-- -----------------------------------------------------------------------------
-- organizations — العضو يقرأ مؤسسته. التعديل يتطلب organization.manage.
-- -----------------------------------------------------------------------------
drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member" on public.organizations
  for select to authenticated
  using ((select public.is_org_member(id)));

drop policy if exists "organizations_update_admin" on public.organizations;
create policy "organizations_update_admin" on public.organizations
  for update to authenticated
  using ((select public.has_permission('organization.manage', id)))
  with check ((select public.has_permission('organization.manage', id)));

-- لا سياسة INSERT ولا DELETE: إنشاء المؤسسات وحذفها عملية إدارية خارج التطبيق.


-- -----------------------------------------------------------------------------
-- org_units — يقرأها كل عضو (شجرة المؤسسة ليست سرًا داخلها).
--             تعديلها يتطلب organization.manage.
-- -----------------------------------------------------------------------------
drop policy if exists "org_units_select_member" on public.org_units;
create policy "org_units_select_member" on public.org_units
  for select to authenticated
  using ((select public.is_org_member(organization_id)));

drop policy if exists "org_units_write_admin" on public.org_units;
create policy "org_units_write_admin" on public.org_units
  for all to authenticated
  using ((select public.has_permission('organization.manage', organization_id)))
  with check ((select public.has_permission('organization.manage', organization_id)));


-- -----------------------------------------------------------------------------
-- permissions — فهرس مرجعي للقراءة فقط. لا كتابة لأي مستخدم.
-- -----------------------------------------------------------------------------
drop policy if exists "permissions_select_all" on public.permissions;
create policy "permissions_select_all" on public.permissions
  for select to authenticated using (true);

revoke insert, update, delete on public.permissions from authenticated;


-- -----------------------------------------------------------------------------
-- roles — أدوار النظام مقروءة للجميع، وأدوار المؤسسة لأعضائها.
--         إنشاء أدوار مخصصة يتطلب roles.manage. أدوار النظام غير قابلة للتعديل.
-- -----------------------------------------------------------------------------
drop policy if exists "roles_select" on public.roles;
create policy "roles_select" on public.roles
  for select to authenticated
  using (organization_id is null or (select public.is_org_member(organization_id)));

drop policy if exists "roles_insert_manager" on public.roles;
create policy "roles_insert_manager" on public.roles
  for insert to authenticated
  with check (
    is_system = false
    and organization_id is not null
    and (select public.has_permission('roles.manage', organization_id))
  );

drop policy if exists "roles_update_manager" on public.roles;
create policy "roles_update_manager" on public.roles
  for update to authenticated
  using (is_system = false and (select public.has_permission('roles.manage', organization_id)))
  with check (is_system = false and (select public.has_permission('roles.manage', organization_id)));

drop policy if exists "roles_delete_manager" on public.roles;
create policy "roles_delete_manager" on public.roles
  for delete to authenticated
  using (is_system = false and (select public.has_permission('roles.manage', organization_id)));


-- -----------------------------------------------------------------------------
-- role_permissions — تُقرأ مع دورها، وتُكتب فقط لأدوار المؤسسة غير النظامية.
--
-- ⚠️ منع تصعيد الامتياز: بلا شرط is_system = false يستطيع من يملك roles.manage
--    تعديل صلاحيات دور نظام، فيغيّر ما يملكه كل مستخدم في كل مؤسسة.
-- -----------------------------------------------------------------------------
drop policy if exists "role_permissions_select" on public.role_permissions;
create policy "role_permissions_select" on public.role_permissions
  for select to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_id
      and (r.organization_id is null or (select public.is_org_member(r.organization_id)))
  ));

drop policy if exists "role_permissions_write" on public.role_permissions;
create policy "role_permissions_write" on public.role_permissions
  for all to authenticated
  using (exists (
    select 1 from public.roles r
    where r.id = role_id
      and r.is_system = false
      and r.organization_id is not null
      and (select public.has_permission('roles.manage', r.organization_id))
  ))
  with check (exists (
    select 1 from public.roles r
    where r.id = role_id
      and r.is_system = false
      and r.organization_id is not null
      and (select public.has_permission('roles.manage', r.organization_id))
  ));


-- -----------------------------------------------------------------------------
-- memberships — المستخدم يرى عضويته دائمًا، ومن يملك users.manage يرى الكل
--               في مؤسسته ويديره.
-- -----------------------------------------------------------------------------
drop policy if exists "memberships_select" on public.memberships;
create policy "memberships_select" on public.memberships
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.has_permission('users.manage', organization_id))
  );

drop policy if exists "memberships_insert_manager" on public.memberships;
create policy "memberships_insert_manager" on public.memberships
  for insert to authenticated
  with check ((select public.has_permission('users.manage', organization_id)));

drop policy if exists "memberships_update_manager" on public.memberships;
create policy "memberships_update_manager" on public.memberships
  for update to authenticated
  using ((select public.has_permission('users.manage', organization_id)))
  with check ((select public.has_permission('users.manage', organization_id)));

drop policy if exists "memberships_delete_manager" on public.memberships;
create policy "memberships_delete_manager" on public.memberships
  for delete to authenticated
  using ((select public.has_permission('users.manage', organization_id)));


-- -----------------------------------------------------------------------------
-- membership_roles — إسناد الأدوار. يتطلب roles.manage في نفس المؤسسة.
--
-- ⚠️ لا يستطيع المستخدم منح نفسه دورًا: الشرط يفحص صلاحيته في مؤسسة العضوية
--    المستهدفة، ومنح الذات يتطلب roles.manage أصلًا.
-- -----------------------------------------------------------------------------
drop policy if exists "membership_roles_select" on public.membership_roles;
create policy "membership_roles_select" on public.membership_roles
  for select to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and (m.user_id = (select auth.uid())
           or (select public.has_permission('users.manage', m.organization_id)))
  ));

drop policy if exists "membership_roles_write" on public.membership_roles;
create policy "membership_roles_write" on public.membership_roles
  for all to authenticated
  using (exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and (select public.has_permission('roles.manage', m.organization_id))
  ))
  with check (exists (
    select 1 from public.memberships m
    where m.id = membership_id
      and (select public.has_permission('roles.manage', m.organization_id))
  ));


-- -----------------------------------------------------------------------------
-- audit_log — سجل إلحاقي (append-only).
--
-- القراءة تتطلب audit.view. الكتابة عبر record_audit وحدها.
-- لا سياسة UPDATE ولا DELETE، وتُسحب الصلاحيتان من الجدول أيضًا:
-- سياسة غائبة تمنع، لكن سحب الصلاحية يمنع قبل تقييم السياسة — دفاع في العمق.
-- -----------------------------------------------------------------------------
drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log
  for select to authenticated
  using ((select public.has_permission('audit.view', organization_id)));

revoke insert, update, delete on public.audit_log from authenticated;


-- =============================================================================
-- الجداول القائمة — إضافة مسار الدور فوق مسار الملكية
-- =============================================================================

-- -----------------------------------------------------------------------------
-- correspondences
-- -----------------------------------------------------------------------------
drop policy if exists "correspondences_select_own" on public.correspondences;
drop policy if exists "correspondences_select" on public.correspondences;
create policy "correspondences_select" on public.correspondences
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.can_access_owned_row('correspondence.view', organization_id, user_id))
  );

-- الإنشاء يبقى للنفس فقط: لا يُنشئ أحد مراسلة باسم غيره.
drop policy if exists "correspondences_insert_own" on public.correspondences;
create policy "correspondences_insert_own" on public.correspondences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "correspondences_update_own" on public.correspondences;
drop policy if exists "correspondences_update" on public.correspondences;
create policy "correspondences_update" on public.correspondences
  for update to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.can_access_owned_row('correspondence.edit', organization_id, user_id))
  )
  with check (
    user_id = (select auth.uid())
    or (select public.can_access_owned_row('correspondence.edit', organization_id, user_id))
  );

-- الحذف يبقى للمالك وحده. الأرشفة هي البديل المؤسسي، ولا حذف صلب لأحد.
drop policy if exists "correspondences_delete_own" on public.correspondences;
create policy "correspondences_delete_own" on public.correspondences
  for delete to authenticated
  using (user_id = (select auth.uid()));


-- -----------------------------------------------------------------------------
-- correspondence_versions — تتبع صلاحية المراسلة الأم
-- -----------------------------------------------------------------------------
drop policy if exists "correspondence_versions_select_own" on public.correspondence_versions;
drop policy if exists "correspondence_versions_select" on public.correspondence_versions;
create policy "correspondence_versions_select" on public.correspondence_versions
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.correspondences c
      where c.id = correspondence_id
        and (select public.can_access_owned_row('correspondence.view', c.organization_id, c.user_id))
    )
  );


-- -----------------------------------------------------------------------------
-- drafts — المسودة عمل شخصي غير منشور. تبقى للمالك وحده حتى في المؤسسة.
-- -----------------------------------------------------------------------------
-- (سياسات 0002 كما هي — لا تغيير مقصود)


-- -----------------------------------------------------------------------------
-- templates — قوالب النظام + قوالب المستخدم + قوالب المؤسسة المنشورة
-- -----------------------------------------------------------------------------
drop policy if exists "templates_select" on public.templates;
create policy "templates_select" on public.templates
  for select to authenticated
  using (
    is_system = true
    or user_id = (select auth.uid())
    or (organization_id is not null
        and (select public.has_permission('templates.manage', organization_id)))
  );


-- =============================================================================
-- منع الوصول المجهول (تكرار مقصود لقاعدة 0002)
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on public.app_settings   from public, anon, authenticated;
revoke all on public.signup_invites from public, anon, authenticated;
revoke insert, update, delete on public.audit_log  from authenticated;
revoke insert, update, delete on public.permissions from authenticated;
