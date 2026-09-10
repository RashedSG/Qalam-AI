-- =============================================================================
-- قلم | QALAM — Phase 4 (أ): آلة الحالة والانتقالات المحمية
--
-- المبدأ: لا تُغيّر الواجهة حالة مراسلة بـ UPDATE. كل انتقال يمر بإجراء واحد
-- يتحقق من الحالة الحالية والصلاحية والمؤسسة والتصنيف وفصل المهام، ثم يسجّل.
--
-- الحماية طبقتان:
--   ١) سحب صلاحية UPDATE على العمود نفسه (صلاحية على مستوى العمود في PostgreSQL)
--   ٢) مُشغّل يرفض أي تغيير لا يأتي من الإجراء المعتمد
-- الأولى تمنع قبل تقييم السياسة، والثانية تمسك ما قد يفلت من الأولى.
-- =============================================================================


-- =============================================================================
-- 1) الانتقالات المسموحة — جدول لا شرط مثبّت في الكود
--
-- organization_id = null ⇒ انتقال نظام يسري على الجميع.
-- صف لمؤسسة بعينها يتقدّم على صف النظام لنفس الانتقال.
-- =============================================================================
create table if not exists public.workflow_transitions (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references public.organizations (id) on delete cascade,
  from_status         public.qalam_correspondence_status not null,
  to_status           public.qalam_correspondence_status not null,
  /** الصلاحية المطلوبة لتنفيذ هذا الانتقال. */
  required_permission text not null references public.permissions (key),
  /** هل يُلزم المنفّذ بتعليق؟ الإعادة والرفض بلا سبب بلا فائدة. */
  requires_comment    boolean not null default false,
  label_ar            text not null,
  label_en            text not null default '',
  sort_order          integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  constraint workflow_transitions_distinct check (from_status <> to_status)
);

create unique index if not exists workflow_transitions_system_idx
  on public.workflow_transitions (from_status, to_status)
  where organization_id is null;
create unique index if not exists workflow_transitions_org_idx
  on public.workflow_transitions (organization_id, from_status, to_status)
  where organization_id is not null;

insert into public.workflow_transitions
  (organization_id, from_status, to_status, required_permission, requires_comment, label_ar, label_en, sort_order)
values
  (null, 'draft',       'in_review',   'correspondence.review',  false, 'إرسال للمراجعة',  'Submit for review', 1),
  (null, 'in_review',   'in_approval', 'correspondence.review',  false, 'اعتماد المراجعة', 'Pass review',       2),
  (null, 'in_review',   'returned',    'correspondence.return',  true,  'إعادة للمُعِد',    'Return to author',  3),
  (null, 'returned',    'in_review',   'correspondence.review',  false, 'إعادة الإرسال',   'Resubmit',          4),
  (null, 'in_approval', 'approved',    'correspondence.approve', false, 'اعتماد',          'Approve',           5),
  (null, 'in_approval', 'returned',    'correspondence.return',  true,  'إعادة',           'Return',            6),
  (null, 'in_approval', 'draft',       'correspondence.reject',  true,  'رفض',             'Reject',            7),
  (null, 'approved',    'signed',      'correspondence.sign',    false, 'توقيع',           'Sign',              8),
  (null, 'signed',      'issued',      'correspondence.issue',   false, 'إصدار',           'Issue',             9),
  (null, 'issued',      'closed',      'correspondence.archive', false, 'إغلاق',           'Close',            10),
  (null, 'closed',      'archived',    'correspondence.archive', false, 'أرشفة',           'Archive',          11)
on conflict do nothing;


