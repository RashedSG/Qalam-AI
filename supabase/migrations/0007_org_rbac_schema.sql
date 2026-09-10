-- =============================================================================
-- قلم | QALAM — Phase 2 (أ): المؤسسات، الهيكل، الأدوار، الصلاحيات، التدقيق
--
-- هذه الهجرة تُنشئ البنية فقط. لا تنقل بيانات (0008) ولا تغيّر RLS (0009).
-- الفصل مقصود: كل ملف قابل للمراجعة والتراجع وحده.
--
-- إضافية بالكامل: لا حذف عمود ولا جدول ولا تضييق قيد قائم.
-- =============================================================================


-- =============================================================================
-- 1) organizations — تفعيل الجدول الموجود
-- =============================================================================
alter table public.organizations add column if not exists name_en   text not null default '';
alter table public.organizations add column if not exists code      text;
alter table public.organizations add column if not exists status    text not null default 'active';
alter table public.organizations add column if not exists settings  jsonb not null default '{}'::jsonb;
alter table public.organizations add column if not exists branding  jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.organizations add constraint organizations_status_check
    check (status in ('active', 'suspended', 'archived'));
exception when duplicate_object then null; end $$;

create unique index if not exists organizations_code_idx
  on public.organizations (lower(code)) where code is not null;


-- =============================================================================
-- 2) org_units — وحدة تنظيمية عامة (Organizational Unit)
--
-- نموذج واحد بدل جداول لكل مستوى: لا كل مؤسسة تستخدم قطاعًا ثم إدارة ثم قسمًا
-- ثم وحدة. `kind` وصف لا بنية، والعمق الفعلي يحدده `parent_id`.
--
-- `path` مسار مادي يُصان بمُشغّل، ليصبح نطاق «descendants» فحصَ بادئة مفهرسًا
-- بدل استعلام تكراري لكل صف داخل سياسة RLS.
-- =============================================================================
create table if not exists public.org_units (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  parent_id       uuid references public.org_units (id) on delete restrict,
  code            text,
  name_ar         text not null,
  name_en         text not null default '',
  kind            text not null default 'department',
  path            text not null default '',
  depth           integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint org_units_kind_check
    check (kind in ('organization', 'sector', 'department', 'section', 'unit'))
);

create index if not exists org_units_org_idx    on public.org_units (organization_id);
create index if not exists org_units_parent_idx on public.org_units (parent_id);
-- text_pattern_ops يجعل `path like '/a/b/%'` قابلًا لاستخدام الفهرس.
create index if not exists org_units_path_idx   on public.org_units (path text_pattern_ops);
create unique index if not exists org_units_code_idx
  on public.org_units (organization_id, lower(code)) where code is not null;

/**
 * يصون path و depth، ويمنع الحلقات ويمنع تجاوز الحدود بين المؤسسات.
 * تحديث الأب يُعيد بناء مسارات كل الأحفاد.
 */
create or replace function public.org_units_maintain_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_path  text := '';
  parent_depth integer := -1;
  parent_org   uuid;
begin
  if new.parent_id is not null then
    select path, depth, organization_id into parent_path, parent_depth, parent_org
    from public.org_units where id = new.parent_id;

    if parent_org is null then
      raise exception 'parent org unit not found' using errcode = '23503';
    end if;
    if parent_org <> new.organization_id then
      raise exception 'org unit parent must belong to the same organization' using errcode = '23514';
    end if;
    -- منع الحلقة: لا يكون الأب أحد أحفاد العقدة نفسها.
    if tg_op = 'UPDATE' and parent_path like new.path || '%' then
      raise exception 'org unit cannot be its own ancestor' using errcode = '23514';
    end if;
  end if;

  new.path  := parent_path || '/' || new.id::text;
  new.depth := parent_depth + 1;
  return new;
end;
$$;

drop trigger if exists org_units_path_before on public.org_units;
create trigger org_units_path_before
  before insert or update of parent_id on public.org_units
  for each row execute function public.org_units_maintain_path();

/** إعادة بناء مسارات الأحفاد بعد نقل عقدة. */
create or replace function public.org_units_cascade_path()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.path is distinct from old.path then
    update public.org_units child
       set path  = new.path || substring(child.path from length(old.path) + 1),
           depth = new.depth + (child.depth - old.depth)
     where child.path like old.path || '/%';
  end if;
  return null;
