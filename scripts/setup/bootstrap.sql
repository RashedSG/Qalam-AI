-- =============================================================================
-- قلم | QALAM — تهيئة المؤسسة للتشغيل
--
-- ⚠️ اقرأ هذا قبل التنفيذ.
--
-- هجرة `0009_backfill_organization.sql` تُنشئ المؤسسة والوحدة الجذر، وتجعل كل
-- مستخدم قائم عضوًا نشطًا، وتجعل **أقدم** مستخدم مدير المؤسسة. لكنها تعمل
-- وقت تنفيذ الهجرة: فإن طُبّقت على مشروع فارغ قبل أن يسجّل أحد، فلا مستخدم
-- ولا عضوية ولا مدير.
--
-- ولذلك الترتيب الصحيح في تنصيب جديد:
--   ١) طبّق الهجرات كلّها
--   ٢) سجّل دخولك إلى التطبيق مرة واحدة (ليُنشأ حسابك)
--   ٣) أعد تنفيذ 0009_backfill_organization.sql  ← يُنشئ عضويتك ويجعلك مديرًا
--   ٤) نفّذ هذا الملف                              ← يُكمل ما لا تفعله 0009
--
-- وما لا تفعله 0009 وهذا الملف يفعله:
--   • تسمية المؤسسة باسمها الحقيقي (0009 تضع 'مؤسستي' و'DEFAULT')
--   • ضبط التخليص الأمني على أعلى تصنيف — 0009 تتركه ١، فلا يرى المدير
--     مراسلاته السرية، وهو خلل يظهر متأخرًا ويصعب تفسيره
--   • إسناد أدوار سير العمل — 0009 تمنح organization_admin و employee فقط،
--     وهما لا يكفيان لإيصال مراسلة إلى الإصدار
--
-- لا يُنشئ مؤسسة ثانية: مؤسستان تعنيان انقسام بياناتك بين اثنتين.
-- قابل لإعادة التنفيذ: لا يُكرّر شيئًا ولا يحذف شيئًا.
-- =============================================================================

do $$
declare
  -- ───────────────────────── عدّل هذه الأربع ─────────────────────────
  v_org_name    text := 'مؤسستي';              -- الاسم العربي الرسمي
  v_org_name_en text := 'My Organization';     -- الاسم الإنجليزي
  v_org_code    text := 'ORG';                 -- رمز يظهر في رقم المراسلة
  v_admin_email text := 'you@example.com';     -- بريد حسابك
  -- ────────────────────────────────────────────────────────────────────

  v_org_count integer;
  v_org_id    uuid;
  v_unit_id   uuid;
  v_user_id   uuid;
  v_membership_id uuid;
  v_max_rank  integer;
  v_role      text;
begin
  ---------------------------------------------------------------------------
  -- 1) المؤسسة: القائمة، لا جديدة.
  ---------------------------------------------------------------------------
  select count(*) into v_org_count from public.organizations;

  if v_org_count = 0 then
    raise exception
      'no organization exists. Apply all migrations first (0009 creates it), then re-run.';
  end if;

  if v_org_count > 1 then
    raise exception
      'found % organizations. This script is for the single-tenant setup; '
      'pick one manually instead of guessing.', v_org_count;
  end if;

  select id into v_org_id from public.organizations limit 1;

  -- لا تُكتب الأسماء فوق تسميةٍ اختارها المستخدم: يُستبدل الافتراضي فقط.
  update public.organizations
     set name    = case when name = 'مؤسستي' then v_org_name else name end,
         name_en = case when name_en = 'My Organization' then v_org_name_en else name_en end,
         code    = case when upper(coalesce(code, '')) = 'DEFAULT' then v_org_code else code end,
         updated_at = now()
   where id = v_org_id;

  raise notice 'organization: % (%)',
    (select code from public.organizations where id = v_org_id), v_org_id;

  ---------------------------------------------------------------------------
  -- 2) مستويات التصنيف وسياسة الأرقام — الدالتان قابلتان لإعادة التنفيذ.
  ---------------------------------------------------------------------------
  perform public.seed_classification_levels(v_org_id);
  perform public.seed_reference_policy(v_org_id);

  select max(rank) into v_max_rank
  from public.classification_levels where organization_id = v_org_id;

  ---------------------------------------------------------------------------
  -- 3) الحساب والعضوية.
  ---------------------------------------------------------------------------
  select id into v_user_id from auth.users where lower(email) = lower(v_admin_email);
  if v_user_id is null then
    raise exception
      'no account for %. Sign in to the app once with this email, then re-run.', v_admin_email;
  end if;

  select id into v_unit_id
  from public.org_units
  where organization_id = v_org_id and parent_id is null
  order by created_at limit 1;

  if v_unit_id is null then
    insert into public.org_units (organization_id, code, name_ar, name_en, kind)
    values (v_org_id, v_org_code, v_org_name, v_org_name_en, 'organization')
    returning id into v_unit_id;
    raise notice 'created root unit %', v_unit_id;
  end if;

  select id into v_membership_id
  from public.memberships
  where organization_id = v_org_id and user_id = v_user_id;

  if v_membership_id is null then
    insert into public.memberships
      (organization_id, user_id, org_unit_id, status, clearance_rank)
    values
      (v_org_id, v_user_id, v_unit_id, 'active', coalesce(v_max_rank, 1))
    returning id into v_membership_id;
    raise notice 'created membership %', v_membership_id;
  else
    -- ⚠️ هنا يُصلَح ما تتركه 0009: التخليص ١ يعني أن المدير لا يرى السري.
    update public.memberships
       set status = 'active',
           org_unit_id = coalesce(org_unit_id, v_unit_id),
           clearance_rank = greatest(clearance_rank, coalesce(v_max_rank, 1))
     where id = v_membership_id;
    raise notice 'membership % updated (clearance %)', v_membership_id, coalesce(v_max_rank, 1);
  end if;

  ---------------------------------------------------------------------------
  -- 4) الأدوار.
  --
  -- ⚠️ هذه الستة مجتمعة في شخص واحد **تُبطل فصل المهام**: يكتب المراسلة
  --    ويراجعها ويعتمدها ويوقّعها ويُصدرها بنفسه. مقبول في تشغيل تجريبي
  --    بشخص واحد، وغير مقبول في الإنتاج.
  --
  --    بعد إضافة موظفيك: اسحب من نفسك reviewer و approver و signatory وأسندها
  --    إلى غير كاتب المراسلة من شاشة «المستخدمون»، ثم فعّل فصل المهام.
  ---------------------------------------------------------------------------
  -- الأدوار الستة تُغطّي الدورة كاملة. `reviewer` ليس ترفًا: صلاحية
  -- `correspondence.review` لا يملكها organization_admin ولا employee، فبدونه
  -- تفشل أول خطوة (مسودة ← قيد المراجعة) — وهذا ما كشفه تمرير الدورة فعليًّا.
  foreach v_role in array array[
    'organization_admin', 'correspondence_officer', 'reviewer', 'approver', 'signatory', 'employee'
  ] loop
    insert into public.membership_roles (membership_id, role_id)
    select v_membership_id, r.id
    from public.roles r
    where r.key = v_role and r.organization_id is null
      and not exists (
        select 1 from public.membership_roles mr
        where mr.membership_id = v_membership_id and mr.role_id = r.id
      );
  end loop;

  raise notice 'bootstrap complete — admin % can now drive a letter to issuance', v_admin_email;
end $$;
