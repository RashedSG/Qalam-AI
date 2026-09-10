-- =============================================================================
-- قلم | QALAM — Phase 3 (ب): مولّد أرقام المراسلات
--
-- لا تنسيق مثبّت في الكود. كل مؤسسة تعرّف صيغتها ونطاق تسلسلها.
--
-- الذرّية: العدّاد يُزاد بـ `insert … on conflict do update … returning`،
-- وهي عملية واحدة ذرّية في PostgreSQL. لا SELECT ثم UPDATE — ذلك سباق
-- يُنتج رقمين متطابقين تحت التزامن.
-- =============================================================================


-- =============================================================================
-- 1) السياسة — الصيغة ونطاق التسلسل
-- =============================================================================
create table if not exists public.reference_number_policies (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- null = تنطبق على كل الاتجاهات ما لم توجد سياسة أخص
  direction       public.qalam_direction,
  /**
   * الرموز المتاحة:
   *   {ORG}    رمز المؤسسة
   *   {UNIT}   رمز الوحدة المالكة
   *   {DIR}    IN / OUT / INT
   *   {YYYY}   السنة الميلادية
   *   {YY}     آخر رقمين من السنة
   *   {MM}     الشهر
   *   {SEQ}    التسلسل (يُبطَّن بأصفار إلى seq_padding)
   */
  format          text not null default '{ORG}/{UNIT}/{DIR}/{YYYY}/{SEQ}',
  seq_padding     integer not null default 4,
  /** نطاق إعادة التصفير: العدّاد مستقل لكل تركيبة من هذه العناصر. */
  reset_yearly    boolean not null default true,
  per_unit        boolean not null default true,
  per_direction   boolean not null default true,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint reference_policies_padding_check check (seq_padding between 1 and 10)
);

-- فهرسان جزئيان بدل تعبير واحد: التحويل من enum إلى text غير immutable
-- فلا يصلح داخل فهرس. النتيجة نفسها — سياسة عامة واحدة وسياسة لكل اتجاه.
create unique index if not exists reference_policies_general_idx
  on public.reference_number_policies (organization_id)
  where is_active = true and direction is null;

create unique index if not exists reference_policies_direction_idx
  on public.reference_number_policies (organization_id, direction)
  where is_active = true and direction is not null;


-- =============================================================================
-- 2) العدّادات
-- =============================================================================
create table if not exists public.reference_number_counters (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  /** مفتاح النطاق المُركَّب — يُشتق من السياسة، مثال: 'OUT|FIN|2026' */
  scope_key       text not null,
  seq             bigint not null default 0,
  updated_at      timestamptz not null default now(),
  primary key (organization_id, scope_key)
);


/** يبذر سياسة افتراضية لمؤسسة. قابل لإعادة التنفيذ. */
create or replace function public.seed_reference_policy(p_organization_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.reference_number_policies (organization_id, direction)
  select p_organization_id, null
  where not exists (
    select 1 from public.reference_number_policies
    where organization_id = p_organization_id and direction is null
  );
$$;

revoke all on function public.seed_reference_policy(uuid) from public, anon, authenticated;

do $$
declare org record;
begin
  for org in select id from public.organizations loop
    perform public.seed_reference_policy(org.id);
  end loop;
end $$;


-- =============================================================================
-- 3) المولّد
-- =============================================================================

/**
 * يُصدر رقم مراسلة ويثبّته على الصف.
 *
 * • يتطلب correspondence.issue أو أن يكون المستدعي مالك الصف.
 * • لا يُعيد الإصدار لصف يحمل رقمًا — الرقم الصادر لا يُغيَّر.
 * • ذرّي: زيادة العدّاد وقراءته عملية واحدة، فلا يتكرر رقم تحت التزامن.
 */
create or replace function public.issue_reference_number(p_correspondence_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid        uuid := auth.uid();
  row_data   record;
  policy     record;
  unit_code  text := 'GEN';
  org_code   text := 'ORG';
  dir_code   text;
  v_scope_key text;
  next_seq   bigint;
  result     text;
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
    jsonb_build_object('scope_key', v_scope_key, 'seq', next_seq)
  );

  return result;
end;
$$;

revoke all on function public.issue_reference_number(uuid) from public, anon;
grant execute on function public.issue_reference_number(uuid) to authenticated;

/** معاينة الصيغة دون استهلاك رقم — للواجهة عند تحرير السياسة. */
create or replace function public.preview_reference_format(p_format text, p_padding integer default 4)
returns text
language sql
immutable
as $$
  select replace(replace(replace(replace(replace(replace(
    coalesce(p_format, ''),
    '{ORG}', 'MOF'), '{UNIT}', 'FIN'), '{DIR}', 'OUT'),
    '{YYYY}', to_char(now(), 'YYYY')), '{MM}', to_char(now(), 'MM')),
    '{SEQ}', lpad('1', greatest(coalesce(p_padding, 4), 1), '0'))
$$;

grant execute on function public.preview_reference_format(text, integer) to authenticated;