-- =============================================================================
-- 2) سجل الانتقالات — من نقل المراسلة من أي حالة إلى أي حالة ولماذا
--
-- منفصل عن audit_log عمدًا: هذا سجل تشغيلي يُعرض للمستخدم في صفحة المراسلة،
-- وaudit_log سجل حوكمة يقرأه المدقق. خلطهما يجعل أحدهما ضجيجًا في الآخر.
-- =============================================================================
create table if not exists public.correspondence_transitions (
  id                uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondences (id) on delete cascade,
  organization_id   uuid,
  actor_id          uuid not null,
  from_status       public.qalam_correspondence_status not null,
  to_status         public.qalam_correspondence_status not null,
  comment           text not null default '',
  /** الإصدار الذي كان قائمًا وقت الانتقال — لتمييز «اعتُمد ماذا». */
  version_id        uuid references public.correspondence_versions (id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists correspondence_transitions_parent_idx
  on public.correspondence_transitions (correspondence_id, created_at desc);
create index if not exists correspondence_transitions_actor_idx
  on public.correspondence_transitions (actor_id, created_at desc);


-- =============================================================================
-- 3) فصل المهام — سياسة اختيارية لكل مؤسسة
--
-- الافتراضي: مُطفأة. تفعيلها في تثبيت بمستخدم واحد يمنعه من اعتماد مراسلاته
-- فيتعطّل النظام؛ والقرار يخص المؤسسة لا الكود.
--
--   update public.organizations
--      set settings = jsonb_set(settings, '{separation_of_duties}',
--            '{"creator_not_approver": true, "reviewer_not_signatory": true}')
--    where id = '…';
-- =============================================================================

/** هل تمنع سياسة المؤسسة هذا الفاعل من هذا الانتقال؟ يعيد سبب المنع أو null. */
create or replace function public.separation_of_duties_block(
  p_correspondence_id uuid,
  p_actor_id          uuid,
  p_to_status         text
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  policy    jsonb;
  parent    record;
begin
  select c.user_id, c.created_by, c.organization_id, o.settings
    into parent
  from public.correspondences c
  join public.organizations o on o.id = c.organization_id
  where c.id = p_correspondence_id;

  if parent is null then return null; end if;
  policy := coalesce(parent.settings -> 'separation_of_duties', '{}'::jsonb);

  -- من أعدّ المراسلة لا يعتمدها.
  if p_to_status = 'approved'
     and coalesce((policy ->> 'creator_not_approver')::boolean, false)
     and p_actor_id in (parent.user_id, parent.created_by) then
    return 'creator_not_approver';
  end if;

  -- من راجعها لا يوقّعها.
  if p_to_status = 'signed'
     and coalesce((policy ->> 'reviewer_not_signatory')::boolean, false)
     and exists (
       select 1 from public.correspondence_transitions t
       where t.correspondence_id = p_correspondence_id
         and t.actor_id = p_actor_id
         and t.to_status in ('in_approval', 'returned')
     ) then
    return 'reviewer_not_signatory';
  end if;

  return null;
end;
$$;


-- =============================================================================
-- 4) سلطة سير العمل — تختلف عن صلاحية الاطّلاع
--
-- ⚠️ خلل حقيقي أمسكته بوابة المرحلة: can_access_row تُرجع true فورًا لمالك
--    الصف. هذا صحيح للاطّلاع والتعديل — صفوفك صفوفك — وكارثي لسير العمل:
--    كان الموظف يعتمد مراسلته بنفسه لأنه مالكها.
--
--    كتابة مراسلة ليست صلاحية اعتمادها. سلطة سير العمل تُشتق من الدور وحده،
--    ولا استثناء فيها للمالك. الاسم يُبرز الفرق: access (اطّلاع) مقابل act (فعل).
-- =============================================================================
create or replace function public.can_act_on_correspondence(
  p_permission      text,
  p_organization_id uuid,
  p_owner_id        uuid,
  p_owner_unit_id   uuid,
  p_classification  text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  scope        text;
  my_unit      uuid;
  my_clearance integer;
  my_path      text;
  owner_path   text;
  owner_unit   uuid;
  needed_rank  integer;
begin
  if uid is null or p_organization_id is null then return false; end if;

  scope := public.permission_scope(p_permission, p_organization_id);
  if scope is null then return false; end if;

  -- التصنيف حاجز قائم بذاته، ولا يُستثنى منه المالك في سياق الفعل.
  if p_classification is not null then
    select rank into needed_rank
    from public.classification_levels
    where organization_id = p_organization_id and key = p_classification;

    if needed_rank is not null then
      select clearance_rank into my_clearance from public.my_membership(p_organization_id);
      if coalesce(my_clearance, 0) < needed_rank then return false; end if;
    end if;
  end if;

  if scope = 'organization' then return true; end if;

  -- نطاق 'own' يعني صفوفه هو: يفعل على ما يملكه فقط.
  if scope = 'own' then return p_owner_id = uid; end if;

  select org_unit_id into my_unit from public.my_membership(p_organization_id);
  owner_unit := coalesce(p_owner_unit_id, public.owner_unit(p_organization_id, p_owner_id));
  if my_unit is null or owner_unit is null then return false; end if;

  if scope = 'unit' then return my_unit = owner_unit; end if;

  select path into my_path    from public.org_units where id = my_unit;
  select path into owner_path from public.org_units where id = owner_unit;
  if my_path is null or owner_path is null then return false; end if;

  return owner_path = my_path or owner_path like my_path || '/%';
end;
$$;

revoke all on function public.can_act_on_correspondence(text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.can_act_on_correspondence(text, uuid, uuid, uuid, text) to authenticated;


-- =============================================================================
-- 5) الانتقال — المسار الوحيد لتغيير الحالة
-- =============================================================================
create or replace function public.transition_correspondence(
  p_correspondence_id uuid,
  p_to_status         text,
  p_comment           text default ''
)
returns public.qalam_correspondence_status
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  parent     record;
  rule       record;
  target     public.qalam_correspondence_status;
  block      text;
  latest_ver uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  begin
    target := p_to_status::public.qalam_correspondence_status;
  exception when others then
    raise exception 'unknown status %', p_to_status using errcode = '22023';
  end;

  select id, organization_id, user_id, owner_unit_id, classification_key, current_status
    into parent
  from public.correspondences where id = p_correspondence_id;

  if parent is null then
    raise exception 'correspondence not found' using errcode = 'P0002';
  end if;
  if parent.organization_id is null then
    raise exception 'correspondence has no organization' using errcode = '22023';
  end if;
  if parent.current_status = target then
    return target;  -- لا شيء يتغيّر؛ الاستدعاء المكرر ليس خطأً
  end if;

  -- الانتقال يجب أن يكون معرّفًا. صف المؤسسة يتقدّم على صف النظام.
  select * into rule
  from public.workflow_transitions
  where from_status = parent.current_status
    and to_status = target
    and is_active = true
    and (organization_id = parent.organization_id or organization_id is null)
  order by (organization_id is not null) desc
  limit 1;

  if rule is null then
    raise exception 'transition from % to % is not allowed', parent.current_status, target
      using errcode = '22023';
  end if;

  if rule.requires_comment and coalesce(trim(p_comment), '') = '' then
    raise exception 'this transition requires a comment' using errcode = '22023';
  end if;

  -- سلطة الفعل لا صلاحية الاطّلاع: المالك لا يُستثنى.
  if not public.can_act_on_correspondence(
       rule.required_permission, parent.organization_id, parent.user_id,
       parent.owner_unit_id, parent.classification_key) then
    raise exception 'not permitted to perform this transition' using errcode = '42501';
  end if;

  block := public.separation_of_duties_block(p_correspondence_id, uid, target::text);
  if block is not null then
    raise exception 'blocked by separation of duties: %', block using errcode = '42501';
  end if;

  select id into latest_ver
  from public.correspondence_versions
  where correspondence_id = p_correspondence_id
  order by created_at desc limit 1;

  perform set_config('qalam.transitioning', 'on', true);
  update public.correspondences
     set current_status = target,
         is_archived = (target = 'archived')
   where id = p_correspondence_id;
  perform set_config('qalam.transitioning', 'off', true);

  insert into public.correspondence_transitions
    (correspondence_id, organization_id, actor_id, from_status, to_status, comment, version_id)
  values
    (p_correspondence_id, parent.organization_id, uid, parent.current_status, target,
     left(coalesce(p_comment, ''), 4000), latest_ver);

  perform public.record_audit(
    'correspondence.' || target::text, 'correspondence', p_correspondence_id,
    parent.organization_id, parent.current_status::text, target::text,
    jsonb_build_object('permission', rule.required_permission)
  );

  return target;
end;
$$;


/** الانتقالات المتاحة للمستخدم الآن على هذه المراسلة — لبناء أزرار الواجهة. */
create or replace function public.available_transitions(p_correspondence_id uuid)
returns table (
  to_status        text,
  label_ar         text,
  label_en         text,
  requires_comment boolean,
  sort_order       integer
)
language sql
stable
security definer
set search_path = public
as $$
  select t.to_status::text, t.label_ar, t.label_en, t.requires_comment, t.sort_order
  from public.correspondences c
  join public.workflow_transitions t
    on t.from_status = c.current_status
   and t.is_active = true
   and (t.organization_id = c.organization_id or t.organization_id is null)
  where c.id = p_correspondence_id
    and c.organization_id is not null
    and public.can_act_on_correspondence(
          t.required_permission, c.organization_id, c.user_id, c.owner_unit_id, c.classification_key)
    and public.separation_of_duties_block(c.id, auth.uid(), t.to_status::text) is null
  order by t.sort_order
$$;


-- =============================================================================
-- 6) حماية العمود
-- =============================================================================
create or replace function public.guard_status_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('qalam.transitioning', true), '') = 'on' then
    return new;
  end if;
  -- الهجرات والعمليات الإدارية بلا جلسة — لا تُقيَّد.
  if auth.uid() is null then return new; end if;
  if new.current_status is distinct from old.current_status then
    raise exception 'status changes must go through transition_correspondence()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_status_column_trg on public.correspondences;
