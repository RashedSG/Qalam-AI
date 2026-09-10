-- =============================================================================
-- قلم | QALAM — Phase 5 (أ): أساس الوكيل — التتبّع والحدود وأدوات القراءة
--
-- المبدأ الحاكم: الوكيل يرى ما يراه المستخدم — لا أكثر ولا أقل.
--
-- كل أداة هنا `security invoker` عن قصد: تُنفَّذ بصلاحيات المستدعي فتسري عليها
-- سياسات RLS كما تسري على الواجهة. لو استُخدم security definer هنا لأصبحت كل
-- أداة ثغرة تجاوز محتملة، ولانهار الضمان الوحيد الذي يحد أثر حقن الأوامر.
-- =============================================================================


-- =============================================================================
-- 1) تشغيلات الوكيل — بيانات وصفية فقط
--
-- ⚠️ خصوصية: لا رسائل المستخدم ولا نتائج الأدوات ولا نص أي مراسلة.
--    `tool_calls` أسماء أدوات ونتائج منطقية وأزمنة — لا وسائط ولا مخرجات:
--    وسيطة أداة البحث هي استعلام المستخدم، ونتيجتها مقتطفات مراسلات.
-- =============================================================================
create table if not exists public.agent_runs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  organization_id   uuid,
  status            text not null default 'running',
  model             text,
  /** عدد دورات النموذج — يكشف الحلقات المفرغة. */
  steps             integer not null default 0,
  tool_call_count   integer not null default 0,
  /** [{tool, ok, ms}] — أسماء ونتائج منطقية فقط. */
  tool_calls        jsonb not null default '[]'::jsonb,
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  duration_ms       integer,
  error_code        text,
  /** هل رُصدت محاولة حقن في مُدخل غير موثوق خلال هذا التشغيل؟ */
  injection_flags   integer not null default 0,
  created_at        timestamptz not null default now(),
  finished_at       timestamptz,
  constraint agent_runs_status_check check (status in ('running', 'success', 'error', 'aborted'))
);

create index if not exists agent_runs_user_idx on public.agent_runs (user_id, created_at desc);
create index if not exists agent_runs_org_idx  on public.agent_runs (organization_id, created_at desc);

alter table public.agent_runs enable row level security;

drop policy if exists "agent_runs_select_own" on public.agent_runs;
create policy "agent_runs_select_own" on public.agent_runs
  for select to authenticated using (user_id = (select auth.uid()));

-- سجل تشغيل قابل للتعديل من صاحبه ليس سجلًا. الكتابة عبر إجراءين فقط.
revoke insert, update, delete on public.agent_runs from authenticated;


-- =============================================================================
-- 2) حدود الوكيل — قابلة للضبط بلا نشر
-- =============================================================================
insert into public.app_settings (key, value) values (
  'agent_limits',
  jsonb_build_object(
    'max_steps',        8,      -- دورات النموذج في التشغيل الواحد
    'max_tool_calls',   12,     -- استدعاءات الأدوات الكلية
    'timeout_ms',       60000,  -- سقف زمني للتشغيل كاملًا
    'max_total_tokens', 40000,  -- سقف رموز للتشغيل الواحد
    'runs_per_hour',    20,
    'runs_per_day',     100
  )
) on conflict (key) do nothing;


/**
 * يحجز تشغيل وكيل إن سمحت الحدود.
 *
 * حصة الوكيل مستقلة عن حصة المهام البسيطة: التشغيل الواحد قد يستدعي النموذج
 * ثماني مرات، فخلطه بعدّاد الطلبات العادي يستنزف الحد بثلاثة أسئلة.
 */
create or replace function public.begin_agent_run(p_model text default null, p_organization_id uuid default null)
returns table (allowed boolean, reason text, retry_after_seconds integer, run_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid       uuid := auth.uid();
  limits    jsonb := coalesce(public.app_setting('agent_limits'), '{}'::jsonb);
  lim_hour  integer := coalesce((limits ->> 'runs_per_hour')::integer, 20);
  lim_day   integer := coalesce((limits ->> 'runs_per_day')::integer, 100);
  n_hour    integer;
  n_day     integer;
  new_id    uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('agent:' || uid::text, 0));

  select
    count(*) filter (where created_at > now() - interval '1 hour'),
    count(*) filter (where created_at > date_trunc('day', now()))
  into n_hour, n_day
  from public.agent_runs
  where user_id = uid
    and status <> 'error'
    and created_at > date_trunc('day', now());

  if n_hour >= lim_hour then
    return query select false, 'runs_per_hour'::text, 3600, null::uuid;
    return;
  end if;
  if n_day >= lim_day then
    return query select false, 'runs_per_day'::text,
      greatest(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now()))::integer, 60),
      null::uuid;
    return;
  end if;

  insert into public.agent_runs (user_id, organization_id, model, status)
  values (uid, p_organization_id, p_model, 'running')
  returning id into new_id;

  return query select true, null::text, 0, new_id;