end;
$$;

drop trigger if exists org_units_path_after on public.org_units;
create trigger org_units_path_after
  after update of parent_id on public.org_units
  for each row execute function public.org_units_cascade_path();


-- =============================================================================
-- 3) permissions — فهرس الصلاحيات (بيانات مرجعية للنظام)
-- =============================================================================
create table if not exists public.permissions (
  key        text primary key,
  category   text not null,
  name_ar    text not null,
  name_en    text not null default '',
  created_at timestamptz not null default now()
);

insert into public.permissions (key, category, name_ar, name_en) values
  ('correspondence.create',   'correspondence', 'إنشاء مراسلة',        'Create correspondence'),
  ('correspondence.view',     'correspondence', 'الاطلاع على مراسلة',  'View correspondence'),
  ('correspondence.edit',     'correspondence', 'تعديل مراسلة',        'Edit correspondence'),
  ('correspondence.refer',    'correspondence', 'إحالة مراسلة',        'Refer correspondence'),
  ('correspondence.review',   'correspondence', 'مراجعة مراسلة',       'Review correspondence'),
  ('correspondence.return',   'correspondence', 'إعادة مراسلة',        'Return correspondence'),
  ('correspondence.approve',  'correspondence', 'اعتماد مراسلة',       'Approve correspondence'),
  ('correspondence.reject',   'correspondence', 'رفض مراسلة',          'Reject correspondence'),
  ('correspondence.sign',     'correspondence', 'توقيع مراسلة',        'Sign correspondence'),
  ('correspondence.issue',    'correspondence', 'إصدار مراسلة',        'Issue correspondence'),
  ('correspondence.archive',  'correspondence', 'أرشفة مراسلة',        'Archive correspondence'),
  ('correspondence.download', 'correspondence', 'تنزيل مراسلة',        'Download correspondence'),
  ('correspondence.print',    'correspondence', 'طباعة مراسلة',        'Print correspondence'),
  ('attachment.view',         'attachment',     'الاطلاع على المرفقات', 'View attachments'),
  ('attachment.upload',       'attachment',     'رفع مرفق',            'Upload attachment'),
  ('attachment.download',     'attachment',     'تنزيل مرفق',          'Download attachment'),
  ('audit.view',              'governance',     'الاطلاع على سجل التدقيق', 'View audit log'),
  ('users.manage',            'governance',     'إدارة المستخدمين',    'Manage users'),
  ('roles.manage',            'governance',     'إدارة الأدوار',       'Manage roles'),
  ('templates.manage',        'governance',     'إدارة القوالب المؤسسية', 'Manage templates'),
  ('organization.manage',     'governance',     'إدارة المؤسسة',       'Manage organization'),
  ('ai.use',                  'ai',             'استخدام الذكاء الاصطناعي', 'Use AI')
on conflict (key) do update
  set category = excluded.category,
      name_ar  = excluded.name_ar,
      name_en  = excluded.name_en;


-- =============================================================================
-- 4) roles — أدوار النظام (organization_id = null) أو أدوار خاصة بمؤسسة
-- =============================================================================
create table if not exists public.roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  key             text not null,
  name_ar         text not null,
  name_en         text not null default '',
  description_ar  text not null default '',
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint roles_owner_check check (is_system = true or organization_id is not null)
);

create unique index if not exists roles_system_key_idx
  on public.roles (key) where organization_id is null;
create unique index if not exists roles_org_key_idx
  on public.roles (organization_id, key) where organization_id is not null;

create table if not exists public.role_permissions (
  role_id        uuid not null references public.roles (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  -- نطاق الصلاحية: صفوفه فقط، أو وحدته، أو وحدته وما تحتها، أو المؤسسة كاملة.
  scope          text not null default 'own',
  primary key (role_id, permission_key),
  constraint role_permissions_scope_check
    check (scope in ('own', 'unit', 'descendants', 'organization'))
);


-- =============================================================================
-- 5) memberships — عضوية مستخدم في مؤسسة، ووحدته التنظيمية
-- =============================================================================
create table if not exists public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  org_unit_id     uuid references public.org_units (id) on delete set null,
  status          text not null default 'active',
  job_title       text not null default '',
  invited_by      uuid references auth.users (id) on delete set null,
  joined_at       timestamptz not null default now(),
  deactivated_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint memberships_status_check check (status in ('invited', 'active', 'inactive')),
  constraint memberships_unique unique (organization_id, user_id)
);

