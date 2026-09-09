-- =============================================================================
-- قلم | QALAM — Row Level Security (إلزامي)
-- القاعدة الذهبية: لا يرى أي مستخدم بيانات مستخدم آخر. auth.uid() = user_id
-- المحتوى العام الوحيد: صفوف is_system = true (قوالب النظام وقاموس النظام
-- والأقسام الافتراضية) — قراءة فقط، ولا يستطيع أي مستخدم تعديلها أو حذفها.
-- =============================================================================

alter table public.organizations           enable row level security;
alter table public.departments             enable row level security;
alter table public.profiles                enable row level security;
alter table public.user_preferences        enable row level security;
alter table public.correspondences         enable row level security;
alter table public.correspondence_versions enable row level security;
alter table public.drafts                  enable row level security;
alter table public.templates               enable row level security;
alter table public.dictionary_entries      enable row level security;
alter table public.favorites               enable row level security;
alter table public.learning_sessions       enable row level security;
alter table public.learning_progress       enable row level security;
alter table public.ai_requests_metadata    enable row level security;

-- -----------------------------------------------------------------------------
-- organizations — غير مستخدم في V1: لا سياسات وصول للمستخدمين إطلاقًا.
-- (RLS مفعّل بلا سياسة = رفض كامل لدور authenticated.)
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- user_preferences
-- -----------------------------------------------------------------------------
drop policy if exists "prefs_select_own" on public.user_preferences;
create policy "prefs_select_own" on public.user_preferences
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "prefs_insert_own" on public.user_preferences;
create policy "prefs_insert_own" on public.user_preferences
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "prefs_update_own" on public.user_preferences;
create policy "prefs_update_own" on public.user_preferences
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "prefs_delete_own" on public.user_preferences;
create policy "prefs_delete_own" on public.user_preferences
  for delete to authenticated using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- departments — قراءة: أقسام النظام + أقسام المستخدم. كتابة: أقسام المستخدم فقط.
-- -----------------------------------------------------------------------------
drop policy if exists "departments_select" on public.departments;
create policy "departments_select" on public.departments
  for select to authenticated using (is_system = true or auth.uid() = user_id);

drop policy if exists "departments_insert_own" on public.departments;
create policy "departments_insert_own" on public.departments
  for insert to authenticated with check (auth.uid() = user_id and is_system = false);

drop policy if exists "departments_update_own" on public.departments;
create policy "departments_update_own" on public.departments
  for update to authenticated
  using (auth.uid() = user_id and is_system = false)
  with check (auth.uid() = user_id and is_system = false);

drop policy if exists "departments_delete_own" on public.departments;
create policy "departments_delete_own" on public.departments
  for delete to authenticated using (auth.uid() = user_id and is_system = false);

-- -----------------------------------------------------------------------------
-- correspondences
-- -----------------------------------------------------------------------------
drop policy if exists "correspondences_select_own" on public.correspondences;
create policy "correspondences_select_own" on public.correspondences
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "correspondences_insert_own" on public.correspondences;
create policy "correspondences_insert_own" on public.correspondences
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "correspondences_update_own" on public.correspondences;
create policy "correspondences_update_own" on public.correspondences
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "correspondences_delete_own" on public.correspondences;
create policy "correspondences_delete_own" on public.correspondences
  for delete to authenticated using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- correspondence_versions — مربوط بالمالك مباشرة وبالمراسلة الأم
-- -----------------------------------------------------------------------------
drop policy if exists "versions_select_own" on public.correspondence_versions;
create policy "versions_select_own" on public.correspondence_versions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "versions_insert_own" on public.correspondence_versions;
create policy "versions_insert_own" on public.correspondence_versions
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.correspondences c
      where c.id = correspondence_id and c.user_id = auth.uid()
    )
  );

drop policy if exists "versions_update_own" on public.correspondence_versions;
create policy "versions_update_own" on public.correspondence_versions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "versions_delete_own" on public.correspondence_versions;
create policy "versions_delete_own" on public.correspondence_versions
  for delete to authenticated using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- drafts
-- -----------------------------------------------------------------------------
drop policy if exists "drafts_select_own" on public.drafts;
create policy "drafts_select_own" on public.drafts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "drafts_insert_own" on public.drafts;
create policy "drafts_insert_own" on public.drafts
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "drafts_update_own" on public.drafts;
create policy "drafts_update_own" on public.drafts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "drafts_delete_own" on public.drafts;
create policy "drafts_delete_own" on public.drafts
  for delete to authenticated using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- templates — قراءة: قوالب النظام + قوالب المستخدم. كتابة: قوالب المستخدم فقط.
