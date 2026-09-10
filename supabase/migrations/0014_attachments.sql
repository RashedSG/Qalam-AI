-- =============================================================================
-- قلم | QALAM — Phase 3 (ج): المرفقات
--
-- ⚠️ الحاوية خاصة إلزامًا. لا URL عام لمستند مؤسسي إطلاقًا.
--    الوصول عبر رابط موقَّع قصير الأجل يُصدره Supabase بعد فحص السياسة.
--
-- مسار الملف: {organization_id}/{correspondence_id}/{attachment_id}
--    المؤسسة أول مقطع فيصبح عزلها قابلًا للفحص بمقارنة بادئة في سياسة Storage.
--
-- ⚠️ MANUAL ACTION: إنشاء الحاوية نفسها إعداد لوحة تحكم لا يمكن تنفيذه من
--    هجرة SQL. راجع docs/attachments.md.
-- =============================================================================

create table if not exists public.attachments (
  id                uuid primary key default gen_random_uuid(),
  correspondence_id uuid not null references public.correspondences (id) on delete cascade,
  organization_id   uuid references public.organizations (id) on delete cascade,
  /**
   * مسار الكائن في Storage — عمود مُولَّد لا يقبل الكتابة.
   *
   * لماذا مُولَّد؟ سياسة Storage تشتق الصلاحية من المسار (المقطع الثالث =
   * معرّف المرفق). لو كتبه العميل لأمكن أن يخطئ فيه فينكسر الوصول، أو أن
   * يُلفّقه فيصبح الاتفاق بين الجدول وStorage غير مضمون. التوليد يجعل
   * المسار والصف شيئًا واحدًا لا يفترقان.
   *
   * التدفق: أدرج الصف أولًا، اقرأ storage_path من الاستجابة، ثم ارفع الملف.
   */
  storage_path      text generated always as (
    coalesce(organization_id::text, 'none') || '/' || correspondence_id::text || '/' || id::text
  ) stored,
  filename          text not null,
  mime_type         text not null default 'application/octet-stream',
  size_bytes        bigint not null default 0,
  /** بصمة المحتوى — لكشف التلف أو التكرار لاحقًا. */
  checksum          text,
  /** المرفق قد يكون أكثر سرية من المراسلة؛ null = يرث تصنيفها. */
  classification_key text,
  uploaded_by       uuid not null,
  created_at        timestamptz not null default now(),
  constraint attachments_size_check check (size_bytes >= 0)
);

create index if not exists attachments_parent_idx
  on public.attachments (correspondence_id, created_at desc);
-- لا حاجة لفهرس تفرد على المسار: هو دالة في المفتاح الأساسي فتفرّده مضمون.
create index if not exists attachments_path_idx on public.attachments (storage_path);

/** التصنيف الفعلي للمرفق: تصنيفه إن حُدِّد، وإلا تصنيف مراسلته. */
create or replace function public.attachment_classification(p_attachment_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(a.classification_key, c.classification_key)
  from public.attachments a
  join public.correspondences c on c.id = a.correspondence_id
  where a.id = p_attachment_id
$$;

/**
 * قرار الوصول لمرفق — يتبع مراسلته ويطبّق تصنيفه الأشد.
 * يُستخدم في سياسات الجدول وفي سياسات Storage معًا، فيبقى القرار في موضع واحد.
 */
create or replace function public.can_access_attachment(p_permission text, p_attachment_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parent record;
begin
  select c.organization_id, c.user_id, c.owner_unit_id,
         coalesce(a.classification_key, c.classification_key) as classification
    into parent
  from public.attachments a
  join public.correspondences c on c.id = a.correspondence_id
  where a.id = p_attachment_id;

  if parent is null then return false; end if;

  return public.can_access_correspondence(
    p_permission, parent.organization_id, parent.user_id,
    parent.owner_unit_id, parent.classification
  );
end;
$$;

/** نفس القرار انطلاقًا من مسار Storage — السياسات هناك لا تعرف إلا المسار. */
create or replace function public.can_access_storage_object(p_permission text, p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  attachment_id uuid;
begin
  -- المسار: {org}/{correspondence}/{attachment}. المقطع الثالث هو المعرّف.
  begin
    attachment_id := (string_to_array(p_path, '/'))[3]::uuid;
  exception when others then
    return false;  -- مسار لا يطابق الاتفاق = لا وصول
  end;

  if attachment_id is null then return false; end if;
  return public.can_access_attachment(p_permission, attachment_id);
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'public.attachment_classification(uuid)',
    'public.can_access_attachment(text, uuid)',
    'public.can_access_storage_object(text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon;', fn);
    execute format('grant execute on function %s to authenticated;', fn);
  end loop;
end $$;


-- =============================================================================
-- RLS على جدول الميتاداتا
-- =============================================================================
alter table public.attachments enable row level security;

drop policy if exists "attachments_select" on public.attachments;
create policy "attachments_select" on public.attachments
  for select to authenticated
  using ((select public.can_access_attachment('attachment.view', id)));

drop policy if exists "attachments_insert" on public.attachments;
create policy "attachments_insert" on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.correspondences c
      where c.id = correspondence_id
        and (
          c.user_id = (select auth.uid())
          or (select public.can_access_correspondence(
                'attachment.upload', c.organization_id, c.user_id,
                c.owner_unit_id, c.classification_key))
        )
    )
  );

-- لا UPDATE: المرفق لا يُعدَّل، بل يُحذف ويُرفع بديله. تعديل الميتاداتا دون
-- تعديل الكائن نفسه يجعل السجل كاذبًا.
drop policy if exists "attachments_delete" on public.attachments;
create policy "attachments_delete" on public.attachments
  for delete to authenticated
  using (
    uploaded_by = (select auth.uid())
    or exists (
      select 1 from public.correspondences c
      where c.id = correspondence_id and c.user_id = (select auth.uid())
    )
  );

revoke update on public.attachments from authenticated;


-- =============================================================================
-- سياسات Storage — تُطبَّق فقط إن كان مخطط storage موجودًا
--
-- في بيئة اختبار محلية بلا Supabase Storage يُتخطّى هذا القسم بصمت، فتبقى
-- الهجرة قابلة للتنفيذ في كلتا البيئتين.
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema = 'storage' and table_name = 'objects') then
    raise notice 'storage schema not present — skipping storage policies';
    return;
  end if;

  execute $policy$
    drop policy if exists "qalam_attachments_select" on storage.objects;
    create policy "qalam_attachments_select" on storage.objects
      for select to authenticated
      using (
        bucket_id = 'correspondence-attachments'
        and (select public.can_access_storage_object('attachment.download', name))
      );
  $policy$;

  execute $policy$
    drop policy if exists "qalam_attachments_insert" on storage.objects;
    create policy "qalam_attachments_insert" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'correspondence-attachments'
        and (select public.can_access_storage_object('attachment.upload', name))
      );
  $policy$;

  execute $policy$
    drop policy if exists "qalam_attachments_delete" on storage.objects;
    create policy "qalam_attachments_delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'correspondence-attachments'
        and (select public.can_access_storage_object('attachment.upload', name))
      );
  $policy$;

  -- لا سياسة UPDATE على الكائنات: الاستبدال في مكانه يجعل الميتاداتا كاذبة.
  raise notice 'storage policies applied for bucket correspondence-attachments';
end $$;
