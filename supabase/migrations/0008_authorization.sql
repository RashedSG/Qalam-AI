-- =============================================================================
-- قلم | QALAM — Phase 2 (ب): دوال التفويض
--
-- هذه هي الطبقة التي تعتمد عليها كل سياسات RLS في 0009.
-- كل دالة هنا:
--   • security definer — لتقرأ جداول العضوية دون أن تُستدعى سياساتها فتتكرر لا نهائيًا
--   • stable — ليُقيّمها المخطِّط مرة واحدة لكل عبارة لا مرة لكل صف
--   • تعمل على auth.uid() ولا تقبل معرّف مستخدم من العميل
--
-- ⚠️ الاستدعاء داخل السياسات يجب أن يكون بصيغة (select fn(...)) — تجعل PostgreSQL
--    يحسبها InitPlan مرة واحدة بدل مرة لكل صف. الفرق بين مسح جدول ومسح كارثي.
-- =============================================================================


/** ترتيب النطاقات من الأضيق إلى الأوسع — يُستخدم لاختيار الأوسع عند تعدد الأدوار. */
create or replace function public.scope_rank(p_scope text)
returns integer
language sql
immutable
as $$
  select case p_scope
    when 'own' then 1
    when 'unit' then 2
    when 'descendants' then 3
    when 'organization' then 4
    else 0
  end
$$;


/**
 * العضوية النشطة للمستخدم الحالي في مؤسسة.
 * العضوية غير النشطة (invited / inactive) لا تمنح شيئًا — إيقاف مستخدم يُنهي وصوله فورًا.
 */
create or replace function public.my_membership(p_organization_id uuid)
returns public.memberships
language sql
stable
security definer
set search_path = public
as $$
  select m.*
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid()
    and m.organization_id = p_organization_id
    and m.status = 'active'
    and o.status = 'active'
  limit 1
$$;


/** هل المستخدم الحالي عضو نشط في هذه المؤسسة؟ */
create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_organization_id is not null
     and exists (
       select 1
       from public.memberships m
       join public.organizations o on o.id = m.organization_id
       where m.user_id = auth.uid()
         and m.organization_id = p_organization_id
         and m.status = 'active'
         and o.status = 'active'
     )
$$;


/**
 * أوسع نطاق يملكه المستخدم لهذه الصلاحية في هذه المؤسسة، أو null إن لم يملكها.
 * تعدد الأدوار يجمع لا يتعارض: من كان موظفًا ومديرًا معًا يأخذ الأوسع.
 */