create index if not exists memberships_user_idx on public.memberships (user_id, status);
create index if not exists memberships_unit_idx on public.memberships (org_unit_id);

create table if not exists public.membership_roles (
  membership_id uuid not null references public.memberships (id) on delete cascade,
  role_id       uuid not null references public.roles (id) on delete cascade,
  granted_by    uuid references auth.users (id) on delete set null,
  granted_at    timestamptz not null default now(),
  primary key (membership_id, role_id)
);


-- =============================================================================
-- 6) audit_log — سجل غير قابل للتعديل
--
-- ⚠️ خصوصية: لا يُخزَّن هنا نص مراسلة. `metadata` للحقول الآمنة فقط
--    (معرّفات، حالات، أسماء أعمدة) — لا محتوى.
--
-- ⚠️ لا مفاتيح أجنبية على organization_id و actor_id — عن قصد.
--    السجل يجب أن يبقى بعد ما يوثّقه: حذف مستخدم لا يمحو أثر ما فعله،
--    وحذف مؤسسة لا يمحو تاريخها.
--    وهناك سبب تقني قاطع أيضًا: أي إجراء متتالٍ (cascade أو set null) هو
--    DELETE أو UPDATE على هذا الجدول، ومُشغّل «الإلحاق فقط» يرفضهما — فيصبح
--    حذف أي مستخدم أو مؤسسة مستحيلًا. تحقّقت من ذلك عمليًا: مفتاح أجنبي هنا
--    يكسر delete_my_account().
-- =============================================================================
create table if not exists public.audit_log (
  id              bigint generated always as identity primary key,
  organization_id uuid,
  actor_id        uuid,
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  previous_status text,
  new_status      text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists audit_log_org_idx    on public.audit_log (organization_id, created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id, created_at desc);
create index if not exists audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);


-- =============================================================================
-- 7) بذر أدوار النظام وصلاحياتها
--
-- ⚠️ مبدأ حاكم: لا دور يُسنَد تلقائيًا في 0008 يمنح رؤية مراسلات مستخدم آخر.
--    الرؤية على مستوى المؤسسة محصورة في أدوار حوكمة لا تُسنَد لأحد افتراضيًا
--    (المدقق، مكتب المدير) ويجب منحها يدويًا.
-- =============================================================================
insert into public.roles (key, name_ar, name_en, description_ar, is_system) values
  ('system_admin',           'مدير النظام',        'System Admin',           'إدارة كاملة للنظام.', true),
  ('organization_admin',     'مدير المؤسسة',       'Organization Admin',     'إدارة المستخدمين والأدوار والهيكل — لا اطّلاع على مراسلات الآخرين.', true),
  ('correspondence_officer', 'مسؤول المراسلات',    'Correspondence Officer', 'تسجيل الوارد والصادر وإحالته.', true),
  ('executive_office',       'مكتب المدير',        'Executive Office',       'اطّلاع على مراسلات المؤسسة وإحالتها.', true),
  ('manager',                'مدير',               'Manager',                'اطّلاع على مراسلات وحدته وما تحتها.', true),
  ('reviewer',               'مراجع',              'Reviewer',               'مراجعة المراسلات وإعادتها.', true),
  ('approver',               'معتمِد',             'Approver',               'اعتماد المراسلات أو رفضها.', true),
  ('signatory',              'مخوَّل بالتوقيع',    'Signatory',              'توقيع المراسلات المعتمدة.', true),
  ('employee',               'موظف',               'Employee',               'إنشاء مراسلاته والعمل عليها.', true),
  ('auditor',                'مدقق',               'Auditor',                'اطّلاع للقراءة فقط على المراسلات وسجل التدقيق.', true),
  ('viewer',                 'مطّلع',              'Viewer',                 'اطّلاع محدود على ما يخصه.', true)
on conflict (key) where organization_id is null do update
  set name_ar = excluded.name_ar, name_en = excluded.name_en, description_ar = excluded.description_ar;

