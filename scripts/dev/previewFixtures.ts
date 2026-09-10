/**
 * بيانات وهمية للمعاينة البصرية. عربية وواقعية عن قصد: الشاشة التي تبدو
 * سليمة بنص لاتيني قصير قد تنكسر بعنوان عربي طويل — وهذا ما نريد رؤيته.
 *
 * لا تدخل حزمة الإنتاج: تُستورد من البديل وحده، والبديل يُبدَّل في
 * `vite.preview.config.ts`.
 */

const ORG_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const UNIT_ID = '33333333-3333-4333-8333-333333333333'
const now = new Date()
const iso = (daysAgo: number) => new Date(now.getTime() - daysAgo * 86_400_000).toISOString()
const soon = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString()

const correspondences = [
  {
    id: 'c0000001-0000-4000-8000-000000000001',
    user_id: USER_ID, created_by: USER_ID, organization_id: ORG_ID, owner_unit_id: UNIT_ID,
    title: 'تعميم بشأن تنظيم الإجازات السنوية',
    subject: 'تنظيم الإجازات السنوية للعام المالي القادم',
    body: 'سعادة مدير عام الشؤون الإدارية المحترم\n\nالسلام عليكم ورحمة الله وبركاته، وبعد:\n\nإشارةً إلى الاجتماع المنعقد بتاريخ ١٤ من الشهر الجاري، نودّ إحاطة سعادتكم بما انتهت إليه اللجنة من توصيات بشأن تنظيم الإجازات السنوية.\n\nوتفضلوا بقبول فائق الاحترام والتقدير.',
    language: 'ar', correspondence_type: 'official_letter', tone: 'formal', priority: 'normal',
    recipient: 'سعادة مدير عام الشؤون الإدارية', department_key: null, source: 'written',
    original_input: null, analysis: null, review: null, is_archived: false,
    created_at: iso(9), updated_at: iso(1),
    direction: 'outgoing', current_status: 'issued',
    reference_number: 'MOT/ADM/OUT/2026/0042', external_reference_number: '',
    sender: '', sender_organization: '', recipient_organization: 'وزارة المالية',
    classification_key: 'internal', received_at: null, issued_at: iso(1), due_at: null,
    parent_id: null, verification_token: 'a'.repeat(48),
  },
  {
    id: 'c0000002-0000-4000-8000-000000000002',
    user_id: USER_ID, created_by: USER_ID, organization_id: ORG_ID, owner_unit_id: UNIT_ID,
    title: 'طلب تزويد ببيانات المشروع',
    subject: 'طلب تزويد ببيانات مشروع التحول الرقمي للربع الثالث',
    body: 'نأمل تزويدنا ببيانات المشروع المشار إليه أعلاه في موعد أقصاه نهاية الأسبوع الجاري.',
    language: 'ar', correspondence_type: 'request', tone: 'formal', priority: 'high',
    recipient: 'إدارة تقنية المعلومات', department_key: null, source: 'written',
    original_input: null, analysis: null, review: null, is_archived: false,
    created_at: iso(4), updated_at: iso(2),
    direction: 'incoming', current_status: 'in_review',
    reference_number: null, external_reference_number: 'MOF-2026-11873',
    sender: 'أ. سارة العتيبي', sender_organization: 'وزارة المالية', recipient_organization: '',
    classification_key: 'restricted', received_at: iso(4), issued_at: null, due_at: soon(2),
    parent_id: null, verification_token: null,
  },
  {
    id: 'c0000003-0000-4000-8000-000000000003',
    user_id: USER_ID, created_by: USER_ID, organization_id: ORG_ID, owner_unit_id: UNIT_ID,
    title: 'مذكرة داخلية — ترتيبات الانتقال إلى المبنى الجديد',
    subject: 'ترتيبات الانتقال إلى المبنى الجديد',
    body: 'إلحاقًا بما سبق، نفيدكم بأن الانتقال سيتم على ثلاث مراحل بدءًا من مطلع الشهر القادم.',
    language: 'ar', correspondence_type: 'memo', tone: 'neutral', priority: 'normal',
    recipient: 'جميع الإدارات', department_key: null, source: 'written',
    original_input: null, analysis: null, review: null, is_archived: false,
    created_at: iso(2), updated_at: iso(0),
    direction: 'internal', current_status: 'draft',
    reference_number: null, external_reference_number: '',
    sender: '', sender_organization: '', recipient_organization: '',
    classification_key: 'internal', received_at: null, issued_at: null, due_at: soon(-1),
    parent_id: null, verification_token: null,
  },
]

