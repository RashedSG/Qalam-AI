-- =============================================================================
-- قلم | QALAM — إصلاح: جعل بذور النظام غير قابلة للتكرار (idempotent)
--
-- المشكلة: كتلتا departments و dictionary_entries في 0003_seed.sql تستخدمان
-- `on conflict do nothing` بدون قيد تفرد يدعمها، فلا تمنعان شيئًا فعليًا.
-- إعادة تنفيذ 0003 كانت تضاعف صفوف النظام (13→26 قسمًا، 17→34 عبارة).
-- (جدول templates كان سليمًا لأن لديه فهرسًا فريدًا جزئيًا على slug.)
--
-- هذا الملف: (1) يحذف التكرارات إن وُجدت مع الإبقاء على الأقدم،
--            (2) ينشئ فهرسين فريدين جزئيين يجعلان أي إعادة تنفيذ بلا أثر.
-- آمن ومتكرر: تنفيذه على قاعدة سليمة لا يغيّر أي صف.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) إزالة تكرارات أقسام النظام (الاحتفاظ بالأقدم لكل key)
-- -----------------------------------------------------------------------------
delete from public.departments
where id in (
  select id from (
    select id, row_number() over (partition by key order by created_at, id) as rn
    from public.departments
    where is_system = true and key is not null
  ) ranked
  where ranked.rn > 1
);

-- -----------------------------------------------------------------------------
-- 2) إزالة تكرارات عبارات القاموس (الاحتفاظ بالأقدم لكل phrase)
-- -----------------------------------------------------------------------------
delete from public.dictionary_entries
where id in (
  select id from (
    select id, row_number() over (partition by phrase order by created_at, id) as rn
    from public.dictionary_entries
    where is_system = true
  ) ranked
  where ranked.rn > 1
);

-- -----------------------------------------------------------------------------
-- 3) قيود التفرد — تحمي صفوف النظام فقط ولا تقيّد بيانات المستخدمين
-- -----------------------------------------------------------------------------
create unique index if not exists departments_system_key_idx
  on public.departments (key) where is_system = true;

create unique index if not exists dictionary_system_phrase_idx
  on public.dictionary_entries (phrase) where is_system = true;
