-- =============================================================================
-- قلم | QALAM — Phase 2 (ج): نقل البيانات القائمة إلى مؤسسة واحدة
--
-- ⚠️ هذه أخطر خطوة في المرحلة. المبادئ:
--   • لا تُفقد أي مراسلة أو مسودة أو قالب أو عبارة.
--   • لا NOT NULL على organization_id. البيانات غير المرحّلة تبقى صالحة،
--     وتبقى خاصة بمالكها وحده (can_access_row ترفض أي صف بلا مؤسسة لغير المالك).
--   • لا دور يُسنَد هنا يمنح رؤية مراسلات مستخدم آخر — يُتحقق من ذلك في النهاية
--     ويُرمى استثناء يُلغي الهجرة كلها إن اختلّ.
--   • قابلة لإعادة التنفيذ: إعادة تشغيلها لا تُنشئ مؤسسة ثانية ولا تُكرّر عضوية.
--
-- نموذج المستأجر الواحد (Single-Tenant): مؤسسة واحدة تضم المستخدمين الحاليين.
-- التوسع إلى مؤسسات متعددة لا يحتاج تغيير مخطط — فقط صفوفًا جديدة.
-- =============================================================================

do $$
declare
  org_id        uuid;
  root_unit     uuid;
  admin_role    uuid;
  employee_role uuid;
  owner_user    uuid;
  moved         integer;
  leak_count    integer;
begin
  ---------------------------------------------------------------------------
  -- 1) المؤسسة الافتراضية — تُنشأ مرة واحدة وتُعرَّف بـ code ثابت
  ---------------------------------------------------------------------------
  select id into org_id from public.organizations where lower(code) = 'default';

  if org_id is null then
    insert into public.organizations (name, name_en, code, status)
    values ('مؤسستي', 'My Organization', 'DEFAULT', 'active')
    returning id into org_id;
    raise notice 'created default organization %', org_id;
  else
    raise notice 'reusing default organization %', org_id;
  end if;

  ---------------------------------------------------------------------------
  -- 2) الوحدة الجذر
  ---------------------------------------------------------------------------
  select id into root_unit
  from public.org_units
  where organization_id = org_id and parent_id is null
  order by created_at limit 1;

  if root_unit is null then
    insert into public.org_units (organization_id, parent_id, code, name_ar, name_en, kind)
    values (org_id, null, 'ROOT', 'الإدارة العامة', 'Head Office', 'organization')
    returning id into root_unit;
  end if;

  select id into admin_role    from public.roles where key = 'organization_admin' and organization_id is null;
  select id into employee_role from public.roles where key = 'employee'           and organization_id is null;
  if admin_role is null or employee_role is null then
    raise exception 'system roles missing — run 0007 first';
  end if;

  ---------------------------------------------------------------------------
  -- 3) العضويات — كل مستخدم قائم يصبح عضوًا نشطًا في الوحدة الجذر
  ---------------------------------------------------------------------------
  insert into public.memberships (organization_id, user_id, org_unit_id, status, joined_at)
  select org_id, u.id, root_unit, 'active', coalesce(u.created_at, now())
  from auth.users u
  on conflict (organization_id, user_id) do nothing;

  get diagnostics moved = row_count;
  raise notice 'memberships created: %', moved;

  ---------------------------------------------------------------------------
  -- 4) الأدوار
  --
  -- أقدم مستخدم = مدير المؤسسة، وهو صاحب التثبيت في نموذج المستأجر الواحد.
  -- الباقون موظفون. مدير المؤسسة يدير المستخدمين والأدوار والهيكل، ولا يملك
  -- correspondence.view خارج نطاق 'own' — فالترقية لا تكشف مراسلات أحد.
  ---------------------------------------------------------------------------
  select id into owner_user from auth.users order by created_at, id limit 1;

  insert into public.membership_roles (membership_id, role_id)
  select m.id, case when m.user_id = owner_user then admin_role else employee_role end
  from public.memberships m
  where m.organization_id = org_id
  on conflict (membership_id, role_id) do nothing;

  -- كل عضو موظف أيضًا، فيملك صلاحيات العمل على صفوفه.
  insert into public.membership_roles (membership_id, role_id)
  select m.id, employee_role
  from public.memberships m
  where m.organization_id = org_id
  on conflict (membership_id, role_id) do nothing;

  ---------------------------------------------------------------------------
  -- 5) الربط (Backfill) — الصفوف التي لا مؤسسة لها فقط
  ---------------------------------------------------------------------------
  update public.profiles          set organization_id = org_id where organization_id is null;
  update public.correspondences   set organization_id = org_id where organization_id is null;
  update public.drafts            set organization_id = org_id where organization_id is null;
  -- صفوف النظام (القوالب والقاموس والأقسام العامة) تبقى بلا مؤسسة: مشتركة للجميع.
  update public.templates         set organization_id = org_id where organization_id is null and is_system = false;
  update public.dictionary_entries set organization_id = org_id where organization_id is null and is_system = false;
  update public.departments       set organization_id = org_id where organization_id is null and is_system = false;

  ---------------------------------------------------------------------------
  -- 6) التحقق — يفشل بصوت عالٍ بدل أن يمرّ بصمت
  ---------------------------------------------------------------------------
  if exists (select 1 from public.correspondences where organization_id is null) then
    raise exception 'backfill incomplete: correspondences still unlinked';
  end if;
  if exists (select 1 from public.drafts where organization_id is null) then
    raise exception 'backfill incomplete: drafts still unlinked';
  end if;
  if exists (
    select 1 from auth.users u
    where not exists (select 1 from public.memberships m where m.user_id = u.id and m.organization_id = org_id)
  ) then
    raise exception 'backfill incomplete: some users have no membership';
  end if;

  -- الضمان الحاسم: لا دور مُسنَد هنا يمنح رؤية مراسلات الغير.
  select count(*) into leak_count
  from public.memberships m
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.organization_id = org_id
    and rp.permission_key = 'correspondence.view'
    and rp.scope <> 'own';

  if leak_count > 0 then
    raise exception
      'backfill would grant cross-user correspondence visibility (% grants) — aborting', leak_count;
  end if;

  raise notice 'backfill verified: organization %, root unit %', org_id, root_unit;
end $$;
