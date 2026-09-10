-- =============================================================================
-- قلم | QALAM — Phase 3 (أ): جوهر المراسلة المؤسسية
--
-- الاتجاه، الحقول الأساسية، التصنيف الأمني، الوحدة المالكة، سلاسل المراسلات.
--
-- إضافية بالكامل. كل عمود جديد له قيمة افتراضية تُبقي السلوك الحالي كما هو:
-- المراسلات القائمة تصبح 'outgoing' بتصنيف 'internal'، وهو أدنى تصنيف،
-- والتخليص الافتراضي لكل عضو يساويه — فلا يفقد أحد وصولًا كان يملكه.
-- =============================================================================


-- =============================================================================
-- 1) التصنيف الأمني — قابل للتخصيص لكل مؤسسة
--
-- ⚠️ التصنيف هنا يؤثر في التحكم بالوصول فعلًا، وليس شارة في الواجهة:
--    can_access_row تقارن rank التصنيف بـ clearance_rank في عضوية المستخدم.
--    لا نفترض أسماء حكومية إلزامية — المؤسسة تعرّف مستوياتها وتُرتّبها.
-- =============================================================================
create table if not exists public.classification_levels (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key             text not null,
  name_ar         text not null,
  name_en         text not null default '',
  -- الأعلى أكثر سرية. التخليص يجب أن يساويه أو يزيد.
  rank            integer not null default 1,
  is_default      boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint classification_rank_check check (rank between 1 and 100)
);

create unique index if not exists classification_levels_key_idx
  on public.classification_levels (organization_id, key);
create unique index if not exists classification_levels_default_idx
  on public.classification_levels (organization_id) where is_default = true;

/** مستوى التخليص الأمني للعضو. الافتراضي 1 = أدنى مستوى، فلا يتغيّر سلوك قائم. */
alter table public.memberships add column if not exists clearance_rank integer not null default 1;

do $$ begin
  alter table public.memberships add constraint memberships_clearance_check
    check (clearance_rank between 1 and 100);
exception when duplicate_object then null; end $$;

/** يبذر مستويات التصنيف الافتراضية لمؤسسة. قابل لإعادة التنفيذ. */
create or replace function public.seed_classification_levels(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.classification_levels (organization_id, key, name_ar, name_en, rank, is_default)
  values
    (p_organization_id, 'internal',     'داخلي',  'Internal',     1, true),
    (p_organization_id, 'restricted',   'مقيّد',  'Restricted',   2, false),
    (p_organization_id, 'confidential', 'سري',    'Confidential', 3, false)
  on conflict (organization_id, key) do nothing;
end;
$$;

revoke all on function public.seed_classification_levels(uuid) from public, anon, authenticated;

-- بذر المؤسسات القائمة
do $$
declare org record;
begin
  for org in select id from public.organizations loop
    perform public.seed_classification_levels(org.id);
  end loop;
end $$;


-- =============================================================================
-- 2) حقول المراسلة المؤسسية
--
-- ⚠️ `source` القائم يبقى كما هو للتوافق — يصف كيف أُنشئت المراسلة
--    (written/reply/improved/…). `direction` مفهوم مختلف تمامًا: من أين
--    إلى أين. الخلط بينهما كان سيُفقد أحد المعنيين.
-- =============================================================================
do $$ begin
  create type public.qalam_direction as enum ('incoming', 'outgoing', 'internal');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.qalam_correspondence_status as enum (
    'draft', 'in_review', 'returned', 'in_approval', 'approved',
    'signed', 'issued', 'closed', 'archived'
  );
exception when duplicate_object then null; end $$;

alter table public.correspondences
  add column if not exists direction public.qalam_direction not null default 'outgoing';
alter table public.correspondences
  add column if not exists current_status public.qalam_correspondence_status not null default 'draft';
alter table public.correspondences add column if not exists reference_number          text;
alter table public.correspondences add column if not exists external_reference_number text;
alter table public.correspondences add column if not exists sender                    text not null default '';
alter table public.correspondences add column if not exists sender_organization       text not null default '';
alter table public.correspondences add column if not exists recipient_organization    text not null default '';
alter table public.correspondences add column if not exists classification_key        text;
alter table public.correspondences add column if not exists received_at               timestamptz;
alter table public.correspondences add column if not exists issued_at                 timestamptz;
alter table public.correspondences add column if not exists due_at                    timestamptz;
alter table public.correspondences add column if not exists created_by                uuid;

/**
 * الوحدة المالكة للمراسلة.
 *
 * لماذا عمود مستقل بدل الاشتقاق من عضوية المُنشئ؟ لأن المراسلة تخص وحدةً لا
 * شخصًا: نقل موظف بين الإدارات يجب ألا ينقل معه مراسلات إدارته السابقة.
 * NULL = ارجع إلى وحدة المالك (سلوك المرحلة ٢) — فالصفوف القائمة لا تتأثر.
 */