end;
$$;


/** يحسم تشغيلًا. مقيّد بصف المستخدم وبالحالة 'running' فلا يُعاد كتابة سجل محسوم. */
create or replace function public.finish_agent_run(
  p_run_id            uuid,
  p_status            text,
  p_steps             integer default 0,
  p_tool_calls        jsonb   default '[]'::jsonb,
  p_prompt_tokens     integer default null,
  p_completion_tokens integer default null,
  p_total_tokens      integer default null,
  p_duration_ms       integer default null,
  p_error_code        text    default null,
  p_injection_flags   integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_status not in ('success', 'error', 'aborted') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  update public.agent_runs
     set status            = p_status,
         steps             = greatest(coalesce(p_steps, 0), 0),
         tool_calls        = coalesce(p_tool_calls, '[]'::jsonb),
         tool_call_count   = coalesce(jsonb_array_length(p_tool_calls), 0),
         prompt_tokens     = p_prompt_tokens,
         completion_tokens = p_completion_tokens,
         total_tokens      = p_total_tokens,
         duration_ms       = p_duration_ms,
         error_code        = left(p_error_code, 40),
         injection_flags   = greatest(coalesce(p_injection_flags, 0), 0),
         finished_at       = now()
   where id = p_run_id and user_id = uid and status = 'running';
end;
$$;

revoke all on function public.begin_agent_run(text, uuid) from public, anon;
grant execute on function public.begin_agent_run(text, uuid) to authenticated;
revoke all on function public.finish_agent_run(uuid, text, integer, jsonb, integer, integer, integer, integer, text, integer)
  from public, anon;
grant execute on function public.finish_agent_run(uuid, text, integer, jsonb, integer, integer, integer, integer, text, integer)
  to authenticated;


-- =============================================================================
-- 3) أدوات الوكيل — قراءة فقط، بصلاحيات المستدعي
--
-- ⚠️ `security invoker` في كل دالة أدناه ليس تفصيلًا: هو الضمان الوحيد الذي
--    يجعل أثر حقن ناجح محدودًا سلفًا. أي تحويل إلى security definer يفتح
--    مسار تجاوز كامل لـRLS.
-- =============================================================================

create extension if not exists pg_trgm;

-- فهرس تشابه للبحث العربي: الجذور والتصريفات لا يلتقطها البحث النصي الحرفي.
create index if not exists correspondences_trgm_idx
  on public.correspondences using gin ((coalesce(subject,'') || ' ' || coalesce(body,'')) gin_trgm_ops);


/**
 * بحث في المراسلات المرئية للمستخدم.
 *
 * يعيد **مقتطفًا لا النص الكامل** عن قصد: يقلّص سطح الحقن (نص أقل غير موثوق
 * يدخل سياق النموذج) ويوفّر رموزًا. النص الكامل يُطلب صراحةً بـget عند الحاجة.
 */
create or replace function public.agent_search_correspondence(
  p_query     text,
  p_direction text default null,
  p_limit     integer default 8
)
returns table (
  id                uuid,
  reference_number  text,
  subject           text,
  snippet           text,
  direction         text,
  current_status    text,
  created_at        timestamptz,
  relevance         real
)
language sql
stable
security invoker            -- ⚠️ إلزامي: RLS تسري كما تسري على الواجهة
set search_path = public
as $$
  select
    c.id,
    c.reference_number,
    c.subject,
    left(regexp_replace(coalesce(c.body, ''), '\s+', ' ', 'g'), 400) as snippet,
    c.direction::text,
    c.current_status::text,
    c.created_at,
    similarity(coalesce(c.subject,'') || ' ' || coalesce(c.body,''), coalesce(p_query, '')) as relevance
  from public.correspondences c
  where coalesce(p_query, '') <> ''
    and (p_direction is null or c.direction::text = p_direction)
    and (
      coalesce(c.subject,'') || ' ' || coalesce(c.body,'') ilike '%' || p_query || '%'
      or similarity(coalesce(c.subject,'') || ' ' || coalesce(c.body,''), p_query) > 0.08
      or coalesce(c.reference_number,'') ilike '%' || p_query || '%'
    )
  order by relevance desc, c.created_at desc
  limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;


