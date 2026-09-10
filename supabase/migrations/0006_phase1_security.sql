-- =============================================================================
-- قلم | QALAM — Phase 1: Security & Foundation
--
-- هذه الهجرة إضافية بالكامل (additive): لا تحذف عمودًا، ولا تحذف جدولًا،
-- ولا تُضيّق قيدًا قائمًا، ولا تغيّر سلوك النظام الحالي افتراضيًا.
--
-- تضيف:
--   1) app_settings        — إعدادات تشغيلية قابلة للضبط (حدود المعدّل، سياسة التسجيل)
--   2) توسعة ai_requests_metadata — نموذج، رموز، سبب الخطأ، وحالة 'pending'
--   3) begin_ai_request / finish_ai_request — حد معدّل ذرّي دائم + تتبّع استخدام
--   4) signup_invites + بوابة تسجيل مفروضة في قاعدة البيانات
--
-- كل الدوال هنا تعمل على auth.uid() فقط ولا تقبل user_id من العميل.
-- =============================================================================


-- =============================================================================
-- 1) app_settings — إعدادات تشغيلية
--
-- RLS مفعّل بلا أي سياسة لدور authenticated ⇒ رفض كامل من المتصفح.
-- القراءة تتم حصريًا داخل دوال security definer أدناه.
-- =============================================================================
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from public, anon, authenticated;

drop trigger if exists set_updated_at on public.app_settings;
create trigger set_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

-- حدود استخدام الذكاء الاصطناعي. قابلة للتعديل بلا نشر جديد:
--   update public.app_settings set value = '{"per_minute":40,...}' where key='ai_rate_limits';
insert into public.app_settings (key, value) values (
  'ai_rate_limits',
  jsonb_build_object(
    'burst_per_10s', 6,     -- حماية من الاندفاع اللحظي
    'per_minute',    20,    -- النافذة المنزلقة الأساسية
    'per_day',       200    -- سقف يومي لكل مستخدم
  )
) on conflict (key) do nothing;

-- سياسة التسجيل. 'public' = السلوك الحالي بلا تغيير.
insert into public.app_settings (key, value)
values ('signup', jsonb_build_object('mode', 'public'))
on conflict (key) do nothing;

/** يقرأ إعدادًا واحدًا بأمان — للاستخدام داخل الدوال فقط. */
create or replace function public.app_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select value from public.app_settings where key = p_key
$$;

revoke all on function public.app_setting(text) from public, anon, authenticated;


-- =============================================================================
-- 2) توسعة ai_requests_metadata
--     ⚠️ خصوصية: ما زال ممنوعًا تخزين أي نص مراسلة أو prompt هنا.
--        الأعمدة الجديدة كلها بيانات وصفية/عددية.
-- =============================================================================
alter table public.ai_requests_metadata add column if not exists model             text;
alter table public.ai_requests_metadata add column if not exists prompt_tokens     integer;
alter table public.ai_requests_metadata add column if not exists completion_tokens integer;
alter table public.ai_requests_metadata add column if not exists total_tokens      integer;
alter table public.ai_requests_metadata add column if not exists error_code        text;
alter table public.ai_requests_metadata add column if not exists finished_at       timestamptz;

-- توسيع القيد ليقبل 'pending' (الحجز قبل التنفيذ). توسيع لا تضييق:
-- كل صف قائم بحالة success/error يبقى صالحًا.
alter table public.ai_requests_metadata drop constraint if exists ai_requests_status_check;
alter table public.ai_requests_metadata add constraint ai_requests_status_check
  check (status in ('pending', 'success', 'error'));

-- فهرس مخصص لعدّ نافذة الحد — يغطي الاستعلام الذرّي أدناه.
create index if not exists ai_requests_window_idx
  on public.ai_requests_metadata (user_id, created_at desc)
  where status in ('pending', 'success');


-- =============================================================================
-- 3) حد المعدّل الدائم + تتبّع الاستخدام
--
-- لماذا في قاعدة البيانات؟ دوال Netlify عديمة الحالة (stateless) وتُنشأ نسخ
-- متعددة منها، فالعدّاد في الذاكرة لا يحمي شيئًا. القاعدة هي الحالة المشتركة
-- الوحيدة الموجودة أصلًا — بلا خدمة جديدة ولا سرّ جديد.
--
-- الذرّية: pg_advisory_xact_lock لكل مستخدم يمنع تجاوز الحد عبر طلبات متزامنة.
-- =============================================================================

/**
 * يحجز طلب ذكاء اصطناعي إن سمح الحد.
 * يعيد allowed=false مع سبب ومدة انتظار بدل رمي استثناء، ليحوّلها الخادم إلى 429.
 * الصف المُنشأ حالته 'pending' ثم تُحسم بـ finish_ai_request.
 */
