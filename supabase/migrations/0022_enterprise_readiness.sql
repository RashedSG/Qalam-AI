-- =============================================================================
-- قلم | QALAM — Phase 7: الجاهزية المؤسسية
--   التقارير · التحقق العلني · حوكمة القوالب · الوثيقة النهائية
-- =============================================================================


-- =============================================================================
-- 1) التقارير
--
-- ⚠️ مبدأ: التقرير تجميعٌ لما يراه القارئ، لا استعلامٌ يتجاوز الرؤية.
--    الدوال أدناه `security invoker` فتسري عليها RLS تلقائيًا: من يرى وحدته
--    يحصل على أرقام وحدته، ومن يرى المؤسسة يحصل على أرقامها. لا منطق صلاحيات
--    مكرّر هنا — والتكرار هو ما يُنتج تسريبًا في التقارير عادةً.
-- =============================================================================

/** ملخّص المراسلات: العدد بحسب الاتجاه والحالة، والمتأخر، ومتوسط زمن المعالجة. */
create or replace function public.report_correspondence_summary(
  p_organization_id uuid,
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  direction        text,
  current_status   text,
  total            bigint,
  overdue          bigint,
  avg_hours_to_issue numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.direction::text,
    c.current_status::text,
    count(*),
    count(*) filter (where c.due_at is not null and c.due_at < now()
                       and c.current_status not in ('issued', 'closed', 'archived')),
    round(avg(extract(epoch from (c.issued_at - c.created_at)) / 3600.0) filter (where c.issued_at is not null), 1)
  from public.correspondences c
  where c.organization_id = p_organization_id
    and (p_from is null or c.created_at >= p_from)
    and (p_to   is null or c.created_at <= p_to)
  group by c.direction, c.current_status
$$;


/** التوزيع على الوحدات التنظيمية. */
create or replace function public.report_by_unit(
  p_organization_id uuid,
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns table (
  unit_id   uuid,
  unit_name text,
  incoming  bigint,
  outgoing  bigint,
  overdue   bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    u.id,
    u.name_ar,
    count(*) filter (where c.direction = 'incoming'),
    count(*) filter (where c.direction = 'outgoing'),
    count(*) filter (where c.due_at is not null and c.due_at < now()
                       and c.current_status not in ('issued', 'closed', 'archived'))
  from public.correspondences c
  join public.org_units u on u.id = c.owner_unit_id
  where c.organization_id = p_organization_id
    and (p_from is null or c.created_at >= p_from)
    and (p_to   is null or c.created_at <= p_to)
  group by u.id, u.name_ar
  order by count(*) desc
$$;


/** أكثر الجهات الخارجية مراسلةً. */
create or replace function public.report_by_external_entity(
  p_organization_id uuid,
  p_limit integer default 10
)
returns table (entity text, incoming bigint, outgoing bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    entity,
    count(*) filter (where direction = 'incoming'),
    count(*) filter (where direction = 'outgoing')
  from (
    select
      nullif(trim(coalesce(nullif(c.sender_organization, ''), nullif(c.recipient_organization, ''),
                           nullif(c.sender, ''), c.recipient)), '') as entity,
      c.direction
    from public.correspondences c
    where c.organization_id = p_organization_id
  ) rows
  where entity is not null
  group by entity
  order by count(*) desc
  limit least(greatest(coalesce(p_limit, 10), 1), 50)
$$;


/** أداء الإحالات: المفتوحة والمتأخرة ومتوسط زمن الاستجابة. */
create or replace function public.report_referrals(p_organization_id uuid)
returns table (
  status         text,
  total          bigint,
  overdue        bigint,
  avg_hours_to_respond numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.status,
    count(*),
    count(*) filter (where r.due_at is not null and r.due_at < now() and r.status = 'pending'),
    round(avg(extract(epoch from (r.responded_at - r.created_at)) / 3600.0)
          filter (where r.responded_at is not null), 1)
  from public.referrals r
  where r.organization_id = p_organization_id
  group by r.status
$$;


/**
 * استخدام الذكاء الاصطناعي على مستوى المؤسسة.
 *
 * ⚠️ هذه الدالة الوحيدة هنا `security definer`: جدولا الاستخدام مقيّدان بصاحبهما
 *    (auth.uid() = user_id) عن قصد، فالتجميع المؤسسي يتطلب تجاوزًا. لذلك
 *    تفحص الصلاحية صراحةً قبل أي قراءة، ولا تعيد إلا أعدادًا مُجمَّعة —
 *    لا صفوفًا ولا معرّفات مستخدمين ولا مهامّ بعينها.
 */
create or replace function public.report_ai_usage(
  p_organization_id uuid,
  p_days integer default 30
)
returns table (
  day            date,
  simple_requests bigint,
  agent_runs      bigint,
  total_tokens    bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission('audit.view', p_organization_id) then
    raise exception 'not permitted to view organization AI usage' using errcode = '42501';
  end if;

  return query
  with members as (
    select user_id from public.memberships
    where organization_id = p_organization_id and status = 'active'
  ),
  window_days as (
    select generate_series(
      (current_date - (least(greatest(coalesce(p_days, 30), 1), 365) - 1))::date,
      current_date, interval '1 day')::date as day
  )
  select
    w.day,
    coalesce(s.n, 0),
    coalesce(a.n, 0),
    coalesce(s.tokens, 0) + coalesce(a.tokens, 0)
  from window_days w
  -- الأعمدة مُؤهَّلة باسم الجدول: عمود الإرجاع total_tokens يحمل نفس الاسم،
  -- وPostgreSQL يعتبر الإشارة غير المؤهَّلة غامضة داخل الدالة.
  left join (
    select m.created_at::date as day, count(*) as n, coalesce(sum(m.total_tokens), 0) as tokens
    from public.ai_requests_metadata m
    where m.user_id in (select user_id from members) and m.status = 'success'
    group by 1
  ) s on s.day = w.day
  left join (
    select r.created_at::date as day, count(*) as n, coalesce(sum(r.total_tokens), 0) as tokens
    from public.agent_runs r
    where r.user_id in (select user_id from members) and r.status = 'success'
    group by 1
  ) a on a.day = w.day
  order by w.day;
end;
$$;


do $$
declare fn text;
begin
  foreach fn in array array[
    'public.report_correspondence_summary(uuid, timestamptz, timestamptz)',
    'public.report_by_unit(uuid, timestamptz, timestamptz)',
    'public.report_by_external_entity(uuid, integer)',
    'public.report_referrals(uuid)',
    'public.report_ai_usage(uuid, integer)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;


-- =============================================================================
-- 2) التحقق العلني من الوثيقة
--
-- ⚠️ أخطر سطح في المرحلة: نقطة يصلها من لا حساب له.
--
-- ثلاثة قيود تجعلها آمنة:
--   ١) رمز عشوائي ١٢٨ بت لا معرّف المراسلة — فلا يُعدّ ولا يُخمَّن.
--   ٢) لا تعيد موضوعًا ولا نصًّا ولا مرسِلًا ولا مستقبِلًا ولا تصنيفًا.
--      تجيب سؤالًا واحدًا: هل هذا الرقم صادرٌ فعلًا من هذه المؤسسة ومتى؟
--   ٣) لا تعمل إلا على المراسلات المُصدَرة. المسودة لا وجود لها علنًا.
-- =============================================================================
alter table public.correspondences add column if not exists verification_token text;

create unique index if not exists correspondences_verification_token_idx
  on public.correspondences (verification_token) where verification_token is not null;

/** يُولّد رمز تحقق عند الإصدار. عشوائي وغير قابل للتخمين. */
create or replace function public.ensure_verification_token()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.current_status = 'issued' and new.verification_token is null then
    -- ٢٤ بايت = ١٩٢ بت. تعداد المساحة غير ممكن عمليًا.
    new.verification_token := encode(gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;

drop trigger if exists ensure_verification_token_trg on public.correspondences;
create trigger ensure_verification_token_trg
  before insert or update of current_status on public.correspondences
  for each row execute function public.ensure_verification_token();


/**
 * التحقق العلني. متاحة لغير المسجّلين — وهي الشيء الوحيد كذلك في النظام.
 *
 * ما تعيده مقصود بحرفيته: رقم المراسلة، تاريخ الإصدار، اسم المؤسسة.
 * لا شيء غير ذلك — ولا حتى وجود المراسلة يُكشف لرمز خاطئ: تعيد لا شيء.
 */
create or replace function public.verify_correspondence(p_token text)
returns table (
  reference_number  text,
  issued_at         timestamptz,
  organization_name text,
  organization_name_en text
)
language sql
stable
security definer
set search_path = public
as $$
  select c.reference_number, c.issued_at, o.name, o.name_en
  from public.correspondences c
  join public.organizations o on o.id = c.organization_id
  where c.verification_token = p_token
    and coalesce(p_token, '') <> ''
    and length(p_token) = 48          -- طول الرمز المولَّد بالضبط
    and c.current_status in ('issued', 'closed', 'archived')
    and c.reference_number is not null
  limit 1
$$;

-- الاستثناء الوحيد لقاعدة «لا شيء لـanon». مقصور على هذه الدالة وحدها،
-- ومخرجاتها ثابتة الشكل ولا تحمل محتوى.
revoke all on function public.verify_correspondence(text) from public;
grant execute on function public.verify_correspondence(text) to anon, authenticated;


-- =============================================================================
-- 3) حوكمة القوالب المؤسسية
--
-- القالب المؤسسي يُنشر على الجميع، فيحتاج دورة اعتماد كالمراسلة.
-- قوالب المستخدم الشخصية لا تتأثر: تبقى 'draft' ويراها صاحبها كما كان.
-- =============================================================================
do $$ begin
  create type public.qalam_template_status as enum ('draft', 'in_review', 'approved', 'published', 'retired');
exception when duplicate_object then null; end $$;

alter table public.templates
  add column if not exists status public.qalam_template_status not null default 'draft';
alter table public.templates add column if not exists published_at timestamptz;
alter table public.templates add column if not exists published_by uuid;
alter table public.templates add column if not exists retired_at   timestamptz;

create index if not exists templates_status_idx
  on public.templates (organization_id, status) where organization_id is not null;

-- قوالب النظام منشورة بطبيعتها.
update public.templates set status = 'published'
where is_system = true and status = 'draft';

/**
 * ينقل قالبًا مؤسسيًا في دورة الحوكمة.
 * يتطلب templates.manage، ولا يمس قوالب المستخدم الشخصية ولا قوالب النظام.
 */
create or replace function public.transition_template(p_template_id uuid, p_to_status text)
returns public.qalam_template_status
language plpgsql
security definer
set search_path = public
as $$
declare
  uid    uuid := auth.uid();
  row_data record;
  target public.qalam_template_status;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  begin
    target := p_to_status::public.qalam_template_status;
  exception when others then
    raise exception 'unknown template status %', p_to_status using errcode = '22023';
  end;

  select * into row_data from public.templates where id = p_template_id;
  if row_data is null then
    raise exception 'template not found' using errcode = 'P0002';
  end if;
  if row_data.is_system then
    raise exception 'system templates are managed by the platform' using errcode = '42501';
  end if;
  if row_data.organization_id is null then
    raise exception 'personal templates do not enter governance' using errcode = '22023';
  end if;
  if not public.has_permission('templates.manage', row_data.organization_id) then
    raise exception 'not permitted to manage templates' using errcode = '42501';
  end if;

  update public.templates
     set status = target,
         published_at = case when target = 'published' then now() else published_at end,
         published_by = case when target = 'published' then uid else published_by end,
         retired_at   = case when target = 'retired'   then now() else retired_at end
   where id = p_template_id;

  perform public.record_audit(
    'template.' || target::text, 'template', p_template_id, row_data.organization_id,
    row_data.status::text, target::text, '{}'::jsonb
  );

  return target;
end;
$$;

revoke all on function public.transition_template(uuid, text) from public, anon;
grant execute on function public.transition_template(uuid, text) to authenticated;

-- القوالب المؤسسية غير المنشورة لا تظهر لعامة الأعضاء.
drop policy if exists "templates_select" on public.templates;
create policy "templates_select" on public.templates
  for select to authenticated
  using (
    is_system = true
    or user_id = (select auth.uid())
    or (
      organization_id is not null
      and (
        status = 'published'
        or (select public.has_permission('templates.manage', organization_id))
      )
    )
  );


-- =============================================================================
-- 4) الأداء — فهارس للاستعلامات التي أضافتها المراحل الأخيرة
-- =============================================================================
create index if not exists correspondences_issued_idx
  on public.correspondences (organization_id, issued_at desc) where issued_at is not null;
create index if not exists correspondences_external_idx
  on public.correspondences (organization_id, sender_organization)
  where sender_organization <> '';
create index if not exists referrals_responded_idx
  on public.referrals (organization_id, responded_at) where responded_at is not null;
create index if not exists agent_runs_day_idx on public.agent_runs (user_id, created_at);
create index if not exists ai_requests_day_idx on public.ai_requests_metadata (user_id, created_at);


-- =============================================================================
-- 4.5) إصلاح أمني: التصنيف المجهول كان يفتح لا يغلق
--
-- ⚠️ كشفه اختبارٌ في المرحلة السابعة بعد تقويته. النسخة السابقة من
--    can_access_row كانت تقول:
--
--      if needed_rank is not null then ... تحقّق من التخليص ... end if;
--
--    أي أن مفتاح تصنيف لا يقابله صفٌّ في classification_levels يمرّ بلا
--    فحصٍ إطلاقًا. وليس هذا فرضًا نظريًا: لا مفتاح أجنبي على العمود، فأي
--    خطأ إملائي — أو حذف مستوى تصنيف بعد استعماله — يحوّل مراسلةً بالغة
--    السرية إلى مراسلةٍ بلا حاجز تخليص، بصمت.
--
--    القاعدة الصحيحة في نظام تصنيف: ما لا نعرفه نمنعه. المالك وحده يبقى
--    يرى صفّه (يُفحص قبل هذا السطر) — وهو الاستثناء الذي لا غنى عنه حتى
--    لا تُفقد مراسلةٌ بمفتاحٍ خاطئ إلى الأبد.
-- =============================================================================
create or replace function public.can_access_row(
  p_permission     text,
  p_organization_id uuid,
  p_owner_id       uuid,
  p_owner_unit_id  uuid,
  p_classification text
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
  needed_rank  integer;
begin
  if uid is null then return false; end if;
  -- المالك يصل دائمًا إلى صفوفه، ولا يحجبه تصنيفه هو.
  if p_owner_id = uid then return true; end if;
  if p_organization_id is null then return false; end if;

  scope := public.permission_scope(p_permission, p_organization_id);
  if scope is null then return false; end if;

  -- التخليص الأمني: حاجز مستقل عن النطاق ويُطبَّق قبله.
  if p_classification is not null then
    select rank into needed_rank
    from public.classification_levels
    where organization_id = p_organization_id and key = p_classification;

    -- مفتاح لا يقابله مستوى = تصنيف مجهول = منع. الفشل إلى الإغلاق.
    if needed_rank is null then return false; end if;

    select clearance_rank into my_clearance from public.my_membership(p_organization_id);
    if coalesce(my_clearance, 0) < needed_rank then return false; end if;
  end if;

  if scope = 'organization' then return true; end if;
  if scope = 'own' then return false; end if;

  select org_unit_id into my_unit from public.my_membership(p_organization_id);
  if my_unit is null or p_owner_unit_id is null then return false; end if;

  if scope = 'unit' then
    return my_unit = p_owner_unit_id;
  end if;

  select path into my_path    from public.org_units where id = my_unit;
  select path into owner_path from public.org_units where id = p_owner_unit_id;
  if my_path is null or owner_path is null then return false; end if;

  return owner_path = my_path or owner_path like my_path || '/%';
end;
$$;

-- والحاجز الثاني: تكاملٌ مرجعي يمنع كتابة مفتاح لا وجود له أصلًا.
-- المفتاح مركّب على (المؤسسة، المفتاح) فلا تستعير مؤسسةٌ تصنيف أخرى.
-- الصفوف الشخصية (organization_id فارغ) وغير المصنّفة لا يمسّها MATCH SIMPLE.
create unique index if not exists classification_levels_org_key_idx
  on public.classification_levels (organization_id, key);

do $$
declare
  bad_rows integer;
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'correspondences_classification_fk'
      and conrelid = 'public.correspondences'::regclass
  ) then
    return;
  end if;

  -- ⚠️ يُتحقَّق من البيانات قبل التشديد: قيدٌ يفشل عند الترقية أسوأ من غيابه.
  select count(*) into bad_rows
  from public.correspondences c
  where c.organization_id is not null
    and c.classification_key is not null
    and not exists (
      select 1 from public.classification_levels l
      where l.organization_id = c.organization_id and l.key = c.classification_key
    );

  if bad_rows > 0 then
    raise notice
      'skipping correspondences_classification_fk: % row(s) reference an unknown classification key. '
      'These rows are already denied to everyone but their owner by can_access_row. '
      'Fix them, then re-run this migration to add the constraint.', bad_rows;
    return;
  end if;

  alter table public.correspondences
    add constraint correspondences_classification_fk
    foreign key (organization_id, classification_key)
    references public.classification_levels (organization_id, key)
    on update cascade
    on delete restrict;
end $$;


-- =============================================================================
-- 5) البحث العربي والتصفية
--
-- «محمد» و«مُحَمَّد» و«محمّد» نصٌّ واحد في نظر من يبحث، وثلاثة نصوص مختلفة في
-- نظر ILIKE. فنُسوّي الطرفين قبل المقارنة: نحذف التشكيل والتطويل، ونوحّد
-- صور الألف والياء والتاء المربوطة والهمزات.
--
-- ⚠️ الدالة `security invoker`: RLS هي التي تقرّر ما يظهر. البحث لا يوسّع
--    رؤية أحد — يضيّقها فقط.
-- =============================================================================