/** مراسلة واحدة بنصها الكامل. RLS تحدد ما إذا كان الصف مرئيًا أصلًا. */
create or replace function public.agent_get_correspondence(p_id uuid)
returns table (
  id                uuid,
  reference_number  text,
  subject           text,
  body              text,
  direction         text,
  current_status    text,
  sender            text,
  recipient         text,
  due_at            timestamptz,
  created_at        timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select c.id, c.reference_number, c.subject, c.body, c.direction::text,
         c.current_status::text, c.sender, c.recipient, c.due_at, c.created_at
  from public.correspondences c
  where c.id = p_id
$$;


/** المراسلات المرتبطة: الأصل، الردود، والروابط الصريحة. */
create or replace function public.agent_get_related(p_id uuid)
returns table (
  id       uuid,
  subject  text,
  relation text
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.id, p.subject, 'parent'::text
  from public.correspondences c join public.correspondences p on p.id = c.parent_id
  where c.id = p_id
  union all
  select ch.id, ch.subject, 'reply'::text
  from public.correspondences ch where ch.parent_id = p_id
  union all
  select other.id, other.subject, l.kind
  from public.correspondence_links l
  join public.correspondences other
    on other.id = case when l.from_id = p_id then l.to_id else l.from_id end
  where l.from_id = p_id or l.to_id = p_id
  limit 20
$$;


/** بحث في القوالب المتاحة. */
create or replace function public.agent_search_templates(p_query text, p_limit integer default 5)
returns table (id uuid, title text, description text, body text)
language sql
stable
security invoker
set search_path = public
as $$
  select t.id,
         coalesce(nullif(t.title_ar, ''), t.title_en),
         t.description_ar,
         left(coalesce(nullif(t.body_ar, ''), t.body_en), 1500)
  from public.templates t
  where coalesce(p_query, '') = ''
     or coalesce(t.title_ar,'') || ' ' || coalesce(t.description_ar,'') || ' ' || coalesce(t.body_ar,'')
        ilike '%' || p_query || '%'
  limit least(greatest(coalesce(p_limit, 5), 1), 10)
$$;


/** بحث في قاموس العبارات المؤسسية. */
create or replace function public.agent_search_dictionary(p_query text, p_limit integer default 6)
returns table (phrase text, meaning text, when_to_use text, category text)
language sql
stable
security invoker
set search_path = public
as $$
  select d.phrase, d.meaning, d.when_to_use, d.category
  from public.dictionary_entries d
  where coalesce(p_query, '') = ''
     or coalesce(d.phrase,'') || ' ' || coalesce(d.meaning,'') || ' ' || coalesce(d.when_to_use,'')
        ilike '%' || p_query || '%'
  limit least(greatest(coalesce(p_limit, 6), 1), 12)
$$;


/** ما يتطلب إجراءً من المستخدم — الإحالات وطوابير سير العمل. */
create or replace function public.agent_list_my_work()
returns table (
  kind              text,
  correspondence_id uuid,
  subject           text,
  detail            text,
  due_at            timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select 'referral'::text, r.correspondence_id, c.subject, r.instruction_key, r.due_at
  from public.referrals r
  join public.correspondences c on c.id = r.correspondence_id
  where r.status <> 'closed'
    and (r.to_user_id = auth.uid() or public.is_referral_target(r.id))
  union all
  select 'queue'::text, c.id, c.subject, c.current_status::text, c.due_at
  from public.correspondences c
  where c.current_status in ('in_review', 'in_approval', 'approved', 'returned')
  limit 40
$$;


do $$
declare fn text;
begin
  foreach fn in array array[
    'public.agent_search_correspondence(text, text, integer)',
    'public.agent_get_correspondence(uuid)',
    'public.agent_get_related(uuid)',
    'public.agent_search_templates(text, integer)',
    'public.agent_search_dictionary(text, integer)',
    'public.agent_list_my_work()'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;