alter table public.correspondences
  add column if not exists owner_unit_id uuid references public.org_units (id) on delete set null;

/** السلسلة: مراسلة ردٍّ تشير إلى الواردة التي ردّت عليها. */
alter table public.correspondences
  add column if not exists parent_id uuid references public.correspondences (id) on delete set null;

create index if not exists correspondences_direction_idx
  on public.correspondences (organization_id, direction, created_at desc);
create index if not exists correspondences_status_idx
  on public.correspondences (organization_id, current_status);
create index if not exists correspondences_unit_idx
  on public.correspondences (owner_unit_id) where owner_unit_id is not null;
create index if not exists correspondences_parent_idx
  on public.correspondences (parent_id) where parent_id is not null;
create index if not exists correspondences_due_idx
  on public.correspondences (organization_id, due_at) where due_at is not null;

-- رقم المراسلة فريد داخل المؤسسة. جزئي: الصفوف بلا رقم لا تتزاحم.
create unique index if not exists correspondences_reference_idx
  on public.correspondences (organization_id, reference_number)
  where reference_number is not null;

-- created_by للصفوف القائمة = مالكها.
update public.correspondences set created_by = user_id where created_by is null;

-- التصنيف الافتراضي للصفوف القائمة = أدنى مستوى، فلا يفقد أحد وصولًا.
update public.correspondences set classification_key = 'internal' where classification_key is null;


-- =============================================================================
-- 3) روابط المراسلات — علاقات غير هرمية
--
-- parent_id يكفي لسلسلة الرد. هذا الجدول للعلاقات الأخرى: «مرتبطة بـ»،
-- «تُلغي»، «مرجع». علاقة متعددة إلى متعددة لا تُمثَّل بعمود واحد.
-- =============================================================================
create table if not exists public.correspondence_links (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references public.correspondences (id) on delete cascade,
  to_id      uuid not null references public.correspondences (id) on delete cascade,
  kind       text not null default 'related',
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint correspondence_links_kind_check
    check (kind in ('related', 'supersedes', 'reference')),
  constraint correspondence_links_distinct check (from_id <> to_id),
  constraint correspondence_links_unique unique (from_id, to_id, kind)
);

create index if not exists correspondence_links_to_idx on public.correspondence_links (to_id);


-- =============================================================================
-- 4) التصنيف في قرار الوصول
--
-- نستبدل can_access_row بنسخة تفحص التخليص أيضًا. المالك يبقى أولًا:
-- كاتب المراسلة يصل إليها مهما كان تصنيفها — وإلا لأصبح تصنيفه لها حاجزًا أمامه.
-- =============================================================================
create or replace function public.can_access_row(
  p_permission      text,
  p_organization_id uuid,
  p_owner_id        uuid,
  p_owner_unit_id   uuid,
  -- بلا قيمة افتراضية عن قصد: لو كانت لها افتراضي لصار استدعاء بأربع وسائط
  -- غامضًا بين هذه النسخة ونسخة 0008 ذات الأربع، وترفض PostgreSQL الغموض.
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

    if needed_rank is not null then
      select clearance_rank into my_clearance from public.my_membership(p_organization_id);
      if coalesce(my_clearance, 0) < needed_rank then return false; end if;
    end if;
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

-- النسخة القديمة ذات الأربع وسائط لم تعد مستخدمة بعد إعادة تعريف
-- can_access_owned_row أدناه. إسقاطها يمنع بقاء توقيعين متشابهين يتنازعان
-- على الاستدعاءات عند إعادة تنفيذ الهجرات بالترتيب.
drop function if exists public.can_access_row(text, uuid, uuid, uuid);

/**
 * قرار الوصول لصف مراسلة.
 *
 * الوحدة المالكة: العمود الصريح إن وُجد، وإلا وحدة المالك — فالصفوف القائمة
 * تسلك كما في المرحلة ٢ تمامًا.
 */
create or replace function public.can_access_correspondence(
  p_permission      text,
  p_organization_id uuid,
  p_owner_id        uuid,
  p_owner_unit_id   uuid,
  p_classification  text
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
    coalesce(p_owner_unit_id, public.owner_unit(p_organization_id, p_owner_id)),
    p_classification
  )
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.can_access_row(text, uuid, uuid, uuid, text)',
    'public.can_access_correspondence(text, uuid, uuid, uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;

-- التوقيع القديم (٤ وسائط) ما زال مستخدمًا في سياسات 0010 — نُبقيه يعمل
-- بتمرير تصنيف فارغ، فلا تنكسر أي سياسة قائمة قبل تحديثها في 0016.
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
    public.owner_unit(p_organization_id, p_owner_id),
    null
  )
$$;
