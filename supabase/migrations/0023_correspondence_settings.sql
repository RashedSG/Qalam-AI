-- =============================================================================
-- قلم | QALAM — إعدادات المراسلة المؤسسية
--   مستويات التصنيف · صيغة أرقام المراسلات
--
-- ⚠️ لماذا هذه الهجرة قبل الشاشة؟
--    الجدولان كانا مكتوبين من المتصفح مباشرة عبر RLS (`organization.manage`).
--    والتحكم في *من* يكتب كان سليمًا، لكن *ماذا* يكتب لم يكن محروسًا. ومسؤولٌ
--    يضبط إعدادًا في شاشة هو بالضبط من يُشعل المخاطر الثلاث أدناه.
-- =============================================================================


-- =============================================================================
-- 1) الخطر الأول: صيغة بلا {SEQ} تُنتج رقمًا واحدًا لكل المراسلات
--
-- `issue_reference_number` تستبدل الرموز استبدالًا نصيًّا. فصيغة مثل
-- '{ORG}/{YYYY}' — لا خطأ فيها ظاهرًا — تعطي كل مراسلات السنة **الرقم نفسه**.
-- وفي سجل مراسلات رسمي هذا أسوأ من تعطّل النظام: أرقام مكرّرة في وثائق صادرة.
-- والرمز المجهول ({FOO}) يبقى حرفيًّا في الرقم.
-- =============================================================================

/** يفحص صيغة رقم المراسلة ويعيد قائمة المشكلات (فارغة = سليمة). */
create or replace function public.validate_reference_format(p_format text)
returns text[]
language plpgsql
immutable
set search_path = public
as $$
declare
  problems text[] := '{}';
  token    text;
  allowed  text[] := array['{ORG}', '{UNIT}', '{DIR}', '{YYYY}', '{YY}', '{MM}', '{SEQ}'];
begin
  if coalesce(btrim(coalesce(p_format, '')), '') = '' then
    return array['empty'];
  end if;

  if length(p_format) > 120 then
    problems := problems || 'too_long'::text;
  end if;

  -- بلا تسلسل لا تمييز بين مراسلتين.
  if position('{SEQ}' in p_format) = 0 then
    problems := problems || 'missing_seq'::text;
  end if;

  for token in
    select distinct (regexp_matches(p_format, '\{[A-Za-z0-9_]*\}', 'g'))[1]
  loop
    if not (token = any (allowed)) then
      problems := problems || ('unknown_placeholder:' || token)::text;
    end if;
  end loop;

  return problems;
end;
$$;

grant execute on function public.validate_reference_format(text) to authenticated;

-- قيدٌ على الجدول نفسه، فلا تمرّ صيغة فاسدة ولو كُتبت بغير الدالة أدناه.
do $$
declare
  bad integer;
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'reference_policies_format_check'
      and conrelid = 'public.reference_number_policies'::regclass
  ) then
    return;
  end if;

  -- ⚠️ يُتحقَّق من البيانات قبل التشديد: قيدٌ يفشل عند الترقية أسوأ من غيابه.
  select count(*) into bad
  from public.reference_number_policies
  where cardinality(public.validate_reference_format(format)) > 0;

  if bad > 0 then
    raise notice
      'skipping reference_policies_format_check: % policy row(s) have an invalid format. '
      'Fix them in the organization settings screen, then re-run this migration.', bad;
    return;
  end if;

  alter table public.reference_number_policies
    add constraint reference_policies_format_check
    check (cardinality(public.validate_reference_format(format)) = 0);
end $$;


/**
 * معاينة الصيغة دون استهلاك رقم.
 *
 * تصحيحان: كانت تُغفل {YY} فتظهر حرفيًّا في المعاينة بينما يستبدلها المُصدِر
 * فعلًا — أي أن المعاينة كانت تكذب. وكانت موسومة immutable وهي تنادي now()،
 * وذلك وسمٌ خاطئ يسمح بطيّ القيمة إلى ثابت.
 */
create or replace function public.preview_reference_format(p_format text, p_padding integer default 4)
returns text
language sql
stable
set search_path = public
as $$
  select replace(replace(replace(replace(replace(replace(replace(
    coalesce(p_format, ''),
    '{ORG}', 'MOF'), '{UNIT}', 'FIN'), '{DIR}', 'OUT'),
    '{YYYY}', to_char(now(), 'YYYY')), '{YY}', to_char(now(), 'YY')),
    '{MM}', to_char(now(), 'MM')),
    '{SEQ}', lpad('1', least(greatest(coalesce(p_padding, 4), 1), 10), '0'))
