-- =============================================================================
-- قلم | QALAM — Schema (V1)
-- ملاحظات التصميم:
--  * كل المعرفات UUID.
--  * كل جدول فيه created_at / updated_at مع trigger تلقائي.
--  * organization_id موجود منذ V1 لكنه NULLABLE وغير مستخدم — جاهز للتوسع
--    إلى Multi-tenant لاحقًا بدون هجرة مؤلمة.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- دالة تحديث updated_at
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- أنواع محصورة (Enums)
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.qalam_language as enum ('ar', 'en');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.qalam_priority as enum ('normal', 'important', 'urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.qalam_learning_level as enum ('beginner', 'intermediate', 'advanced', 'professional');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.qalam_correspondence_source as enum ('written', 'reply', 'improved', 'translated', 'template');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.qalam_favorite_kind as enum ('template', 'phrase', 'correspondence');
exception when duplicate_object then null; end $$;

-- =============================================================================
-- 1) organizations — غير مفعّل في V1، موجود للتوسع المستقبلي
-- =============================================================================
create table if not exists public.organizations (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- =============================================================================
-- 2) departments — الأقسام (افتراضية عامة + أقسام مخصصة لكل مستخدم)
-- =============================================================================
create table if not exists public.departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete cascade,
  key             text,
  name_ar         text not null,
  name_en         text not null default '',
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint departments_owner_check check (is_system = true or user_id is not null)
);

create index if not exists departments_user_id_idx on public.departments (user_id);
-- يجعل بذور النظام غير قابلة للتكرار (يدعم ON CONFLICT في 0003_seed.sql)
create unique index if not exists departments_system_key_idx
  on public.departments (key) where is_system = true;

-- =============================================================================
-- 3) profiles — ملف المستخدم (1:1 مع auth.users)
-- =============================================================================
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  organization_id   uuid references public.organizations (id) on delete set null,
  full_name         text not null default '',
  email             text not null default '',
  department_key    text,
  department_custom text,
  job_title         text,
  preferred_language public.qalam_language not null default 'ar',
  writing_style     text not null default 'balanced',
  onboarding_completed boolean not null default false,
  role              text not null default 'owner',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- =============================================================================
-- 4) user_preferences — الإعدادات
-- =============================================================================
create table if not exists public.user_preferences (
  user_id                uuid primary key references auth.users (id) on delete cascade,
  ui_language            public.qalam_language not null default 'ar',
  theme                  text not null default 'light',
  default_tone           text not null default 'formal',
  default_correspondence_language public.qalam_language not null default 'ar',
  ai_suggest_tone        boolean not null default true,
  save_history           boolean not null default true,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint user_preferences_theme_check check (theme in ('light', 'dark', 'system'))
);

-- =============================================================================
-- 5) correspondences — المراسلات المحفوظة (السجل)
-- =============================================================================
create table if not exists public.correspondences (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  organization_id     uuid references public.organizations (id) on delete set null,
  title               text not null default '',
  subject             text not null default '',
  body                text not null default '',
  language            public.qalam_language not null default 'ar',
  correspondence_type text not null default 'official_letter',
  tone                text not null default 'formal',
  priority            public.qalam_priority not null default 'normal',
  recipient           text not null default '',
  department_key      text,
  source              public.qalam_correspondence_source not null default 'written',
  original_input      text,
  analysis            jsonb,
  review              jsonb,
  is_archived         boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists correspondences_user_created_idx
  on public.correspondences (user_id, created_at desc);
create index if not exists correspondences_user_type_idx
  on public.correspondences (user_id, correspondence_type);
create index if not exists correspondences_search_idx
  on public.correspondences using gin (to_tsvector('simple', coalesce(subject, '') || ' ' || coalesce(body, '')));

-- =============================================================================
-- 6) correspondence_versions — سجل الإصدارات (كل إعادة صياغة تُحفظ)
-- =============================================================================
create table if not exists public.correspondence_versions (
  id                uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondences (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  variant_kind      text not null default 'recommended',
  subject           text not null default '',
  body              text not null,
  note              text not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists correspondence_versions_parent_idx
  on public.correspondence_versions (correspondence_id, created_at desc);

-- =============================================================================
-- 7) drafts — المسودات
-- =============================================================================
create table if not exists public.drafts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  organization_id     uuid references public.organizations (id) on delete set null,
  title               text not null default '',
  subject             text not null default '',
  body                text not null default '',
  language            public.qalam_language not null default 'ar',
  correspondence_type text not null default 'official_letter',
  recipient           text not null default '',
  department_key      text,
  original_input      text,
  analysis            jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists drafts_user_updated_idx on public.drafts (user_id, updated_at desc);

-- =============================================================================
-- 8) templates — القوالب (قوالب النظام عامة + قوالب المستخدم)
-- =============================================================================
create table if not exists public.templates (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete cascade,
  organization_id     uuid references public.organizations (id) on delete cascade,
  slug                text,
  title_ar            text not null,
  title_en            text not null default '',
  description_ar      text not null default '',
  description_en      text not null default '',
  body_ar             text not null default '',
  body_en             text not null default '',
  correspondence_type text not null default 'official_letter',
  tone                text not null default 'formal',
  is_system           boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint templates_owner_check check (is_system = true or user_id is not null)
);