/** يمنح صلاحية لدور نظام بنطاق محدد. */
create or replace function public.grant_system_role_permission(
  p_role_key text, p_permission text, p_scope text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target uuid;
begin
  select id into target from public.roles where key = p_role_key and organization_id is null;
  if target is null then
    raise exception 'system role % not found', p_role_key;
  end if;

  insert into public.role_permissions (role_id, permission_key, scope)
  values (target, p_permission, p_scope)
  on conflict (role_id, permission_key) do update set scope = excluded.scope;
end;
$$;

revoke all on function public.grant_system_role_permission(text, text, text) from public, anon, authenticated;

do $$
declare
  perm text;
begin
  -- موظف: صفوفه هو فقط. هذا يطابق سلوك التطبيق الحالي تمامًا.
  foreach perm in array array[
    'correspondence.create','correspondence.view','correspondence.edit',
    'correspondence.archive','correspondence.download','correspondence.print','ai.use'
  ] loop
    perform public.grant_system_role_permission('employee', perm, 'own');
  end loop;

  -- مطّلع: قراءة ما يخصه فقط.
  perform public.grant_system_role_permission('viewer', 'correspondence.view', 'own');

  -- مدير المؤسسة: حوكمة لا اطّلاع. لا correspondence.view على مستوى المؤسسة.
  foreach perm in array array['users.manage','roles.manage','templates.manage','organization.manage','audit.view'] loop
    perform public.grant_system_role_permission('organization_admin', perm, 'organization');
  end loop;
  foreach perm in array array['correspondence.create','correspondence.view','correspondence.edit','ai.use'] loop
    perform public.grant_system_role_permission('organization_admin', perm, 'own');
  end loop;

  -- مدير: وحدته وما تحتها.
  foreach perm in array array['correspondence.view','correspondence.refer','correspondence.review','correspondence.return'] loop
    perform public.grant_system_role_permission('manager', perm, 'descendants');
  end loop;
  foreach perm in array array['correspondence.create','correspondence.edit','ai.use'] loop
    perform public.grant_system_role_permission('manager', perm, 'own');
  end loop;

  -- مسؤول المراسلات: على مستوى المؤسسة — يُسنَد يدويًا فقط.
  foreach perm in array array[
    'correspondence.create','correspondence.view','correspondence.edit','correspondence.refer',
    'correspondence.archive','correspondence.download','correspondence.print',
    'attachment.view','attachment.upload','attachment.download'
  ] loop
    perform public.grant_system_role_permission('correspondence_officer', perm, 'organization');
  end loop;
  perform public.grant_system_role_permission('correspondence_officer', 'ai.use', 'own');

  -- مكتب المدير: اطّلاع وإحالة على مستوى المؤسسة — يُسنَد يدويًا فقط.
  foreach perm in array array['correspondence.view','correspondence.refer','correspondence.download'] loop
    perform public.grant_system_role_permission('executive_office', perm, 'organization');
  end loop;
  perform public.grant_system_role_permission('executive_office', 'ai.use', 'own');

  -- مراجع / معتمِد / مخوَّل بالتوقيع: نطاق الوحدة وما تحتها.
  foreach perm in array array['correspondence.view','correspondence.review','correspondence.return'] loop
    perform public.grant_system_role_permission('reviewer', perm, 'descendants');
  end loop;
  foreach perm in array array['correspondence.view','correspondence.approve','correspondence.reject','correspondence.return'] loop
    perform public.grant_system_role_permission('approver', perm, 'descendants');
  end loop;
  foreach perm in array array['correspondence.view','correspondence.sign','correspondence.issue'] loop
    perform public.grant_system_role_permission('signatory', perm, 'descendants');
  end loop;

  -- مدقق: قراءة فقط على مستوى المؤسسة — يُسنَد يدويًا فقط.
  foreach perm in array array['correspondence.view','audit.view','attachment.view'] loop
    perform public.grant_system_role_permission('auditor', perm, 'organization');
  end loop;

  -- مدير النظام: كل الصلاحيات على مستوى المؤسسة.
  for perm in select key from public.permissions loop
    perform public.grant_system_role_permission('system_admin', perm, 'organization');
  end loop;
end $$;
