-- =============================================================================
-- قلم | QALAM — Phase 3 (د): الإحالات والإشعارات
-- =============================================================================


-- =============================================================================
-- 1) تعليمات الإحالة — قابلة للتخصيص لكل مؤسسة
-- =============================================================================
create table if not exists public.referral_instructions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key             text not null,
  name_ar         text not null,
  name_en         text not null default '',
  /** هل تتطلب هذه التعليمة ردًّا، أم هي للعلم فقط؟ */
  requires_response boolean not null default true,
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index if not exists referral_instructions_key_idx
  on public.referral_instructions (organization_id, key);

create or replace function public.seed_referral_instructions(p_organization_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.referral_instructions
    (organization_id, key, name_ar, name_en, requires_response, sort_order)
  values
    (p_organization_id, 'for_info',      'للعلم',            'For information', false, 1),
    (p_organization_id, 'for_comment',   'للإفادة',          'For comment',     true,  2),
    (p_organization_id, 'for_study',     'للدراسة',          'For study',       true,  3),
    (p_organization_id, 'for_review',    'للمراجعة',         'For review',      true,  4),
    (p_organization_id, 'for_action',    'لاتخاذ اللازم',    'For action',      true,  5),
    (p_organization_id, 'prepare_reply', 'لإعداد الرد',      'Prepare a reply', true,  6)
  on conflict (organization_id, key) do nothing;
$$;

revoke all on function public.seed_referral_instructions(uuid) from public, anon, authenticated;

do $$
declare org record;
begin
  for org in select id from public.organizations loop
    perform public.seed_referral_instructions(org.id);
  end loop;
end $$;


-- =============================================================================
-- 2) الإحالات
--
-- الإحالة إلى شخص أو إلى وحدة — أحدهما لا كلاهما، ويفرض القيد ذلك.
-- =============================================================================
create table if not exists public.referrals (
  id                uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondences (id) on delete cascade,
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  from_user_id      uuid not null,
  to_user_id        uuid references auth.users (id) on delete cascade,
  to_unit_id        uuid references public.org_units (id) on delete cascade,
  instruction_key   text not null,
  note              text not null default '',
  due_at            timestamptz,
  status            text not null default 'pending',
  response          text not null default '',
  responded_at      timestamptz,
  responded_by      uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint referrals_status_check
    check (status in ('pending', 'acknowledged', 'responded', 'closed')),
  -- إحالة بلا مُحال إليه لا معنى لها، وإحالة إلى الاثنين تُبهم المسؤولية.
  constraint referrals_target_check
    check ((to_user_id is not null) <> (to_unit_id is not null))
);

create index if not exists referrals_parent_idx on public.referrals (correspondence_id, created_at desc);
create index if not exists referrals_to_user_idx on public.referrals (to_user_id, status) where to_user_id is not null;
create index if not exists referrals_to_unit_idx on public.referrals (to_unit_id, status) where to_unit_id is not null;
create index if not exists referrals_due_idx on public.referrals (organization_id, due_at) where due_at is not null;

drop trigger if exists set_updated_at on public.referrals;
create trigger set_updated_at before update on public.referrals
  for each row execute function public.set_updated_at();


/**
 * هل المستخدم الحالي مُحال إليه في هذه الإحالة؟
 * الإحالة إلى وحدة تَصل كل عضو نشط فيها — وهذا المقصود من إحالة الوحدات.
 */
create or replace function public.is_referral_target(p_referral_id uuid)
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
    where r.id = p_referral_id
      and (r.to_user_id = auth.uid() or (r.to_unit_id is not null and r.to_unit_id = m.org_unit_id))
  )
$$;

/**
 * يُنشئ إحالة. الإحالة وصولٌ مُمنوح: المُحال إليه يرى المراسلة بعدها،
 * ولذلك يتطلب إنشاؤها correspondence.refer أو ملكية الصف.
 */
create or replace function public.create_referral(
  p_correspondence_id uuid,
  p_instruction_key   text,
  p_to_user_id        uuid default null,
  p_to_unit_id        uuid default null,
  p_note              text default '',
  p_due_at            timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid      uuid := auth.uid();
  parent   record;
  new_id   uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if (p_to_user_id is null) = (p_to_unit_id is null) then
    raise exception 'a referral needs exactly one target' using errcode = '22023';
  end if;

  select organization_id, user_id, owner_unit_id, classification_key
    into parent
  from public.correspondences where id = p_correspondence_id;

  if parent is null then
    raise exception 'correspondence not found' using errcode = 'P0002';
  end if;
  if parent.organization_id is null then
    raise exception 'correspondence has no organization' using errcode = '22023';
  end if;

  if parent.user_id <> uid
     and not public.can_access_correspondence(
       'correspondence.refer', parent.organization_id, parent.user_id,
       parent.owner_unit_id, parent.classification_key) then
    raise exception 'not permitted to refer this correspondence' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.referral_instructions
    where organization_id = parent.organization_id and key = p_instruction_key and is_active
  ) then
    raise exception 'unknown referral instruction' using errcode = '22023';
  end if;

  -- المُحال إليه يجب أن يكون عضوًا نشطًا في المؤسسة نفسها.
  if p_to_user_id is not null and not exists (
    select 1 from public.memberships
    where organization_id = parent.organization_id and user_id = p_to_user_id and status = 'active'
  ) then
    raise exception 'referral target is not an active member' using errcode = '22023';
  end if;

  if p_to_unit_id is not null and not exists (
    select 1 from public.org_units
    where id = p_to_unit_id and organization_id = parent.organization_id
  ) then
    raise exception 'referral target unit is outside the organization' using errcode = '22023';
  end if;

  insert into public.referrals (
    correspondence_id, organization_id, from_user_id, to_user_id, to_unit_id,
    instruction_key, note, due_at
  ) values (
    p_correspondence_id, parent.organization_id, uid, p_to_user_id, p_to_unit_id,
    p_instruction_key, left(coalesce(p_note, ''), 2000), p_due_at
  )
  returning id into new_id;

  perform public.record_audit(
    'referral.created', 'referral', new_id, parent.organization_id, null, 'pending',
    jsonb_build_object(
      'correspondence_id', p_correspondence_id,
      'instruction', p_instruction_key,
      'to_user_id', p_to_user_id,
      'to_unit_id', p_to_unit_id
    )
  );

  return new_id;
