-- =============================================================================
-- قلم | QALAM — Phase 2 (هـ): تدقيق تلقائي للتغييرات الحاكمة
--
-- لماذا مُشغّلات لا استدعاءات من التطبيق؟ لأن التطبيق قد يُنسى أو يُتجاوز.
-- المُشغّل يسجّل أي تغيير يصل الجدول مهما كان مصدره — التطبيق، SQL Editor،
-- أو سكربت إداري.
--
-- ⚠️ ملاحظة صريحة على حدود RBAC: من يملك roles.manage يستطيع منح نفسه دورًا
--    أوسع. هذا متأصل في أي نموذج أدوار ولا تمنعه السياسات — من يدير الأدوار
--    يملك الأدوار. الحل ليس ادّعاء منعه بل جعله غير قابل للإنكار: كل إسناد
--    دور يُسجَّل هنا في سجل لا يقبل تعديلًا ولا حذفًا.
--    فصل المهام (creator ≠ approver) سياسة اختيارية في المرحلة ٤.
--
-- ⚠️ خصوصية: لا يُسجَّل أي نص مراسلة. metadata معرّفات ومفاتيح فقط.
-- =============================================================================

/** الفاعل من الجلسة — قد يكون null في الهجرات والعمليات الإدارية. */
create or replace function public.audit_actor()
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select auth.uid() $$;


-- -----------------------------------------------------------------------------
-- إسناد الأدوار وسحبها
-- -----------------------------------------------------------------------------
create or replace function public.audit_membership_roles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data   record := coalesce(new, old);
  org_id     uuid;
  target_user uuid;
  role_key   text;
  actor      uuid := public.audit_actor();
begin
  select organization_id, user_id into org_id, target_user
  from public.memberships where id = row_data.membership_id;
  select key into role_key from public.roles where id = row_data.role_id;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id, new_status, metadata
  ) values (
    org_id, actor,
    case when tg_op = 'INSERT' then 'role.granted' else 'role.revoked' end,
    'membership', row_data.membership_id,
    role_key,
    jsonb_build_object(
      'role_key', role_key,
      'target_user_id', target_user,
      -- يُبرز منح الذات صراحةً: أهم سطر يبحث عنه المدقق.
      'self_grant', (actor is not null and actor = target_user)
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_membership_roles_trg on public.membership_roles;
create trigger audit_membership_roles_trg
  after insert or delete on public.membership_roles
  for each row execute function public.audit_membership_roles();


-- -----------------------------------------------------------------------------
-- العضويات: إنشاء، تعطيل، نقل بين الوحدات
-- -----------------------------------------------------------------------------
create or replace function public.audit_memberships()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data record := coalesce(new, old);
  action   text;
begin
  if tg_op = 'INSERT' then
    action := 'membership.created';
  elsif tg_op = 'DELETE' then
    action := 'membership.removed';
  elsif new.status is distinct from old.status then
    action := 'membership.status_changed';
  elsif new.org_unit_id is distinct from old.org_unit_id then
    action := 'membership.unit_changed';
  else
    return null;  -- تغيير غير حاكم (مسمى وظيفي مثلًا) لا يستحق صفًا في السجل
  end if;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id,
    previous_status, new_status, metadata
  ) values (
    row_data.organization_id, public.audit_actor(), action, 'membership', row_data.id,
    case when tg_op = 'UPDATE' then old.status end,
    case when tg_op <> 'DELETE' then new.status end,
    jsonb_build_object(
      'target_user_id', row_data.user_id,
      'org_unit_id', case when tg_op <> 'DELETE' then new.org_unit_id else old.org_unit_id end,
      'previous_org_unit_id', case when tg_op = 'UPDATE' then old.org_unit_id end
    )
  );
  return null;
end;
$$;

drop trigger if exists audit_memberships_trg on public.memberships;
create trigger audit_memberships_trg
  after insert or update or delete on public.memberships
  for each row execute function public.audit_memberships();


-- -----------------------------------------------------------------------------
-- صلاحيات الأدوار — تغيير ما يملكه دور أخطر من إسناد الدور نفسه
-- -----------------------------------------------------------------------------
create or replace function public.audit_role_permissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data record := coalesce(new, old);
  org_id   uuid;
  role_key text;
begin
  select organization_id, key into org_id, role_key from public.roles where id = row_data.role_id;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id,
    previous_status, new_status, metadata
  ) values (
    org_id, public.audit_actor(),
    case tg_op when 'INSERT' then 'permission.granted'
               when 'UPDATE' then 'permission.scope_changed'
               else 'permission.revoked' end,
    'role', row_data.role_id,
    case when tg_op = 'UPDATE' then old.scope end,
    case when tg_op <> 'DELETE' then new.scope end,
    jsonb_build_object('role_key', role_key, 'permission_key', row_data.permission_key)
  );
  return null;
end;
$$;

drop trigger if exists audit_role_permissions_trg on public.role_permissions;
create trigger audit_role_permissions_trg
  after insert or update or delete on public.role_permissions
  for each row execute function public.audit_role_permissions();


-- -----------------------------------------------------------------------------
-- إعدادات المؤسسة وهيكلها
-- -----------------------------------------------------------------------------
create or replace function public.audit_organizations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id, previous_status, new_status, metadata
  ) values (
    new.id, public.audit_actor(), 'organization.updated', 'organization', new.id,
    old.status, new.status,
    -- أسماء الحقول المتغيّرة فقط، لا قيمها: القيم قد تحمل بيانات مؤسسية.
    jsonb_build_object('changed', (
      select coalesce(jsonb_agg(field), '[]'::jsonb) from (
        select 'name'     as field where new.name     is distinct from old.name
        union all select 'name_en'  where new.name_en  is distinct from old.name_en
        union all select 'code'     where new.code     is distinct from old.code
        union all select 'status'   where new.status   is distinct from old.status
        union all select 'settings' where new.settings is distinct from old.settings
        union all select 'branding' where new.branding is distinct from old.branding
      ) changes
    ))
  );
  return null;
end;
$$;

drop trigger if exists audit_organizations_trg on public.organizations;
create trigger audit_organizations_trg
  after update on public.organizations
  for each row execute function public.audit_organizations();

create or replace function public.audit_org_units()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_data record := coalesce(new, old);
begin
  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    row_data.organization_id, public.audit_actor(),
    case tg_op when 'INSERT' then 'org_unit.created'
               when 'UPDATE' then 'org_unit.updated'
               else 'org_unit.deleted' end,
    'org_unit', row_data.id,
    jsonb_build_object('code', row_data.code, 'kind', row_data.kind,
                       'parent_id', case when tg_op <> 'DELETE' then new.parent_id else old.parent_id end)
  );
  return null;
end;
$$;

drop trigger if exists audit_org_units_trg on public.org_units;
create trigger audit_org_units_trg
  after insert or update or delete on public.org_units
  for each row execute function public.audit_org_units();


-- =============================================================================
-- سجل التدقيق لا يقبل تعديلًا ولا حذفًا — حتى من مالك الجدول عبر التطبيق
-- =============================================================================
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only' using errcode = '42501';
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each statement execute function public.audit_log_immutable();
