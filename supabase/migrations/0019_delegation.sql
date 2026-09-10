-- =============================================================================
-- قلم | QALAM — Phase 4 (ب): التفويض المؤقت
--
-- قاعدتان غير قابلتين للتفاوض:
--   ١) التفويض ينتهي بنفسه. لا يعتمد على أحد ليُلغيه.
--   ٢) لا يمنح المفوَّض إليه أوسع مما يملكه المفوِّض — لا صلاحيةً ولا نطاقًا.
--      ويُفحص ذلك عند كل استعلام لا عند الإنشاء فقط: لو فقد المفوِّض صلاحيته
--      بعد التفويض، سقطت عن المفوَّض إليه في اللحظة نفسها.
-- =============================================================================

create table if not exists public.delegations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  delegator_id    uuid not null references auth.users (id) on delete cascade,
  delegate_id     uuid not null references auth.users (id) on delete cascade,
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz not null,
  /** يحصر التفويض في وحدة وما تحتها. null = نطاق المفوِّض كاملًا. */
  scope_unit_id   uuid references public.org_units (id) on delete cascade,
  reason          text not null default '',
  revoked_at      timestamptz,
  revoked_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint delegations_period_check check (ends_at > starts_at),
  constraint delegations_distinct check (delegator_id <> delegate_id)
);

create index if not exists delegations_delegate_idx
  on public.delegations (delegate_id, organization_id, ends_at);
create index if not exists delegations_delegator_idx
  on public.delegations (delegator_id, organization_id);

drop trigger if exists set_updated_at on public.delegations;
create trigger set_updated_at before update on public.delegations
  for each row execute function public.set_updated_at();

/** الصلاحيات المفوَّضة. تفويض بلا صفوف هنا لا يمنح شيئًا. */
create table if not exists public.delegation_permissions (
  delegation_id  uuid not null references public.delegations (id) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (delegation_id, permission_key)
);


/**
 * أوسع نطاق يمنحه تفويض نشط للمستخدم الحالي على هذه الصلاحية.
 *
 * السقف مزدوج: نطاق المفوِّض **الآن** (لا وقت الإنشاء)، ونطاق التفويض نفسه.
 * يُؤخذ الأضيق منهما — فلا يتجاوز التفويض مصدره أبدًا.
 */