/** تسوية النص العربي للمقارنة. IMMUTABLE ليصلح في فهرس دالّي. */
create or replace function public.qalam_normalize_ar(p_text text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public
as $$
  select lower(
    translate(
      regexp_replace(
        -- التشكيل والتطويل والعلامة العلوية الصغيرة.
        p_text, '[ً-ٰٟـ]', '', 'g'
      ),
      'أإآٱىةؤئ',
      'اااايهوي'
    )
  )
$$;

create index if not exists correspondences_search_idx
  on public.correspondences using gin (
    public.qalam_normalize_ar(
      coalesce(subject, '') || ' ' || coalesce(body, '') || ' ' ||
      coalesce(sender, '') || ' ' || coalesce(recipient, '') || ' ' ||
      coalesce(sender_organization, '') || ' ' || coalesce(recipient_organization, '')
    ) gin_trgm_ops
  );

create index if not exists correspondences_reference_idx
  on public.correspondences (organization_id, reference_number)
  where reference_number is not null;

/**
 * بحثٌ وتصفية على المراسلات. كل المعاملات اختيارية، وكل ما يُمرَّر يضيّق.
 * لا تتجاوز RLS: ما لا يراه المستخدم لا يظهر هنا مهما ضبط المرشّحات.
 */
create or replace function public.search_correspondence(
  p_organization_id uuid,
  p_direction       text default null,
  p_query           text default null,
  p_reference       text default null,
  p_party           text default null,
  p_status          text default null,
  p_classification  text default null,
  p_unit_id         uuid default null,
  p_from            timestamptz default null,
  p_to              timestamptz default null,
  p_overdue_only    boolean default false,
  p_include_archived boolean default false,
  p_limit           integer default 50
)
returns setof public.correspondences
language sql
stable
security invoker
set search_path = public
as $$
  select c.*
  from public.correspondences c
  where c.organization_id = p_organization_id
    and (p_direction is null or c.direction::text = p_direction)
    and (p_include_archived or c.is_archived = false)
    and (
      coalesce(p_query, '') = ''
      or public.qalam_normalize_ar(
           coalesce(c.subject, '') || ' ' || coalesce(c.body, '') || ' ' ||
           coalesce(c.sender, '') || ' ' || coalesce(c.recipient, '') || ' ' ||
           coalesce(c.sender_organization, '') || ' ' || coalesce(c.recipient_organization, '')
         ) like '%' || public.qalam_normalize_ar(p_query) || '%'
    )
    and (
      coalesce(p_reference, '') = ''
      or coalesce(c.reference_number, '') ilike '%' || p_reference || '%'
      or coalesce(c.external_reference_number, '') ilike '%' || p_reference || '%'
    )
    and (
      coalesce(p_party, '') = ''
      or public.qalam_normalize_ar(
           coalesce(c.sender, '') || ' ' || coalesce(c.sender_organization, '') || ' ' ||
           coalesce(c.recipient, '') || ' ' || coalesce(c.recipient_organization, '')
         ) like '%' || public.qalam_normalize_ar(p_party) || '%'
    )
    and (coalesce(p_status, '') = ''         or c.current_status::text = p_status)
    and (coalesce(p_classification, '') = '' or c.classification_key = p_classification)
    and (p_unit_id is null or c.owner_unit_id = p_unit_id)
    and (p_from is null or c.created_at >= p_from)
    and (p_to   is null or c.created_at <= p_to)
    and (not coalesce(p_overdue_only, false)
         or (c.due_at is not null
             and c.due_at < now()
             and c.current_status not in ('issued', 'closed', 'archived')))
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;

revoke all on function public.search_correspondence(uuid, text, text, text, text, text, text, uuid, timestamptz, timestamptz, boolean, boolean, integer) from public, anon;
grant execute on function public.search_correspondence(uuid, text, text, text, text, text, text, uuid, timestamptz, timestamptz, boolean, boolean, integer) to authenticated;


-- =============================================================================
-- منع الوصول المجهول — مع الاستثناء الوحيد المعلن أعلاه
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on public.app_settings              from public, anon, authenticated;
revoke all on public.signup_invites            from public, anon, authenticated;
revoke all on public.reference_number_counters from public, anon, authenticated;
revoke update (current_status) on public.correspondences from authenticated;
-- verify_correspondence تبقى الشيء الوحيد المتاح لـanon، وهي دالة لا جدول.
grant execute on function public.verify_correspondence(text) to anon;