create unique index if not exists templates_system_slug_idx
  on public.templates (slug) where is_system = true;
create index if not exists templates_user_idx on public.templates (user_id);

-- =============================================================================
-- 9) dictionary_entries — قاموس قلم
-- =============================================================================
create table if not exists public.dictionary_entries (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  category       text not null,
  phrase         text not null,
  meaning        text not null default '',
  when_to_use    text not null default '',
  when_not_to_use text not null default '',
  example        text not null default '',
  alternatives   text[] not null default '{}',
  language       public.qalam_language not null default 'ar',
  is_system      boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint dictionary_owner_check check (is_system = true or user_id is not null)
);

create index if not exists dictionary_category_idx on public.dictionary_entries (category);
create index if not exists dictionary_user_idx on public.dictionary_entries (user_id);
-- يجعل بذور النظام غير قابلة للتكرار (يدعم ON CONFLICT في 0003_seed.sql)
create unique index if not exists dictionary_system_phrase_idx
  on public.dictionary_entries (phrase) where is_system = true;

-- =============================================================================
-- 10) favorites — المفضلة
-- =============================================================================
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       public.qalam_favorite_kind not null,
  ref_id     uuid,
  label      text not null default '',
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- فهرس غير جزئي حتى يعمل ON CONFLICT (upsert).
-- صفوف ref_id = NULL لا تتعارض أصلًا (NULLS DISTINCT هو السلوك الافتراضي).
create unique index if not exists favorites_unique_ref_idx
  on public.favorites (user_id, kind, ref_id);
create index if not exists favorites_user_idx on public.favorites (user_id, created_at desc);

-- =============================================================================
-- 11) learning_sessions — تمارين وضع "علّمني"
-- =============================================================================
create table if not exists public.learning_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  level         public.qalam_learning_level not null default 'beginner',
  language      public.qalam_language not null default 'ar',
  scenario      text not null,
  expected_type text,
  expected_tone text,
  user_answer   text not null default '',
  score         integer,
  evaluation    jsonb,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint learning_sessions_score_check check (score is null or (score >= 0 and score <= 100))
);

create index if not exists learning_sessions_user_idx
  on public.learning_sessions (user_id, created_at desc);

-- =============================================================================
-- 12) learning_progress — تقدم المستخدم (صف واحد لكل مستخدم)
-- =============================================================================
create table if not exists public.learning_progress (
  user_id          uuid primary key references auth.users (id) on delete cascade,
  level            public.qalam_learning_level not null default 'beginner',
  exercises_count  integer not null default 0,
  average_score    numeric(5,2) not null default 0,
  strengths        text[] not null default '{}',
  improvements     text[] not null default '{}',
  last_practiced_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- =============================================================================
-- 13) ai_requests_metadata — بيانات وصفية فقط
--     ⚠️ خصوصية: لا يُخزَّن هنا أي محتوى مراسلة ولا أي prompt.
-- =============================================================================
create table if not exists public.ai_requests_metadata (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  task         text not null,
  provider     text not null default 'openai',
  status       text not null default 'success',
  duration_ms  integer,
  created_at   timestamptz not null default now(),
  constraint ai_requests_status_check check (status in ('success', 'error'))
);

create index if not exists ai_requests_user_idx on public.ai_requests_metadata (user_id, created_at desc);

-- =============================================================================
-- Triggers: updated_at
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array[
    'organizations','departments','profiles','user_preferences','correspondences',
    'correspondence_versions','drafts','templates','dictionary_entries','favorites',
    'learning_sessions','learning_progress'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I;', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- =============================================================================
-- إنشاء ملف تعريف تلقائيًا عند تسجيل مستخدم جديد
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')
  )
  on conflict (id) do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.learning_progress (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
