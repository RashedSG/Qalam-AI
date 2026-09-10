-- =============================================================================
-- قلم | QALAM — Phase 3 (و): مواءمة صلاحيات المرفقات مع صلاحيات الاطّلاع
--
-- تقصير كشفه اختبار حقيقي: المدير يملك correspondence.view بنطاق
-- «وحدته وما تحتها» لكنه لا يملك attachment.view إطلاقًا — فكان يقرأ المراسلة
-- ولا يرى مرفقاتها. مراسلة نصف مقروءة ليست سلوكًا مقصودًا.
--
-- القاعدة المطبَّقة هنا ليست قائمة يدوية بل اشتقاق:
--   من يستطيع الاطّلاع على مراسلة بنطاق ما، يستطيع الاطّلاع على مرفقاتها
--   وتنزيلها بالنطاق نفسه — لا أوسع.
--
-- الاشتقاق يعني أن أي دور نظام يُضاف لاحقًا يحصل على المواءمة تلقائيًا عند
-- إعادة تنفيذ هذه الهجرة، بلا تعديل قائمة في مكان آخر.
-- =============================================================================

do $$
declare
  row_perm record;
begin
  for row_perm in
    select rp.role_id, rp.scope
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    where rp.permission_key = 'correspondence.view'
      and r.is_system = true
      and r.organization_id is null
  loop
    -- insert … on conflict do nothing: لا نُضيّق نطاقًا أوسع مُنح صراحةً.
    insert into public.role_permissions (role_id, permission_key, scope)
    values (row_perm.role_id, 'attachment.view', row_perm.scope)
    on conflict (role_id, permission_key) do nothing;

    insert into public.role_permissions (role_id, permission_key, scope)
    values (row_perm.role_id, 'attachment.download', row_perm.scope)
    on conflict (role_id, permission_key) do nothing;
  end loop;

  -- الرفع ليس اطّلاعًا: يُمنح لمن يملك تعديل المراسلة بالنطاق نفسه.
  for row_perm in
    select rp.role_id, rp.scope
    from public.role_permissions rp
    join public.roles r on r.id = rp.role_id
    where rp.permission_key = 'correspondence.edit'
      and r.is_system = true
      and r.organization_id is null
  loop
    insert into public.role_permissions (role_id, permission_key, scope)
    values (row_perm.role_id, 'attachment.upload', row_perm.scope)
    on conflict (role_id, permission_key) do nothing;
  end loop;
end $$;

-- تحقّق: لا دور نظام يقرأ مراسلة ولا يقرأ مرفقاتها.
do $$
declare
  gap integer;
begin
  select count(*) into gap
  from public.role_permissions view_perm
  join public.roles r on r.id = view_perm.role_id
  where view_perm.permission_key = 'correspondence.view'
    and r.is_system = true
    and not exists (
      select 1 from public.role_permissions att
      where att.role_id = view_perm.role_id
        and att.permission_key = 'attachment.view'
        and public.scope_rank(att.scope) >= public.scope_rank(view_perm.scope)
    );

  if gap > 0 then
    raise exception 'alignment failed: % roles can read correspondence but not its attachments', gap;
  end if;
end $$;