end;
$$;

/** يسجّل ردّ المُحال إليه. لا يسمح بالرد لغير المُحال إليه. */
create or replace function public.respond_to_referral(
  p_referral_id uuid,
  p_status      text,
  p_response    text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  row_data  record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_status not in ('acknowledged', 'responded', 'closed') then
    raise exception 'invalid referral status' using errcode = '22023';
  end if;

  select * into row_data from public.referrals where id = p_referral_id;
  if row_data is null then
    raise exception 'referral not found' using errcode = 'P0002';
  end if;

  -- المُحيل يستطيع إغلاق إحالته؛ وما عدا ذلك للمُحال إليه وحده.
  if not public.is_referral_target(p_referral_id)
     and not (row_data.from_user_id = uid and p_status = 'closed') then
    raise exception 'not permitted to respond to this referral' using errcode = '42501';
  end if;

  update public.referrals
     set status = p_status,
         response = case when p_status = 'acknowledged' then response
                         else left(coalesce(p_response, ''), 4000) end,
         responded_at = now(),
         responded_by = uid
   where id = p_referral_id;

  perform public.record_audit(
    'referral.' || p_status, 'referral', p_referral_id, row_data.organization_id,
    row_data.status, p_status,
    jsonb_build_object('correspondence_id', row_data.correspondence_id)
  );
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.is_referral_target(uuid)',
    'public.create_referral(uuid, text, uuid, uuid, text, timestamptz)',
    'public.respond_to_referral(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;


-- =============================================================================
-- 3) الإشعارات
--
-- ⚠️ خصوصية: لا محتوى مراسلة هنا. الإشعار يقول «لديك مراسلة تتطلب إجراء»
--    ومعه معرّف فقط؛ النص يُقرأ من المراسلة نفسها بعد فحص RLS. لو حمل
--    الإشعار الموضوع لتسرّب محتوى سري إلى من لا يملك تخليصه.
-- =============================================================================
create table if not exists public.notifications (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  /** مفتاح رسالة تُترجمه الواجهة — لا نص حر. */
  kind            text not null,
  entity_type     text not null,
  entity_id       uuid,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  constraint notifications_kind_check
    check (kind in ('referral.received', 'referral.responded', 'referral.overdue',
                    'correspondence.returned', 'correspondence.approved'))
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, read_at, created_at desc);


/** يُنشئ إشعارات الإحالة — لكل عضو نشط في الوحدة عند إحالة وحدة. */
create or replace function public.notify_referral()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.to_user_id is not null then
      insert into public.notifications (user_id, organization_id, kind, entity_type, entity_id)
      values (new.to_user_id, new.organization_id, 'referral.received', 'referral', new.id);
    else
      insert into public.notifications (user_id, organization_id, kind, entity_type, entity_id)
      select m.user_id, new.organization_id, 'referral.received', 'referral', new.id
      from public.memberships m
      where m.organization_id = new.organization_id
        and m.org_unit_id = new.to_unit_id
        and m.status = 'active'
        and m.user_id <> new.from_user_id;  -- لا يُشعر المُحيل نفسه
    end if;
    return null;
  end if;

  -- الرد يُشعر المُحيل وحده.
  if new.status is distinct from old.status and new.status in ('responded', 'closed') then
    insert into public.notifications (user_id, organization_id, kind, entity_type, entity_id)
    select new.from_user_id, new.organization_id, 'referral.responded', 'referral', new.id
    where new.from_user_id <> coalesce(new.responded_by, new.from_user_id);
  end if;
  return null;
end;
$$;

drop trigger if exists notify_referral_trg on public.referrals;
create trigger notify_referral_trg
  after insert or update of status on public.referrals
  for each row execute function public.notify_referral();


/** تحديد الإشعارات كمقروءة — للمستخدم نفسه فقط. */
create or replace function public.mark_notifications_read(p_ids bigint[] default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  changed integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  update public.notifications
     set read_at = now()
   where user_id = uid
     and read_at is null
     and (p_ids is null or id = any(p_ids));

  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.mark_notifications_read(bigint[]) from public, anon;
grant execute on function public.mark_notifications_read(bigint[]) to authenticated;