export const FIXTURES: Record<string, unknown[]> = {
  organizations: [{
    id: ORG_ID, name: 'وزارة التجربة', name_en: 'Ministry of Trial', code: 'MOT',
    status: 'active', settings: {},
    branding: {
      letterhead: 'المملكة — وزارة التجربة — الإدارة العامة للشؤون الإدارية\nص.ب ١٢٣٤٥ — الرمز البريدي ١١١١١',
      footer: 'هاتف ٠١١٢٣٤٥٦٧٨ — البريد info@example.gov — www.example.gov',
    },
    created_at: iso(400), updated_at: iso(20),
  }],

  profiles: [{
    id: USER_ID, full_name: 'د. عبدالله بن محمد الفهد', email: 'demo@qalam.test',
    organization_id: ORG_ID, job_title: 'وكيل الوزارة للشؤون الإدارية',
    department_key: null, onboarding_completed: true,
    created_at: iso(400), updated_at: iso(3),
  }],

  user_preferences: [{
    user_id: USER_ID, language: 'ar', theme: 'system', default_tone: 'formal',
    created_at: iso(400), updated_at: iso(3),
  }],

  memberships: [{
    id: 'm0000001-0000-4000-8000-000000000001',
    organization_id: ORG_ID, user_id: USER_ID, org_unit_id: UNIT_ID,
    status: 'active', clearance_rank: 3, joined_at: iso(400),
    created_at: iso(400), updated_at: iso(400),
    // الشكل المتداخل الذي تقرأه loadAuthorization: دور ← صلاحيات ← نطاق.
    membership_roles: [
      {
        role: {
          id: 'r1', key: 'organization_admin', name_ar: 'مدير المؤسسة',
          role_permissions: [
            { permission_key: 'organization.manage', scope: 'organization' },
            { permission_key: 'users.manage', scope: 'organization' },
            { permission_key: 'roles.manage', scope: 'organization' },
            { permission_key: 'audit.view', scope: 'organization' },
            { permission_key: 'templates.manage', scope: 'organization' },
          ],
        },
      },
      {
        role: {
          id: 'r2', key: 'signatory', name_ar: 'مخوّل بالتوقيع',
          role_permissions: [
            { permission_key: 'correspondence.view', scope: 'organization' },
            { permission_key: 'correspondence.create', scope: 'organization' },
            { permission_key: 'correspondence.edit', scope: 'organization' },
            { permission_key: 'correspondence.sign', scope: 'organization' },
            { permission_key: 'correspondence.issue', scope: 'organization' },
            { permission_key: 'correspondence.refer', scope: 'organization' },
            { permission_key: 'correspondence.print', scope: 'organization' },
            { permission_key: 'correspondence.download', scope: 'organization' },
            { permission_key: 'attachment.view', scope: 'organization' },
            { permission_key: 'attachment.upload', scope: 'organization' },
            { permission_key: 'attachment.download', scope: 'organization' },
          ],
        },
      },
    ],
  }],

  org_units: [
    { id: UNIT_ID, organization_id: ORG_ID, parent_id: null, code: 'MOT',
      name_ar: 'وزارة التجربة', name_en: 'Ministry of Trial', kind: 'organization',
      path: '/mot', depth: 0, is_active: true, created_at: iso(400), updated_at: iso(400) },
    { id: '33333333-3333-4333-8333-000000000002', organization_id: ORG_ID, parent_id: UNIT_ID,
      code: 'ADM', name_ar: 'الإدارة العامة للشؤون الإدارية', name_en: 'Administration',
      kind: 'department', path: '/mot/adm', depth: 1, is_active: true,
      created_at: iso(390), updated_at: iso(390) },
    { id: '33333333-3333-4333-8333-000000000003', organization_id: ORG_ID, parent_id: UNIT_ID,
      code: 'FIN', name_ar: 'الإدارة العامة للشؤون المالية', name_en: 'Finance',
      kind: 'department', path: '/mot/fin', depth: 1, is_active: true,
      created_at: iso(390), updated_at: iso(390) },
  ],

  classification_levels: [
    { id: 'l1', organization_id: ORG_ID, key: 'internal', name_ar: 'داخلي', name_en: 'Internal',
      rank: 1, is_default: true, created_at: iso(400), updated_at: iso(400) },
    { id: 'l2', organization_id: ORG_ID, key: 'restricted', name_ar: 'مقيّد', name_en: 'Restricted',
      rank: 2, is_default: false, created_at: iso(400), updated_at: iso(400) },
    { id: 'l3', organization_id: ORG_ID, key: 'confidential', name_ar: 'سري', name_en: 'Confidential',
      rank: 3, is_default: false, created_at: iso(400), updated_at: iso(400) },
  ],

  reference_number_policies: [{
    id: 'p1', organization_id: ORG_ID, direction: null,
    format: '{ORG}/{UNIT}/{DIR}/{YYYY}/{SEQ}', seq_padding: 4,
    reset_yearly: true, per_unit: true, per_direction: true, is_active: true,
    created_at: iso(400), updated_at: iso(400),
  }],

  correspondences,
  correspondence_versions: [],
  correspondence_links: [],

  correspondence_transitions: [
    { id: 't1', correspondence_id: correspondences[0].id, organization_id: ORG_ID,
      from_status: 'approved', to_status: 'signed', actor_id: USER_ID,
      comment: 'اعتُمدت من سعادة الوكيل', created_at: iso(1) },
    { id: 't2', correspondence_id: correspondences[0].id, organization_id: ORG_ID,
      from_status: 'signed', to_status: 'issued', actor_id: USER_ID,
      comment: 'صدرت برقمها', created_at: iso(1) },
  ],

  signatures: [{
    id: 's1', correspondence_id: correspondences[0].id, organization_id: ORG_ID,
    signer_id: USER_ID, method: 'internal_workflow', provider: null, provider_ref: null,
    content_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    signed_at: iso(1),
  }],

  referrals: [{
    id: 'rf1', correspondence_id: correspondences[1].id, organization_id: ORG_ID,
    from_user_id: USER_ID, to_user_id: USER_ID, to_unit_id: null,
    instruction_key: 'for_action', note: 'للاطلاع واتخاذ اللازم، مع موافاتنا بالنتيجة.',
    status: 'pending', due_at: soon(2), responded_at: null, response: '',
    created_at: iso(2), updated_at: iso(2),
  }],

  referral_instructions: [
    { id: 'i1', organization_id: ORG_ID, key: 'for_action', name_ar: 'للإجراء', name_en: 'For action', sort_order: 1 },
    { id: 'i2', organization_id: ORG_ID, key: 'for_info', name_ar: 'للعلم', name_en: 'For information', sort_order: 2 },
  ],

  attachments: [{
    id: 'a1', correspondence_id: correspondences[0].id, organization_id: ORG_ID,
    uploaded_by: USER_ID, file_name: 'محضر-الاجتماع.pdf', mime_type: 'application/pdf',
    size_bytes: 284_913, storage_path: `${ORG_ID}/${correspondences[0].id}/a1`,
    classification_key: 'internal', created_at: iso(1),
  }],

  notifications: [
    { id: 1, user_id: USER_ID, organization_id: ORG_ID, kind: 'referral.received',
      correspondence_id: correspondences[1].id, referral_id: 'rf1', read_at: null, created_at: iso(2) },
    { id: 2, user_id: USER_ID, organization_id: ORG_ID, kind: 'correspondence.approved',
      correspondence_id: correspondences[0].id, referral_id: null, read_at: null, created_at: iso(1) },
  ],

  templates: [
    { id: 'tpl1', user_id: null, organization_id: ORG_ID, slug: 'official-letter',
      title_ar: 'خطاب رسمي — صيغة عامة', title_en: '', description_ar: 'صيغة معتمدة للمخاطبات الرسمية الصادرة.',
      description_en: '', body_ar: 'سعادة/ ... المحترم\n\nالسلام عليكم ورحمة الله وبركاته، وبعد:\n\n...',
      body_en: '', correspondence_type: 'official_letter', tone: 'formal', is_system: false,
      status: 'published', published_at: iso(30), published_by: USER_ID, retired_at: null,
      created_at: iso(60), updated_at: iso(30) },
    { id: 'tpl2', user_id: null, organization_id: ORG_ID, slug: 'memo',
      title_ar: 'مذكرة داخلية', title_en: '', description_ar: 'للتعاميم والمذكرات بين الإدارات.',
      description_en: '', body_ar: 'إلى: جميع الإدارات\nالموضوع: ...', body_en: '',
      correspondence_type: 'memo', tone: 'neutral', is_system: false,
      status: 'in_review', published_at: null, published_by: null, retired_at: null,
      created_at: iso(10), updated_at: iso(2) },
  ],

  dictionary_entries: [
    { id: 'd1', user_id: null, organization_id: null, category: 'openings',
      phrase: 'إشارةً إلى', meaning: 'للربط بمراسلة أو اجتماع سابق',
      when_to_use: 'في مطلع المراسلة عند الإحالة إلى ما سبق', example: 'إشارةً إلى خطابكم رقم (…) وتاريخ (…)',
      is_system: true, created_at: iso(300), updated_at: iso(300) },
    { id: 'd2', user_id: null, organization_id: null, category: 'closings',
      phrase: 'وتفضلوا بقبول فائق الاحترام', meaning: 'خاتمة رسمية',
      when_to_use: 'في ختام المخاطبات الرسمية', example: 'وتفضلوا بقبول فائق الاحترام والتقدير.',
      is_system: true, created_at: iso(300), updated_at: iso(300) },
  ],

  drafts: [{
    id: 'dr1', user_id: USER_ID, organization_id: ORG_ID, title: 'مسودة — رد على استفسار',
    subject: 'رد على استفسار بشأن الميزانية', body: 'بالإشارة إلى استفساركم…',
    language: 'ar', correspondence_type: 'reply', tone: 'formal',
    created_at: iso(1), updated_at: iso(0),
  }],

  favorites: [{
    id: 'f1', user_id: USER_ID, kind: 'correspondence', ref_id: correspondences[0].id,
    label: 'تعميم بشأن تنظيم الإجازات السنوية', content: '', created_at: iso(1),
  }],

  learning_progress: [{ user_id: USER_ID, level: 'intermediate', xp: 340, streak_days: 5,
    completed_sessions: 12, created_at: iso(90), updated_at: iso(0) }],
  learning_sessions: [],

  audit_log: [
    { id: 3, organization_id: ORG_ID, actor_id: USER_ID, action: 'correspondence.reference_issued',
      entity_type: 'correspondence', entity_id: correspondences[0].id,
      previous_status: null, new_status: null, metadata: { seq: 42 }, created_at: iso(1) },
    { id: 2, organization_id: ORG_ID, actor_id: USER_ID, action: 'classification.rank_changed',
      entity_type: 'classification_level', entity_id: 'l3',
      previous_status: '2', new_status: '3', metadata: { key: 'confidential', widens_access: false },
      created_at: iso(6) },
    { id: 1, organization_id: ORG_ID, actor_id: USER_ID, action: 'membership_role.granted',
      entity_type: 'membership', entity_id: 'm0000001-0000-4000-8000-000000000001',
      previous_status: null, new_status: 'signatory', metadata: { self_grant: false }, created_at: iso(20) },
  ],

  roles: [
    { id: 'r1', organization_id: null, key: 'organization_admin', name_ar: 'مدير المؤسسة', name_en: 'Org admin', is_system: true },
    { id: 'r2', organization_id: null, key: 'signatory', name_ar: 'مخوّل بالتوقيع', name_en: 'Signatory', is_system: true },
    { id: 'r3', organization_id: null, key: 'reviewer', name_ar: 'مراجع', name_en: 'Reviewer', is_system: true },
    { id: 'r4', organization_id: null, key: 'employee', name_ar: 'موظف', name_en: 'Employee', is_system: true },
  ],
  permissions: [
    { key: 'correspondence.view', name_ar: 'الاطّلاع على المراسلات', category: 'correspondence' },
    { key: 'correspondence.approve', name_ar: 'اعتماد المراسلات', category: 'correspondence' },
  ],
  role_permissions: [{ role_id: 'r1', permission_key: 'correspondence.view', scope: 'organization' }],
  membership_roles: [],
  delegations: [],
  departments: [],
}