create trigger guard_status_column_trg
  before update of current_status on public.correspondences
  for each row execute function public.guard_status_column();


-- =============================================================================
-- 7) النسخة المعتمدة لا تُعدَّل في مكانها
--
-- تعديل نص مراسلة معتمدة أو موقّعة أو صادرة دون إعادة الدورة يجعل الاعتماد
-- كاذبًا: وقّع المعتمِد نصًا وصار غيره. المُشغّل يمنع، والدالة أدناه هي
-- الطريق المعلن: تحفظ المعتمد إصدارًا، تطبّق التعديل، وتعيد الحالة إلى مسودة.
-- =============================================================================
create or replace function public.guard_approved_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('qalam.revising', true), '') = 'on' then
    return new;
  end if;
  if auth.uid() is null then return new; end if;

  if old.current_status in ('approved', 'signed', 'issued', 'closed')
     and (new.body is distinct from old.body or new.subject is distinct from old.subject) then
    raise exception 'approved content is immutable — use revise_correspondence()'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_approved_content_trg on public.correspondences;
create trigger guard_approved_content_trg
  before update of body, subject on public.correspondences
  for each row execute function public.guard_approved_content();


/** يفتح مراسلة معتمدة للتعديل: يحفظ المعتمد إصدارًا ويعيد الدورة من المسودة. */
create or replace function public.revise_correspondence(
  p_correspondence_id uuid,
  p_subject           text,
  p_body              text,
  p_reason            text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  parent record;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'a revision reason is required' using errcode = '22023';
  end if;

  select * into parent from public.correspondences where id = p_correspondence_id;
  if parent is null then
    raise exception 'correspondence not found' using errcode = 'P0002';
  end if;

  if parent.user_id <> uid
     and not public.can_access_correspondence(
       'correspondence.edit', parent.organization_id, parent.user_id,
       parent.owner_unit_id, parent.classification_key) then
    raise exception 'not permitted to revise this correspondence' using errcode = '42501';
  end if;

  -- النص المعتمد يُحفظ قبل استبداله، فيبقى ما اعتُمد قابلًا للمراجعة.
  insert into public.correspondence_versions
    (correspondence_id, user_id, variant_kind, subject, body, note)
  values
    (p_correspondence_id, parent.user_id, 'approved', parent.subject, parent.body,
     left(coalesce(p_reason, ''), 1000));

  perform set_config('qalam.revising', 'on', true);
  perform set_config('qalam.transitioning', 'on', true);
  update public.correspondences
     set subject = coalesce(p_subject, subject),
         body = coalesce(p_body, body),
         current_status = 'draft'
   where id = p_correspondence_id;
  perform set_config('qalam.revising', 'off', true);
  perform set_config('qalam.transitioning', 'off', true);

  insert into public.correspondence_transitions
    (correspondence_id, organization_id, actor_id, from_status, to_status, comment)
  values
    (p_correspondence_id, parent.organization_id, uid, parent.current_status, 'draft',
     left(coalesce(p_reason, ''), 4000));

  perform public.record_audit(
    'correspondence.revised', 'correspondence', p_correspondence_id,
    parent.organization_id, parent.current_status::text, 'draft', '{}'::jsonb
  );
end;
$$;


-- =============================================================================
-- 8) التوقيع
--
-- ⚠️ هذا توقيع داخلي في سير العمل: هوية ووقت وسجل لا يقبل التعديل.
--    ليس توقيعًا رقميًا مؤهَّلًا قانونيًا — ذلك يتطلب دمج مزوّد معتمد.
--    الأعمدة provider و provider_ref مُهيَّأة لذلك التكامل ولا تُملأ اليوم.
-- =============================================================================
create table if not exists public.signatures (
  id                uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondences (id) on delete cascade,
  organization_id   uuid,
  signer_id         uuid not null,
  /** 'internal_workflow' اليوم. قيم أخرى عند دمج مزوّد توقيع معتمد. */
  method            text not null default 'internal_workflow',
  provider          text,
  provider_ref      text,
  /** ما وقّع عليه فعلًا — بصمة النص وقت التوقيع. */
  content_hash      text,
  signed_at         timestamptz not null default now(),
  constraint signatures_method_check check (method in ('internal_workflow', 'external_provider'))
);

