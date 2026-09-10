-- =============================================================================
-- قلم | QALAM — Phase 4 (ج): RLS لسير العمل والتفويض
-- =============================================================================

alter table public.workflow_transitions        enable row level security;
alter table public.correspondence_transitions  enable row level security;
alter table public.signatures                  enable row level security;
alter table public.delegations                 enable row level security;
alter table public.delegation_permissions      enable row level security;


-- -----------------------------------------------------------------------------
-- workflow_transitions — خريطة سير العمل. يقرأها كل عضو، ويعدّلها من يملك
-- organization.manage. صفوف النظام (organization_id is null) للقراءة فقط.
-- -----------------------------------------------------------------------------
drop policy if exists "workflow_transitions_select" on public.workflow_transitions;
create policy "workflow_transitions_select" on public.workflow_transitions
  for select to authenticated
  using (organization_id is null or (select public.is_org_member(organization_id)));

drop policy if exists "workflow_transitions_write" on public.workflow_transitions;
create policy "workflow_transitions_write" on public.workflow_transitions
  for all to authenticated
  using (
    organization_id is not null
    and (select public.has_permission('organization.manage', organization_id))
  )
  with check (
    organization_id is not null
    and (select public.has_permission('organization.manage', organization_id))
  );


-- -----------------------------------------------------------------------------
-- correspondence_transitions — سجل تشغيلي يتبع صلاحية مراسلته.
-- الكتابة عبر transition_correspondence وحدها.
-- -----------------------------------------------------------------------------
drop policy if exists "correspondence_transitions_select" on public.correspondence_transitions;
create policy "correspondence_transitions_select" on public.correspondence_transitions
  for select to authenticated
  using ((select public.can_view_correspondence(correspondence_id)));

revoke insert, update, delete on public.correspondence_transitions from authenticated;


-- -----------------------------------------------------------------------------
-- signatures — تتبع صلاحية المراسلة، ولا تُكتب ولا تُعدَّل ولا تُحذف مباشرة.
-- توقيع قابل للحذف ليس توقيعًا.
-- -----------------------------------------------------------------------------
drop policy if exists "signatures_select" on public.signatures;
create policy "signatures_select" on public.signatures
  for select to authenticated
  using ((select public.can_view_correspondence(correspondence_id)));

revoke insert, update, delete on public.signatures from authenticated;

/**
 * التوقيع لا يتغيّر أبدًا.
 *
 * ⚠️ على UPDATE فقط، لا DELETE — عن قصد. مُشغّل يرفض الحذف يمنع الحذف
 *    المتتالي أيضًا، فيصبح حذف المراسلة أو المستخدم أو المؤسسة مستحيلًا.
 *    (نفس الفخ الذي كسر delete_my_account() في المرحلة ٢.)
 *
 *    الضمان المطلوب هو أن **المستخدم** لا يحذف توقيعًا، وذلك مفروض بسحب
 *    صلاحية DELETE وبغياب أي سياسة تسمح بها — لا بمُشغّل يشلّ حذف الأب.
 *    زوال التوقيع مع زوال مراسلته سلوك صحيح: توقيع بلا موقَّع عليه لا معنى له.
 */
create or replace function public.signatures_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'signatures are immutable' using errcode = '42501';
end;
$$;

drop trigger if exists signatures_no_change on public.signatures;
create trigger signatures_no_change
  before update on public.signatures
  for each statement execute function public.signatures_immutable();


-- -----------------------------------------------------------------------------
-- delegations — يراها طرفاها ومن يملك users.manage. الكتابة عبر إجراءين.
-- -----------------------------------------------------------------------------
drop policy if exists "delegations_select" on public.delegations;
create policy "delegations_select" on public.delegations
  for select to authenticated
  using (
    delegator_id = (select auth.uid())
    or delegate_id = (select auth.uid())
    or (select public.has_permission('users.manage', organization_id))
  );

revoke insert, update, delete on public.delegations from authenticated;

drop policy if exists "delegation_permissions_select" on public.delegation_permissions;
create policy "delegation_permissions_select" on public.delegation_permissions
  for select to authenticated
  using (exists (
    select 1 from public.delegations d
    where d.id = delegation_id
      and (d.delegator_id = (select auth.uid())
           or d.delegate_id = (select auth.uid())
           or (select public.has_permission('users.manage', d.organization_id)))
  ));

revoke insert, update, delete on public.delegation_permissions from authenticated;


-- =============================================================================
-- منع الوصول المجهول (تكرار مقصود)
-- =============================================================================
revoke all on all tables in schema public from anon;
revoke all on public.app_settings              from public, anon, authenticated;
revoke all on public.signup_invites            from public, anon, authenticated;
revoke all on public.reference_number_counters from public, anon, authenticated;
revoke insert, update, delete on public.audit_log                 from authenticated;
revoke insert, update, delete on public.permissions               from authenticated;
revoke insert, update, delete on public.referrals                 from authenticated;
revoke insert, update, delete on public.correspondence_transitions from authenticated;
revoke insert, update, delete on public.signatures                from authenticated;
revoke insert, update, delete on public.delegations               from authenticated;
revoke insert, update, delete on public.delegation_permissions    from authenticated;
revoke insert, update on public.notifications                     from authenticated;
revoke update on public.attachments                               from authenticated;
-- يُعاد بعد revoke all أعلاه: سحب صلاحية العمود لا ينجو من سحب شامل ثم منح.
revoke update (current_status) on public.correspondences from authenticated;