$$;


-- =============================================================================
-- 2) الخطر الثاني: تغيير نطاق العدّاد يُعيد الترقيم إلى ١ فيصطدم بما صدر
--
-- مفتاح النطاق يُشتق من أعلام السياسة (per_unit, per_direction, reset_yearly).
-- فإن أطفأ المسؤول per_unit بعد إصدار ٤٢ مراسلة في نطاق 'OUT|FIN|2026'، صار
-- النطاق 'OUT|ALL|2026' — عدّادٌ جديد يبدأ من ١، فيُنتج رقمًا صدر فعلًا.
--
-- الفهرس الفريد على (organization_id, reference_number) يمنع الكتابة، لكنه
-- يمنعها **بخطأ غامض يُفشل الإصدار** لا بحلّ. فالمعالجة أن يتعافى المُصدِر:
-- عند التصادم يأخذ الرقم التالي ويعيد المحاولة. وهذا يعالج كل أسباب التصادم
-- لا هذا السبب وحده — تعديل عدّاد يدويًّا، أو استعادة نسخة احتياطية.
-- =============================================================================
create or replace function public.issue_reference_number(p_correspondence_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid         uuid := auth.uid();
  row_data    record;
  policy      record;
  unit_code   text := 'GEN';
  org_code    text := 'ORG';
  dir_code    text;
  v_scope_key text;
  next_seq    bigint;
  result      text;
  attempts    integer := 0;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select c.*, o.code as org_code, u.code as unit_code
    into row_data
  from public.correspondences c
  join public.organizations o on o.id = c.organization_id
  left join public.org_units u on u.id = coalesce(
    c.owner_unit_id, public.owner_unit(c.organization_id, c.user_id))
  where c.id = p_correspondence_id;

  if row_data is null then
    raise exception 'correspondence not found' using errcode = 'P0002';
  end if;
  if row_data.organization_id is null then
    raise exception 'correspondence has no organization' using errcode = '22023';
  end if;

  -- الرقم الصادر نهائي. إعادة الإصدار تعني رقمين لمراسلة واحدة في السجلات.
  if row_data.reference_number is not null then
    return row_data.reference_number;
  end if;

  if row_data.user_id <> uid
     and not public.has_permission('correspondence.issue', row_data.organization_id) then
    raise exception 'not permitted to issue a reference number' using errcode = '42501';
  end if;

  select * into policy
  from public.reference_number_policies
  where organization_id = row_data.organization_id
    and is_active = true
    and (direction = row_data.direction or direction is null)
  order by (direction is not null) desc   -- الأخص أولًا
  limit 1;

  if policy is null then
    raise exception 'no active reference number policy' using errcode = 'P0002';
  end if;

  org_code  := coalesce(nullif(row_data.org_code, ''), 'ORG');
  unit_code := coalesce(nullif(row_data.unit_code, ''), 'GEN');
  dir_code  := case row_data.direction
                 when 'incoming' then 'IN'
                 when 'outgoing' then 'OUT'
                 else 'INT'
               end;

  -- مفتاح النطاق يحدد أي عدّاد يُستخدم. عناصره تأتي من السياسة وحدها.
  v_scope_key := concat_ws('|',
    case when policy.per_direction then dir_code else 'ALL' end,
    case when policy.per_unit      then unit_code else 'ALL' end,
    case when policy.reset_yearly  then to_char(now(), 'YYYY') else 'ALL' end
  );

  -- حلقة التعافي من التصادم. الحدّ ٥٠ محاولة: ما بعدها خللٌ في الإعداد لا
  -- تصادمٌ عارض، والدوران بلا حدّ يُخفي الخلل بدل أن يُظهره.
  loop
    attempts := attempts + 1;

    -- ذرّي: لا SELECT ثم UPDATE. الزيادة والقراءة عملية واحدة.
    insert into public.reference_number_counters as ctr (organization_id, scope_key, seq)
    values (row_data.organization_id, v_scope_key, 1)
    on conflict (organization_id, scope_key)
      do update set seq = ctr.seq + 1, updated_at = now()
    returning ctr.seq into next_seq;

    result := policy.format;
    result := replace(result, '{ORG}',  org_code);
    result := replace(result, '{UNIT}', unit_code);
    result := replace(result, '{DIR}',  dir_code);
    result := replace(result, '{YYYY}', to_char(now(), 'YYYY'));
    result := replace(result, '{YY}',   to_char(now(), 'YY'));
    result := replace(result, '{MM}',   to_char(now(), 'MM'));
    result := replace(result, '{SEQ}',  lpad(next_seq::text, policy.seq_padding, '0'));

    exit when not exists (
      select 1 from public.correspondences
      where organization_id = row_data.organization_id
        and reference_number = result
    );

    if attempts >= 50 then
      raise exception
        'could not allocate a unique reference number after % attempts (scope %)', attempts, v_scope_key
        using errcode = '23505';
    end if;
  end loop;

  -- راية محلية بالمعاملة تُخبر حارس العمود أن هذا التحديث من المسار المعتمد.
  perform set_config('qalam.issuing_reference', 'on', true);
  update public.correspondences
     set reference_number = result,
         issued_at = coalesce(issued_at, now())
   where id = p_correspondence_id;
  perform set_config('qalam.issuing_reference', 'off', true);

  perform public.record_audit(
    'correspondence.reference_issued', 'correspondence', p_correspondence_id,
    row_data.organization_id, null, null,
    jsonb_build_object('scope_key', v_scope_key, 'seq', next_seq, 'attempts', attempts)
  );

  return result;
end;
$$;


/** يضبط سياسة أرقام المراسلات العامة. يتحقّق، ويُسجّل، ويُنشئ السياسة إن غابت. */
create or replace function public.update_reference_policy(
  p_organization_id uuid,
  p_format          text,
  p_seq_padding     integer,
  p_reset_yearly    boolean,
  p_per_unit        boolean,
  p_per_direction   boolean
)
returns public.reference_number_policies
language plpgsql
security definer
set search_path = public
as $$
declare
  problems text[];
  existing public.reference_number_policies;
  saved    public.reference_number_policies;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.has_permission('organization.manage', p_organization_id) then
    raise exception 'not permitted to manage organization settings' using errcode = '42501';
  end if;

  problems := public.validate_reference_format(p_format);
  if cardinality(problems) > 0 then
    raise exception 'invalid reference format: %', array_to_string(problems, ', ')
      using errcode = '22023';
  end if;

  select * into existing
  from public.reference_number_policies
  where organization_id = p_organization_id and direction is null and is_active = true;

  if existing.id is null then
    insert into public.reference_number_policies
      (organization_id, direction, format, seq_padding, reset_yearly, per_unit, per_direction)
    values
      (p_organization_id, null, p_format, p_seq_padding, p_reset_yearly, p_per_unit, p_per_direction)
    returning * into saved;
  else
    update public.reference_number_policies
       set format = p_format,
           seq_padding = p_seq_padding,
           reset_yearly = p_reset_yearly,
           per_unit = p_per_unit,
           per_direction = p_per_direction,
           updated_at = now()
     where id = existing.id
    returning * into saved;
  end if;

  perform public.record_audit(
    'reference_policy.updated', 'reference_number_policy', saved.id, p_organization_id,
    case when existing.id is null then null else existing.format end,
    saved.format,
    jsonb_build_object(
      'seq_padding',   saved.seq_padding,
      'reset_yearly',  saved.reset_yearly,
      'per_unit',      saved.per_unit,
      'per_direction', saved.per_direction,
      -- تغيير النطاق يُنشئ عدّادًا جديدًا؛ يُسجَّل لأنه يفسّر فجوة الترقيم لاحقًا.
      'scope_changed', existing.id is not null and (
        existing.reset_yearly is distinct from saved.reset_yearly or
        existing.per_unit      is distinct from saved.per_unit or
        existing.per_direction is distinct from saved.per_direction
      )
    )
  );

  return saved;
end;
$$;

revoke all on function public.update_reference_policy(uuid, text, integer, boolean, boolean, boolean)
  from public, anon;
grant execute on function public.update_reference_policy(uuid, text, integer, boolean, boolean, boolean)
  to authenticated;


-- =============================================================================
-- 3) الخطر الثالث: تعديل مستوى تصنيف هو تعديل صلاحيات
--
-- تخفيض رتبة 'سري' من ٣ إلى ١ يكشف — في اللحظة نفسها — كل مراسلة سرية لكل
-- من تخليصه ١. لا إشعار ولا أثر. فهذا التعديل يجب أن يُسجَّل كما يُسجَّل منح
-- دور، وأن تعرف الواجهة حجم أثره قبل تنفيذه.
-- =============================================================================