create or replace function public.begin_ai_request(
  p_task     text,
  p_provider text default 'openai',
  p_model    text default null
)
returns table (
  allowed             boolean,
  reason              text,
  retry_after_seconds integer,
  request_id          uuid,
  remaining_today     integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid           uuid := auth.uid();
  limits        jsonb := coalesce(public.app_setting('ai_rate_limits'), '{}'::jsonb);
  lim_burst     integer := coalesce((limits ->> 'burst_per_10s')::integer, 6);
  lim_minute    integer := coalesce((limits ->> 'per_minute')::integer, 20);
  lim_day       integer := coalesce((limits ->> 'per_day')::integer, 200);
  n_burst       integer;
  n_minute      integer;
  n_day         integer;
  new_id        uuid;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_task is null or length(p_task) = 0 or length(p_task) > 64 then
    raise exception 'invalid task' using errcode = '22023';
  end if;

  -- تسلسل الفحص لكل مستخدم على حدة؛ يُحرَّر تلقائيًا بنهاية المعاملة.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select
    count(*) filter (where created_at > now() - interval '10 seconds'),
    count(*) filter (where created_at > now() - interval '1 minute'),
    count(*) filter (where created_at > date_trunc('day', now()))
  into n_burst, n_minute, n_day
  from public.ai_requests_metadata
  where user_id = uid
    and status in ('pending', 'success')
    and created_at > date_trunc('day', now());

  if n_burst >= lim_burst then
    return query select false, 'burst'::text, 10, null::uuid, greatest(lim_day - n_day, 0);
    return;
  end if;
  if n_minute >= lim_minute then
    return query select false, 'per_minute'::text, 60, null::uuid, greatest(lim_day - n_day, 0);
    return;
  end if;
  if n_day >= lim_day then
    -- الانتظار حتى منتصف الليل بتوقيت الخادم.
    return query select false, 'daily_quota'::text,
      greatest(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now()))::integer, 60),
      null::uuid, 0;
    return;
  end if;

  insert into public.ai_requests_metadata (user_id, task, provider, model, status)
  values (uid, p_task, coalesce(p_provider, 'openai'), p_model, 'pending')
  returning id into new_id;

  return query select true, null::text, 0, new_id, greatest(lim_day - n_day - 1, 0);
end;
$$;

/**
 * يحسم نتيجة طلب محجوز. security definer لأن الجدول بلا سياسة UPDATE عمدًا
 * (سجل غير قابل للتعديل من المتصفح) — والدالة تقصر التحديث على صف المستخدم
 * نفسه وعلى الحالة 'pending' فقط، فلا يمكن إعادة كتابة سجل محسوم.
 */
create or replace function public.finish_ai_request(
  p_id                uuid,
  p_status            text,
  p_duration_ms       integer default null,
  p_prompt_tokens     integer default null,
  p_completion_tokens integer default null,
  p_total_tokens      integer default null,
  p_error_code        text    default null
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
  if p_status not in ('success', 'error') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  update public.ai_requests_metadata
     set status            = p_status,
         duration_ms       = p_duration_ms,
         prompt_tokens     = p_prompt_tokens,
         completion_tokens = p_completion_tokens,
         total_tokens      = p_total_tokens,
         -- رمز قصير مُعرَّف مسبقًا فقط، لا رسالة مزوّد ولا نص مستخدم.
         error_code        = left(p_error_code, 40),
         finished_at       = now()
   where id = p_id
     and user_id = uid
     and status = 'pending';
end;
$$;

revoke all on function public.begin_ai_request(text, text, text) from public, anon;
grant execute on function public.begin_ai_request(text, text, text) to authenticated;

revoke all on function public.finish_ai_request(uuid, text, integer, integer, integer, integer, text)
  from public, anon;
grant execute on function public.finish_ai_request(uuid, text, integer, integer, integer, integer, text)
  to authenticated;


-- =============================================================================
-- 4) سياسة التسجيل — عام أو بدعوة فقط
--
-- organization_id مُهيَّأ لمرحلة ٢ (المؤسسات) ويبقى NULL الآن.
-- =============================================================================
create table if not exists public.signup_invites (
  id              uuid primary key default gen_random_uuid(),
  email           text not null,
  organization_id uuid references public.organizations (id) on delete cascade,
  invited_by      uuid references auth.users (id) on delete set null,
  expires_at      timestamptz,
  accepted_at     timestamptz,
  accepted_by     uuid references auth.users (id) on delete set null,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

-- البريد يُطابَق بلا حساسية لحالة الأحرف.
create unique index if not exists signup_invites_email_idx
  on public.signup_invites (lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.signup_invites enable row level security;
revoke all on public.signup_invites from public, anon, authenticated;

/** الوضع الحالي للتسجيل: 'public' أو 'invite_only'. */
create or replace function public.signup_mode()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.app_setting('signup') ->> 'mode', 'public')
$$;

revoke all on function public.signup_mode() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- بوابة التسجيل مفروضة في القاعدة، لا في الواجهة.
-- إخفاء صفحة التسجيل في React ليس تفويضًا؛ هذا المُشغّل هو الحاجز الفعلي.
--
-- نُعيد تعريف handle_new_user بالكامل مع الحفاظ على سلوكها الحالي
-- (إنشاء profile و user_preferences و learning_progress).
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite_id uuid;
begin
  if public.signup_mode() = 'invite_only' then
    select id into invite_id
    from public.signup_invites
    where lower(email) = lower(coalesce(new.email, ''))
      and accepted_at is null
      and revoked_at is null
      and (expires_at is null or expires_at > now())
    limit 1;

    if invite_id is null then
      -- يُلغي إدراج auth.users بالكامل ⇒ لا يُنشأ حساب.
      raise exception 'signup is invite-only' using errcode = 'P0001';
    end if;

    update public.signup_invites
       set accepted_at = now(), accepted_by = new.id
     where id = invite_id;
  end if;

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


-- =============================================================================
-- منع الوصول المجهول للجداول الجديدة (تكرار مقصود لقاعدة 0002)
-- =============================================================================
revoke all on all tables in schema public from anon;