-- -----------------------------------------------------------------------------
drop policy if exists "templates_select" on public.templates;
create policy "templates_select" on public.templates
  for select to authenticated using (is_system = true or auth.uid() = user_id);

drop policy if exists "templates_insert_own" on public.templates;
create policy "templates_insert_own" on public.templates
  for insert to authenticated with check (auth.uid() = user_id and is_system = false);

drop policy if exists "templates_update_own" on public.templates;
create policy "templates_update_own" on public.templates
  for update to authenticated
  using (auth.uid() = user_id and is_system = false)
  with check (auth.uid() = user_id and is_system = false);

drop policy if exists "templates_delete_own" on public.templates;
create policy "templates_delete_own" on public.templates
  for delete to authenticated using (auth.uid() = user_id and is_system = false);

-- -----------------------------------------------------------------------------
-- dictionary_entries — نفس منطق القوالب
-- -----------------------------------------------------------------------------
drop policy if exists "dictionary_select" on public.dictionary_entries;
create policy "dictionary_select" on public.dictionary_entries
  for select to authenticated using (is_system = true or auth.uid() = user_id);

drop policy if exists "dictionary_insert_own" on public.dictionary_entries;
create policy "dictionary_insert_own" on public.dictionary_entries
  for insert to authenticated with check (auth.uid() = user_id and is_system = false);

drop policy if exists "dictionary_update_own" on public.dictionary_entries;
create policy "dictionary_update_own" on public.dictionary_entries
  for update to authenticated
  using (auth.uid() = user_id and is_system = false)
  with check (auth.uid() = user_id and is_system = false);

drop policy if exists "dictionary_delete_own" on public.dictionary_entries;
create policy "dictionary_delete_own" on public.dictionary_entries
  for delete to authenticated using (auth.uid() = user_id and is_system = false);

-- -----------------------------------------------------------------------------
-- favorites
-- -----------------------------------------------------------------------------
drop policy if exists "favorites_select_own" on public.favorites;
create policy "favorites_select_own" on public.favorites
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "favorites_insert_own" on public.favorites;
create policy "favorites_insert_own" on public.favorites
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "favorites_update_own" on public.favorites;
create policy "favorites_update_own" on public.favorites
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "favorites_delete_own" on public.favorites;
create policy "favorites_delete_own" on public.favorites
  for delete to authenticated using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- learning_sessions
-- -----------------------------------------------------------------------------
drop policy if exists "learning_sessions_select_own" on public.learning_sessions;
create policy "learning_sessions_select_own" on public.learning_sessions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "learning_sessions_insert_own" on public.learning_sessions;
create policy "learning_sessions_insert_own" on public.learning_sessions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "learning_sessions_update_own" on public.learning_sessions;
create policy "learning_sessions_update_own" on public.learning_sessions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "learning_sessions_delete_own" on public.learning_sessions;
create policy "learning_sessions_delete_own" on public.learning_sessions
  for delete to authenticated using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- learning_progress
-- -----------------------------------------------------------------------------
drop policy if exists "learning_progress_select_own" on public.learning_progress;
create policy "learning_progress_select_own" on public.learning_progress
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "learning_progress_insert_own" on public.learning_progress;
create policy "learning_progress_insert_own" on public.learning_progress
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "learning_progress_update_own" on public.learning_progress;
create policy "learning_progress_update_own" on public.learning_progress
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "learning_progress_delete_own" on public.learning_progress;
create policy "learning_progress_delete_own" on public.learning_progress
  for delete to authenticated using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- ai_requests_metadata — المستخدم يقرأ ويضيف بياناته الوصفية فقط.
-- لا تحديث (سجل غير قابل للتعديل)، والحذف مسموح لدعم "احذف بياناتي".
-- -----------------------------------------------------------------------------
drop policy if exists "ai_meta_select_own" on public.ai_requests_metadata;
create policy "ai_meta_select_own" on public.ai_requests_metadata
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "ai_meta_insert_own" on public.ai_requests_metadata;
create policy "ai_meta_insert_own" on public.ai_requests_metadata
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "ai_meta_delete_own" on public.ai_requests_metadata;
create policy "ai_meta_delete_own" on public.ai_requests_metadata
  for delete to authenticated using (auth.uid() = user_id);

-- -----------------------------------------------------------------------------
-- منع الوصول المجهول (anon) نهائيًا لكل الجداول
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
