-- =============================================================================
-- قلم | QALAM — إجراءات الحساب والخصوصية
-- =============================================================================

-- حذف كل بيانات المستخدم (بدون حذف حساب المصادقة نفسه).
-- يعمل بصلاحيات المستدعي فقط، ويقتصر على صفوف auth.uid().
create or replace function public.delete_my_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.correspondence_versions where user_id = uid;
  delete from public.correspondences        where user_id = uid;
  delete from public.drafts                 where user_id = uid;
  delete from public.favorites              where user_id = uid;
  delete from public.learning_sessions      where user_id = uid;
  delete from public.ai_requests_metadata   where user_id = uid;
  delete from public.templates              where user_id = uid and is_system = false;
  delete from public.dictionary_entries     where user_id = uid and is_system = false;
  delete from public.departments            where user_id = uid and is_system = false;

  update public.learning_progress
    set exercises_count = 0, average_score = 0, strengths = '{}', improvements = '{}',
        level = 'beginner', last_practiced_at = null
  where user_id = uid;
end;
$$;

revoke all on function public.delete_my_data() from public, anon;
grant execute on function public.delete_my_data() to authenticated;

-- حذف الحساب بالكامل. security definer لأن حذف auth.users يتطلب صلاحية أعلى،
-- لكن الدالة لا تقبل أي وسيط وتحذف auth.uid() فقط — لا يمكن استخدامها لحذف غيره.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  -- الحذف المتتالي (on delete cascade) يتكفّل بباقي الجداول.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- تحديث تقدم التعلّم ذريًا بعد كل تمرين.
create or replace function public.record_learning_result(p_score integer)
returns public.learning_progress
language plpgsql
security invoker
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  progress_row public.learning_progress;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'score must be between 0 and 100';
  end if;

  insert into public.learning_progress as lp (user_id, exercises_count, average_score, last_practiced_at)
  values (uid, 1, p_score, now())
  on conflict (user_id) do update
    set exercises_count = lp.exercises_count + 1,
        average_score = round(
          ((lp.average_score * lp.exercises_count) + p_score) / (lp.exercises_count + 1), 2),
        last_practiced_at = now()
  returning * into progress_row;

  -- ترقية المستوى تلقائيًا حسب الأداء التراكمي
  update public.learning_progress
    set level = case
      when progress_row.exercises_count >= 24 and progress_row.average_score >= 90 then 'professional'
      when progress_row.exercises_count >= 12 and progress_row.average_score >= 80 then 'advanced'
      when progress_row.exercises_count >= 5  and progress_row.average_score >= 70 then 'intermediate'
      else 'beginner'
    end::public.qalam_learning_level
  where user_id = uid
  returning * into progress_row;

  return progress_row;
end;
$$;

revoke all on function public.record_learning_result(integer) from public, anon;
grant execute on function public.record_learning_result(integer) to authenticated;