/** المفتاح مُعرِّف ثابت. تغييره يُعيد كتابة تصنيف مراسلات صادرة عبر ON UPDATE CASCADE. */
create or replace function public.classification_key_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.key is distinct from old.key then
    raise exception 'classification level key is immutable (create a new level instead)'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists classification_key_immutable_trg on public.classification_levels;
create trigger classification_key_immutable_trg
  before update of key on public.classification_levels
  for each row execute function public.classification_key_immutable();

-- رتبتان متساويتان تعنيان مستويين لا يُفرّق بينهما التخليص — لبسٌ لا فائدة فيه.
--
-- ⚠️ القيد **مؤجَّل** (deferrable) عن قصد: إعادة الترتيب عمليةٌ على عدة صفوف
--    بطبعها، فتبديل مستويين يمرّ حتمًا بحالة وسيطة فيها رتبتان متساويتان.
--    قيدٌ فوريّ يجعل إعادة الترتيب مستحيلة — وهذا ما كشفه اختبار قبل أن
--    تُبنى الشاشة عليه.
do $$
declare
  dupes integer;
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'classification_levels_rank_key'
      and conrelid = 'public.classification_levels'::regclass
  ) then
    return;
  end if;

  -- نسخة سابقة من هذه الهجرة أنشأت فهرسًا فوريًّا بالاسم أدناه؛ يُزال ليحلّ
  -- محلّه القيد المؤجَّل. لا بيانات تُمسّ.
  drop index if exists public.classification_levels_rank_idx;

  select count(*) into dupes from (
    select organization_id, rank from public.classification_levels
    group by 1, 2 having count(*) > 1
  ) d;

  if dupes > 0 then
    raise notice
      'skipping classification_levels_rank_key: % duplicate rank(s) exist. '
      'Resolve them in the organization settings screen, then re-run this migration.', dupes;
    return;
  end if;

  alter table public.classification_levels
    add constraint classification_levels_rank_key
    unique (organization_id, rank) deferrable initially immediate;