/** نتائج الدوال. الأعداد نصوصًا حيث تعيدها PostgREST نصوصًا (bigint). */
export const RPC_FIXTURES: Record<string, unknown> = {
  org_member_directory: [
    { user_id: USER_ID, full_name: 'د. عبدالله بن محمد الفهد', email: 'demo@qalam.test' },
    { user_id: '44444444-4444-4444-8444-444444444444', full_name: 'أ. سارة بنت خالد العتيبي', email: 'sara@qalam.test' },
    { user_id: '55555555-5555-4555-8555-555555555555', full_name: 'م. فيصل بن ناصر الدوسري', email: 'faisal@qalam.test' },
  ],
  available_transitions: [
    { to_status: 'in_review', requires_comment: true, label_ar: 'إرسال للمراجعة' },
  ],
  preview_reference_format: 'MOT/ADM/OUT/2026/0001',
  validate_reference_format: [],
  search_correspondence: correspondences,
  verify_correspondence: [{
    reference_number: 'MOT/ADM/OUT/2026/0042', issued_at: iso(1),
    organization_name: 'وزارة التجربة', organization_name_en: 'Ministry of Trial',
  }],
  report_correspondence_summary: [
    { direction: 'incoming', current_status: 'in_review', total: '18', overdue: '3', avg_hours_to_issue: null },
    { direction: 'outgoing', current_status: 'issued', total: '42', overdue: '0', avg_hours_to_issue: '31.4' },
    { direction: 'internal', current_status: 'draft', total: '7', overdue: '1', avg_hours_to_issue: null },
  ],
  report_by_unit: [
    { unit_id: '33333333-3333-4333-8333-000000000002', unit_name: 'الإدارة العامة للشؤون الإدارية', incoming: '12', outgoing: '28', overdue: '2' },
    { unit_id: '33333333-3333-4333-8333-000000000003', unit_name: 'الإدارة العامة للشؤون المالية', incoming: '6', outgoing: '14', overdue: '1' },
  ],
  report_by_external_entity: [
    { entity: 'وزارة المالية', incoming: '9', outgoing: '11' },
    { entity: 'وزارة الموارد البشرية', incoming: '4', outgoing: '6' },
  ],
  report_referrals: [
    { status: 'pending', total: '5', overdue: '2', avg_hours_to_respond: null },
    { status: 'responded', total: '23', overdue: '1', avg_hours_to_respond: '18.9' },
  ],
  report_ai_usage: [
    { day: iso(2), simple_requests: '14', agent_runs: '3', total_tokens: '18420' },
    { day: iso(1), simple_requests: '21', agent_runs: '5', total_tokens: '27310' },
    { day: iso(0), simple_requests: '9', agent_runs: '1', total_tokens: '8115' },
  ],
  classification_impact: [{ correspondence_count: '12', members_now: '3', members_after: '7' }],
  mark_notifications_read: 2,
}