create index if not exists signatures_parent_idx on public.signatures (correspondence_id, signed_at desc);

/** يوقّع مراسلة معتمدة. التوقيع ينقلها إلى 'signed' عبر نفس آلة الحالة. */
create or replace function public.sign_correspondence(
  p_correspondence_id uuid,
  p_comment           text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  parent    record;
  new_id    uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into parent from public.correspondences where id = p_correspondence_id;
  if parent is null then
    raise exception 'correspondence not found' using errcode = 'P0002';
  end if;
  if parent.current_status <> 'approved' then
    raise exception 'only approved correspondence can be signed' using errcode = '22023';
  end if;

  -- الانتقال يفرض الصلاحية وفصل المهام؛ لا نُكرّر الفحص هنا فيتباعد المنطقان.
  perform public.transition_correspondence(p_correspondence_id, 'signed', p_comment);

  insert into public.signatures
    (correspondence_id, organization_id, signer_id, method, content_hash)
  values
    (p_correspondence_id, parent.organization_id, uid, 'internal_workflow',
     encode(sha256(convert_to(coalesce(parent.subject,'') || E'\n' || coalesce(parent.body,''), 'UTF8')), 'hex'))
  returning id into new_id;

  return new_id;
end;
$$;


-- =============================================================================
-- تقصير في الأدوار كشفته الدورة الكاملة
--
-- «مسؤول المراسلات» وصفه «تسجيل الوارد والصادر وإحالته» — والإصدار جوهر ذلك،
-- لكنه لم يكن يملك correspondence.issue فتعطّلت الدورة عند آخر خطوة.
-- =============================================================================
do $$
declare officer uuid;
begin
  select id into officer from public.roles where key = 'correspondence_officer' and organization_id is null;
  if officer is not null then
    insert into public.role_permissions (role_id, permission_key, scope)
    values (officer, 'correspondence.issue', 'organization')
    on conflict (role_id, permission_key) do nothing;
  end if;
end $$;


-- =============================================================================
-- الصلاحيات
-- =============================================================================
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.transition_correspondence(uuid, text, text)',
    'public.available_transitions(uuid)',
    'public.revise_correspondence(uuid, text, text, text)',
    'public.sign_correspondence(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;

  execute 'revoke all on function public.separation_of_duties_block(uuid, uuid, text) from public, anon, authenticated;';
end $$;

-- صلاحية على مستوى العمود: تمنع قبل تقييم أي سياسة.
revoke update (current_status) on public.correspondences from authenticated;