end $$;


/**
 * يضيف مستوى تصنيف أو يعدّل اسمه/افتراضيّته.
 *
 * ⚠️ لا رتبة هنا عن قصد. الرتبة تعني «أيّهما أشدّ سرية»، وهي ترتيبٌ نسبي لا
 *    رقمٌ يُكتب. إدخالها يدويًّا يُنتج فجوات وتصادمات ولا يضيف معنى — فصار
 *    المستوى الجديد يُلحَق في الأعلى، وإعادة الترتيب لها دالتها أدناه.
 */
create or replace function public.upsert_classification_level(
  p_organization_id uuid,
  p_key             text,
  p_name_ar         text,
  p_name_en         text,
  p_is_default      boolean default false
)
returns public.classification_levels
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.classification_levels;
  saved    public.classification_levels;
  next_rank integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.has_permission('organization.manage', p_organization_id) then
    raise exception 'not permitted to manage organization settings' using errcode = '42501';
  end if;

  if p_key !~ '^[a-z][a-z0-9_]{1,30}$' then
    raise exception 'classification key must match ^[a-z][a-z0-9_]{1,30}$' using errcode = '22023';
  end if;
  if coalesce(btrim(coalesce(p_name_ar, '')), '') = '' then
    raise exception 'classification name is required' using errcode = '22023';
  end if;

  select * into existing
  from public.classification_levels
  where organization_id = p_organization_id and key = p_key;

  -- الافتراضي واحد لكل مؤسسة (فهرس جزئي فريد). يُرفع عن الآخرين أولًا في
  -- المعاملة نفسها، وإلا فشل التحديث بخطأ قيدٍ لا يفهمه المستخدم.
  if p_is_default then
    update public.classification_levels
       set is_default = false, updated_at = now()
     where organization_id = p_organization_id
       and is_default = true
       and key <> p_key;
  end if;

  if existing.id is null then
    select coalesce(max(rank), 0) + 1 into next_rank
    from public.classification_levels where organization_id = p_organization_id;

    if next_rank > 100 then
      raise exception 'too many classification levels' using errcode = '22023';
    end if;

    insert into public.classification_levels
      (organization_id, key, name_ar, name_en, rank, is_default)
    values
      (p_organization_id, p_key, btrim(p_name_ar), coalesce(btrim(p_name_en), ''), next_rank, p_is_default)
    returning * into saved;

    perform public.record_audit(
      'classification.created', 'classification_level', saved.id, p_organization_id,
      null, p_key, jsonb_build_object('rank', next_rank, 'is_default', p_is_default)
    );
  else
    update public.classification_levels
       set name_ar = btrim(p_name_ar),
           name_en = coalesce(btrim(p_name_en), ''),
           is_default = p_is_default,
           updated_at = now()
     where id = existing.id
    returning * into saved;

    if existing.name_ar is distinct from saved.name_ar
       or existing.name_en is distinct from saved.name_en
       or existing.is_default is distinct from saved.is_default then
      perform public.record_audit(
        'classification.updated', 'classification_level', saved.id, p_organization_id,
        existing.name_ar, saved.name_ar, jsonb_build_object('key', p_key)
      );
    end if;
  end if;

  return saved;