create or replace function public.permission_scope(p_permission text, p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rp.scope
  from public.memberships m
  join public.organizations o    on o.id = m.organization_id
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.user_id = auth.uid()
    and m.organization_id = p_organization_id
    and m.status = 'active'
    and o.status = 'active'
    and rp.permission_key = p_permission
  order by public.scope_rank(rp.scope) desc
  limit 1
$$;


/** هل يملك المستخدم هذه الصلاحية بأي نطاق؟ */
create or replace function public.has_permission(p_permission text, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.permission_scope(p_permission, p_organization_id) is not null
$$;


/**
 * القرار المركزي: هل يصل المستخدم الحالي إلى صف يملكه p_owner_id ويقع في p_owner_unit؟
 *
 * ترتيب الفحص مقصود — المالك أولًا:
 *   • المالك يصل دائمًا إلى صفوفه. هذا يحفظ سلوك التطبيق الحالي كما هو،
 *     ويجعل إضافة RBAC توسيعًا لا استبدالًا.
 *   • ثم النطاق الممنوح بالدور: المؤسسة، أو الوحدة وما تحتها، أو الوحدة، أو الملكية.
 *
 * صف بلا مؤسسة (organization_id = null) لا يصل إليه إلا مالكه — البيانات
 * غير المرحّلة تبقى خاصة بأصحابها مهما كانت الأدوار.
 */
create or replace function public.can_access_row(
  p_permission     text,
  p_organization_id uuid,
  p_owner_id       uuid,
  p_owner_unit_id  uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  scope      text;
  my_unit    uuid;
  my_path    text;
  owner_path text;
begin
  if uid is null then return false; end if;
  if p_owner_id = uid then return true; end if;
  if p_organization_id is null then return false; end if;

  scope := public.permission_scope(p_permission, p_organization_id);
  if scope is null then return false; end if;
  if scope = 'organization' then return true; end if;
  if scope = 'own' then return false; end if;  -- المالك عولج أعلاه

  select org_unit_id into my_unit from public.my_membership(p_organization_id);
  if my_unit is null or p_owner_unit_id is null then return false; end if;

  if scope = 'unit' then
    return my_unit = p_owner_unit_id;
  end if;

  -- descendants: الوحدة نفسها وكل ما تحتها، عبر مقارنة بادئة المسار.
  select path into my_path    from public.org_units where id = my_unit;
  select path into owner_path from public.org_units where id = p_owner_unit_id;
  if my_path is null or owner_path is null then return false; end if;

  return owner_path = my_path or owner_path like my_path || '/%';
end;
$$;


/**
 * وحدة مالك الصف — تُشتق من عضويته، فلا نُكرّر org_unit_id في كل جدول محتوى.
 * تكرارها يعني تحديث كل الصفوف عند نقل موظف بين الوحدات.
 */
create or replace function public.owner_unit(p_organization_id uuid, p_owner_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_unit_id
  from public.memberships
  where organization_id = p_organization_id and user_id = p_owner_id
  limit 1
$$;


/** اختصار للسياسات: يجمع اشتقاق وحدة المالك مع قرار الوصول. */
create or replace function public.can_access_owned_row(
  p_permission      text,
  p_organization_id uuid,
  p_owner_id        uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_access_row(
    p_permission,
    p_organization_id,
    p_owner_id,
    public.owner_unit(p_organization_id, p_owner_id)
  )
$$;


-- =============================================================================
-- سجل التدقيق — الكتابة عبر دالة واحدة فقط
-- =============================================================================

/**
 * يكتب حدثًا في سجل التدقيق.
 *
 * الفاعل دائمًا auth.uid() ولا يُقبل من الوسائط — فلا ينتحل مستخدم فعل غيره.
 * `metadata` تُقصّ إلى حجم معقول، والسجل لا يقبل تعديلًا ولا حذفًا لاحقًا.
 */
create or replace function public.record_audit(
  p_action          text,
  p_entity_type     text,
  p_entity_id       uuid    default null,
  p_organization_id uuid    default null,
  p_previous_status text    default null,
  p_new_status      text    default null,
  p_metadata        jsonb   default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  new_id bigint;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_action is null or length(p_action) = 0 or length(p_action) > 64 then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  if p_entity_type is null or length(p_entity_type) > 64 then
    raise exception 'invalid entity type' using errcode = '22023';
  end if;

  insert into public.audit_log (
    organization_id, actor_id, action, entity_type, entity_id,
    previous_status, new_status, metadata
  )
  values (
    p_organization_id, uid, p_action, p_entity_type, p_entity_id,
    left(p_previous_status, 40), left(p_new_status, 40),
    case when pg_column_size(p_metadata) > 4000 then '{"truncated":true}'::jsonb else coalesce(p_metadata, '{}'::jsonb) end
  )
  returning id into new_id;

  return new_id;
end;
$$;


-- =============================================================================
-- الصلاحيات على الدوال
-- =============================================================================
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.my_membership(uuid)',
    'public.is_org_member(uuid)',
    'public.permission_scope(text, uuid)',
    'public.has_permission(text, uuid)',
    'public.can_access_row(text, uuid, uuid, uuid)',
    'public.owner_unit(uuid, uuid)',
    'public.can_access_owned_row(text, uuid, uuid)',
    'public.record_audit(text, text, uuid, uuid, text, text, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;