create or replace function public.delegated_scope(p_permission text, p_organization_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  best_rank integer := 0;
  best      text;
  row_data  record;
  granted   text;
begin
  if auth.uid() is null or p_organization_id is null then return null; end if;

  for row_data in
    select d.delegator_id, d.scope_unit_id
    from public.delegations d
    join public.delegation_permissions dp on dp.delegation_id = d.id
    where d.delegate_id = auth.uid()
      and d.organization_id = p_organization_id
      and dp.permission_key = p_permission
      and d.revoked_at is null
      and d.starts_at <= now()
      and d.ends_at > now()          -- الانتهاء تلقائي: لا حاجة لأحد يُلغيه
  loop
    -- ما يملكه المفوِّض الآن، لا ما كان يملكه وقت التفويض.
    granted := public.permission_scope_direct(p_permission, p_organization_id, row_data.delegator_id);
    if granted is null then continue; end if;

    -- تفويض محصور في وحدة لا يمنح نطاق المؤسسة مهما ملك المفوِّض.
    if row_data.scope_unit_id is not null and public.scope_rank(granted) > public.scope_rank('descendants') then
      granted := 'descendants';
    end if;

    if public.scope_rank(granted) > best_rank then
      best_rank := public.scope_rank(granted);
      best := granted;
    end if;
  end loop;

  return best;
end;
$$;


/** نطاق مستخدم بعينه — نسخة من permission_scope تقبل هوية صريحة. */
create or replace function public.permission_scope_direct(
  p_permission      text,
  p_organization_id uuid,
  p_user_id         uuid
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rp.scope
  from public.memberships m
  join public.organizations o     on o.id = m.organization_id
  join public.membership_roles mr on mr.membership_id = m.id
  join public.role_permissions rp on rp.role_id = mr.role_id
  where m.user_id = p_user_id
    and m.organization_id = p_organization_id
    and m.status = 'active'
    and o.status = 'active'
    and rp.permission_key = p_permission
  order by public.scope_rank(rp.scope) desc
  limit 1
$$;


/**
 * يُعاد تعريف permission_scope ليجمع الأدوار المباشرة والتفويض.
 *
 * ⚠️ هذه أهم دالة في النظام: تعتمد عليها كل سياسات RLS. التغيير هنا يضيف
 *    مصدرًا للنطاق ولا يغيّر منطق أي سياسة — فلا حاجة لتعديل أي منها.
 */
create or replace function public.permission_scope(p_permission text, p_organization_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select scope from (
    select public.permission_scope_direct(p_permission, p_organization_id, auth.uid()) as scope
    union all
    select public.delegated_scope(p_permission, p_organization_id)
  ) sources
  where scope is not null
  order by public.scope_rank(scope) desc
  limit 1
$$;


/**
 * يُنشئ تفويضًا. يرفض ما يتجاوز المفوِّض، ويرفض المدة المفتوحة.
 * الصلاحيات تُمرَّر كمصفوفة ويُفحص كل مفتاح على حدة.
 */
create or replace function public.create_delegation(
  p_delegate_id  uuid,
  p_permissions  text[],
  p_ends_at      timestamptz,
  p_scope_unit_id uuid default null,
  p_starts_at    timestamptz default null,
  p_reason       text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  org_id  uuid;
  perm    text;
  new_id  uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_delegate_id = uid then
    raise exception 'cannot delegate to yourself' using errcode = '22023';
  end if;
  if p_ends_at is null or p_ends_at <= coalesce(p_starts_at, now()) then
    raise exception 'a delegation needs an end date after its start' using errcode = '22023';
  end if;
  -- مدة مفتوحة ليست تفويضًا بل نقل صلاحية دائم.
  if p_ends_at > now() + interval '1 year' then
    raise exception 'a delegation cannot exceed one year' using errcode = '22023';
  end if;
  if p_permissions is null or array_length(p_permissions, 1) is null then
    raise exception 'a delegation needs at least one permission' using errcode = '22023';
  end if;

  select organization_id into org_id
  from public.memberships
  where user_id = uid and status = 'active'
  limit 1;

  if org_id is null then
    raise exception 'you are not an active member of any organization' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.memberships
    where organization_id = org_id and user_id = p_delegate_id and status = 'active'
  ) then
    raise exception 'the delegate is not an active member of your organization' using errcode = '22023';
  end if;

  if p_scope_unit_id is not null and not exists (
    select 1 from public.org_units where id = p_scope_unit_id and organization_id = org_id
  ) then
    raise exception 'the scope unit is outside your organization' using errcode = '22023';
  end if;

  -- لا يفوّض أحد ما لا يملك.
  foreach perm in array p_permissions loop
    if public.permission_scope_direct(perm, org_id, uid) is null then
      raise exception 'you do not hold the permission %', perm using errcode = '42501';
    end if;
  end loop;

  insert into public.delegations
    (organization_id, delegator_id, delegate_id, starts_at, ends_at, scope_unit_id, reason)
  values
    (org_id, uid, p_delegate_id, coalesce(p_starts_at, now()), p_ends_at, p_scope_unit_id,
     left(coalesce(p_reason, ''), 1000))
  returning id into new_id;

  insert into public.delegation_permissions (delegation_id, permission_key)
  select new_id, unnest(p_permissions)
  on conflict do nothing;

  perform public.record_audit(
    'delegation.created', 'delegation', new_id, org_id, null, 'active',
    jsonb_build_object('delegate_id', p_delegate_id, 'ends_at', p_ends_at,
                       'permissions', to_jsonb(p_permissions))
  );

  return new_id;
end;
$$;


/** يُلغي تفويضًا قبل أوانه. للمفوِّض أو لمن يملك users.manage. */
create or replace function public.revoke_delegation(p_delegation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  row_data record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into row_data from public.delegations where id = p_delegation_id;
  if row_data is null then
    raise exception 'delegation not found' using errcode = 'P0002';
  end if;

  if row_data.delegator_id <> uid
     and not public.has_permission('users.manage', row_data.organization_id) then
    raise exception 'not permitted to revoke this delegation' using errcode = '42501';
  end if;

  update public.delegations
     set revoked_at = now(), revoked_by = uid
   where id = p_delegation_id and revoked_at is null;

  perform public.record_audit(
    'delegation.revoked', 'delegation', p_delegation_id, row_data.organization_id,
    'active', 'revoked', jsonb_build_object('delegate_id', row_data.delegate_id)
  );
end;
$$;


do $$
declare fn text;
begin
  foreach fn in array array[
    'public.create_delegation(uuid, text[], timestamptz, uuid, timestamptz, text)',
    'public.revoke_delegation(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;

  foreach fn in array array[
    'public.delegated_scope(text, uuid)',
    'public.permission_scope_direct(text, uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated;', fn);
  end loop;
end $$;