end;
$$;

revoke all on function public.upsert_classification_level(uuid, text, text, text, boolean)
  from public, anon;
grant execute on function public.upsert_classification_level(uuid, text, text, text, boolean)
  to authenticated;

-- النسخة ذات الرتبة اليدوية تُزال حتى لا يبقى توقيعان يفعلان شيئين مختلفين.
drop function if exists public.upsert_classification_level(uuid, text, text, text, integer, boolean);


/**
 * يعيد ترتيب مستويات التصنيف: الأول أدنى سرية والأخير أشدّها.
 *
 * ⚠️ هذا تعديلُ صلاحيات لا تعديلَ عرض. رفعُ مستوى يحجب مراسلاتٍ كانت مرئية،
 *    وخفضُه يكشف ما كان محجوبًا — في اللحظة نفسها وبلا إشعار. فكل تغيير رتبة
 *    يُسجَّل منفردًا، مع اتجاه الأثر وعدد المراسلات المتأثرة.
 */
create or replace function public.reorder_classification_levels(
  p_organization_id uuid,
  p_keys            text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  total    integer;
  item     record;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.has_permission('organization.manage', p_organization_id) then
    raise exception 'not permitted to manage organization settings' using errcode = '42501';
  end if;

  select count(*) into total
  from public.classification_levels where organization_id = p_organization_id;

  -- الترتيب الجزئي يترك مستوياتٍ برتبٍ قديمة قد تصطدم. نطلب القائمة كاملة.
  if coalesce(cardinality(p_keys), 0) <> total then
    raise exception 'reorder must list all % classification level(s), got %',
      total, coalesce(cardinality(p_keys), 0) using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_keys) k
    where not exists (
      select 1 from public.classification_levels
      where organization_id = p_organization_id and key = k
    )
  ) then
    raise exception 'reorder references an unknown classification key' using errcode = '22023';
  end if;

  if (select count(distinct k) from unnest(p_keys) k) <> total then
    raise exception 'reorder contains a duplicate classification key' using errcode = '22023';
  end if;

  -- الحالة الوسيطة أثناء التبديل فيها رتبتان متساويتان حتمًا؛ القيد مؤجَّل
  -- ليُفحص عند إنهاء المعاملة لا عند كل صفّ.
  set constraints public.classification_levels_rank_key deferred;

  for item in
    select l.key, l.rank as old_rank, l.id, o.ord as new_rank
    from unnest(p_keys) with ordinality as o(key, ord)
    join public.classification_levels l
      on l.organization_id = p_organization_id and l.key = o.key
    where l.rank is distinct from o.ord
  loop
    update public.classification_levels
       set rank = item.new_rank, updated_at = now()
     where id = item.id;

    perform public.record_audit(
      'classification.rank_changed', 'classification_level', item.id, p_organization_id,
      item.old_rank::text, item.new_rank::text,
      jsonb_build_object(
        'key', item.key,
        'widens_access', item.new_rank < item.old_rank,
        'affected_correspondence', (
          select count(*) from public.correspondences
          where organization_id = p_organization_id and classification_key = item.key
        )
      )
    );
  end loop;
end;
$$;

revoke all on function public.reorder_classification_levels(uuid, text[]) from public, anon;
grant execute on function public.reorder_classification_levels(uuid, text[]) to authenticated;


/** يحذف مستوى تصنيف — برسالةٍ مفهومة إن كان مستعمَلًا أو كان الأخير. */
create or replace function public.delete_classification_level(
  p_organization_id uuid,
  p_key             text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target   public.classification_levels;
  in_use   integer;
  remaining integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.has_permission('organization.manage', p_organization_id) then
    raise exception 'not permitted to manage organization settings' using errcode = '42501';
  end if;

  select * into target
  from public.classification_levels
  where organization_id = p_organization_id and key = p_key;
  if target.id is null then
    raise exception 'classification level not found' using errcode = 'P0002';
  end if;

  -- المفتاح الأجنبي يمنع الحذف أصلًا؛ نمنعه هنا برسالةٍ تقول العدد، لأن
  -- «violates foreign key constraint» ليست رسالةً لمسؤول.
  select count(*) into in_use
  from public.correspondences
  where organization_id = p_organization_id and classification_key = p_key;

  if in_use > 0 then
    raise exception 'classification level % is used by % correspondence(s)', p_key, in_use
      using errcode = '23503';
  end if;

  -- مؤسسة بلا مستوى تصنيف لا تستطيع تسجيل وارد.
  select count(*) into remaining
  from public.classification_levels
  where organization_id = p_organization_id;

  if remaining <= 1 then
    raise exception 'an organization must keep at least one classification level'
      using errcode = '22023';
  end if;

  delete from public.classification_levels where id = target.id;

  perform public.record_audit(
    'classification.deleted', 'classification_level', target.id, p_organization_id,
    p_key, null, jsonb_build_object('rank', target.rank)
  );

  -- إن حُذف الافتراضي فلا افتراضي. يُرقّى الأدنى رتبةً بدل تركِ الحال معلّقًا.
  if target.is_default then
    update public.classification_levels
       set is_default = true, updated_at = now()
     where id = (
       select id from public.classification_levels
       where organization_id = p_organization_id
       order by rank asc limit 1
     );
  end if;
end;
$$;

revoke all on function public.delete_classification_level(uuid, text) from public, anon;
grant execute on function public.delete_classification_level(uuid, text) to authenticated;


/**
 * أثر تغيير رتبة مستوى قبل تنفيذه: كم مراسلة عليه، وكم عضوًا يراها الآن،
 * وكم سيراها بالرتبة الجديدة. `security invoker` — لا تكشف ما لا يُرى.
 */
create or replace function public.classification_impact(
  p_organization_id uuid,
  p_key             text,
  p_new_rank        integer
)
returns table (
  correspondence_count bigint,
  members_now          bigint,
  members_after        bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    (select count(*) from public.correspondences c
      where c.organization_id = p_organization_id and c.classification_key = p_key),
    (select count(*) from public.memberships m
      join public.classification_levels l
        on l.organization_id = p_organization_id and l.key = p_key
      where m.organization_id = p_organization_id and m.status = 'active'
        and m.clearance_rank >= l.rank),
    (select count(*) from public.memberships m
      where m.organization_id = p_organization_id and m.status = 'active'
        and m.clearance_rank >= p_new_rank)
$$;

grant execute on function public.classification_impact(uuid, text, integer) to authenticated;


-- =============================================================================
-- 4) نظافة: لا دالة `security definer` متاحة لـanon إلا التحقق العلني
--
-- `audit_actor()` تعيد auth.uid() فحسب، فهي غير مؤذية — لكن القاعدة تبقى:
-- ما يتجاوز RLS لا يُترك مفتوحًا لمن لا حساب له. وفحصٌ يُظهر دائمًا فشلًا
-- واحدًا «معروفًا أنه حميد» يُدرّب القارئ على تجاهل الفحص كلّه.
-- =============================================================================
revoke all on function public.audit_actor() from public, anon;
grant execute on function public.audit_actor() to authenticated;
