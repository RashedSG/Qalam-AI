import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const rls = readFileSync(join(root, 'supabase/migrations/0002_rls.sql'), 'utf8')
const schema = readFileSync(join(root, 'supabase/migrations/0001_schema.sql'), 'utf8')
const seed = readFileSync(join(root, 'supabase/migrations/0003_seed.sql'), 'utf8')
const phase1 = readFileSync(join(root, 'supabase/migrations/0006_phase1_security.sql'), 'utf8')
const rbacSchema = readFileSync(join(root, 'supabase/migrations/0007_org_rbac_schema.sql'), 'utf8')
const authz = readFileSync(join(root, 'supabase/migrations/0008_authorization.sql'), 'utf8')
const backfill = readFileSync(join(root, 'supabase/migrations/0009_backfill_organization.sql'), 'utf8')
const rbacRls = readFileSync(join(root, 'supabase/migrations/0010_rls_rbac.sql'), 'utf8')
const auditTriggers = readFileSync(join(root, 'supabase/migrations/0011_audit_triggers.sql'), 'utf8')
const corrCore = readFileSync(join(root, 'supabase/migrations/0012_correspondence_core.sql'), 'utf8')
const refNumbers = readFileSync(join(root, 'supabase/migrations/0013_reference_numbers.sql'), 'utf8')
const attachments = readFileSync(join(root, 'supabase/migrations/0014_attachments.sql'), 'utf8')
const referrals = readFileSync(join(root, 'supabase/migrations/0015_referrals_notifications.sql'), 'utf8')
const rlsPhase3 = readFileSync(join(root, 'supabase/migrations/0016_rls_phase3.sql'), 'utf8')
const workflow = readFileSync(join(root, 'supabase/migrations/0018_workflow.sql'), 'utf8')
const delegation = readFileSync(join(root, 'supabase/migrations/0019_delegation.sql'), 'utf8')
const rlsPhase4 = readFileSync(join(root, 'supabase/migrations/0020_rls_phase4.sql'), 'utf8')

/** كل الجداول التي يجب أن تكون محمية بـ RLS. */
const TABLES = [
  'organizations',
  'departments',
  'profiles',
  'user_preferences',
  'correspondences',
  'correspondence_versions',
  'drafts',
  'templates',
  'dictionary_entries',
  'favorites',
  'learning_sessions',
  'learning_progress',
  'ai_requests_metadata',
]

/** الجداول التي يملكها المستخدم بالكامل — يجب أن تُقيَّد بـ auth.uid() = user_id. */
const USER_OWNED = [
  'correspondences',
  'correspondence_versions',
  'drafts',
  'favorites',
  'learning_sessions',
  'learning_progress',
  'ai_requests_metadata',
]

describe('Row Level Security', () => {
  it('يُفعّل RLS على كل جدول', () => {
    for (const table of TABLES) {
      const pattern = new RegExp(`alter table public\\.${table}\\s+enable row level security;`)
      expect(rls).toMatch(pattern)
    }
  })

  it('يقيّد كل جدول يملكه المستخدم بـ auth.uid()', () => {
    for (const table of USER_OWNED) {
      const section = rls.split(`on public.${table}`)
      expect(section.length).toBeGreaterThan(1)
    }
    // كل سياسات SELECT للجداول الخاصة تعتمد على auth.uid()
    expect(rls).toContain('using (auth.uid() = user_id)')
  })

  it('لا يسمح لأي مستخدم بتعديل محتوى النظام', () => {
    expect(rls).toContain('with check (auth.uid() = user_id and is_system = false)')
  })

  it('يمنع الوصول المجهول', () => {
    expect(rls).toContain('revoke all on all tables in schema public from anon')
  })

  it('لا يمنح دور anon أي سياسة', () => {
    expect(rls).not.toMatch(/create policy[\s\S]{0,200}?to anon/)
  })
})

describe('Schema', () => {
  it('يستخدم UUID لكل المعرفات الأساسية', () => {
    expect(schema).toContain('id           uuid primary key default gen_random_uuid()')
  })

  it('يضيف created_at و updated_at لكل جدول رئيسي', () => {
    const occurrences = schema.match(/updated_at\s+timestamptz not null default now\(\)/g) ?? []
    expect(occurrences.length).toBeGreaterThanOrEqual(12)
  })

  it('يجهّز organization_id للتوسع المستقبلي دون جعله إلزاميًا', () => {
    expect(schema).toContain('organization_id uuid references public.organizations (id)')
    expect(schema).not.toMatch(/organization_id uuid not null/)
  })

  it('لا يخزّن أي محتوى مراسلات في جدول بيانات الذكاء الاصطناعي الوصفية', () => {
    const table = schema.split('create table if not exists public.ai_requests_metadata')[1]?.split(');')[0] ?? ''
    expect(table).not.toBe('')
    // أسماء أعمدة قد تحمل محتوى المستخدم — يجب ألا توجد إطلاقًا
    const contentColumns = ['body', 'prompt', 'content', 'subject', 'input', 'output', 'response', 'message']
    const declaredColumns = [...table.matchAll(/^\s{2}([a-z_]+)\s+/gm)].map((m) => m[1])
    expect(declaredColumns.length).toBeGreaterThan(0)
    for (const column of contentColumns) {
      expect(declaredColumns).not.toContain(column)
    }
  })
})

describe('Seed idempotency', () => {
  // انحدار: `on conflict do nothing` بلا هدف صريح لا يمنع شيئًا ما لم يوجد قيد تفرد،
  // وكان يضاعف بذور النظام عند إعادة تنفيذ 0003.
  it('كل ON CONFLICT في البذور يحدد عمودًا صراحةً', () => {
    const clauses = seed.match(/on conflict[^;]*do nothing/g) ?? []
    expect(clauses.length).toBe(3)
    for (const clause of clauses) {
      expect(clause).toMatch(/on conflict \((key|slug|phrase)\)/)
    }
  })

  it('كل هدف تعارض مدعوم بفهرس فريد جزئي في المخطط', () => {
    for (const [table, column] of [
      ['departments', 'key'],
      ['templates', 'slug'],
      ['dictionary_entries', 'phrase'],
    ]) {
      const pattern = new RegExp(
        `create unique index if not exists \\w+\\s+on public\\.${table} \\(${column}\\) where is_system = true`,
      )
      expect(schema).toMatch(pattern)
    }
  })
})

describe('المرحلة ١ — الجداول والإجراءات الجديدة', () => {
  it('تُفعّل RLS على كل جدول جديد', () => {
    for (const table of ['app_settings', 'signup_invites']) {
      expect(phase1).toMatch(new RegExp(`alter table public\\.${table} enable row level security;`))
    }
  })

  it('تحجب الجداول الإعدادية عن المتصفح صراحةً', () => {
    // Supabase يمنح authenticated صلاحيات افتراضية على كل جدول جديد في public،
    // فالسحب الصريح هنا ضروري لا تجميلي.
    for (const table of ['app_settings', 'signup_invites']) {
      expect(phase1).toMatch(new RegExp(`revoke all on public\\.${table} from public, anon, authenticated;`))
    }
  })

  it('لا سياسة تمنح المتصفح وصولًا إلى app_settings أو signup_invites', () => {
    const policies = phase1.match(/create policy[\s\S]*?;/g) ?? []
    for (const policy of policies) {
      expect(policy).not.toMatch(/on public\.(app_settings|signup_invites)/)
    }
  })

  it('دالة قراءة الإعدادات غير قابلة للاستدعاء من المتصفح', () => {
    expect(phase1).toMatch(/revoke all on function public\.app_setting\(text\) from public, anon, authenticated;/)
    expect(phase1).toMatch(/revoke all on function public\.signup_mode\(\) from public, anon, authenticated;/)
  })

  it('إجراءات حد المعدّل متاحة لـ authenticated فقط', () => {
    expect(phase1).toMatch(/grant execute on function public\.begin_ai_request\([^)]*\) to authenticated;/)
    expect(phase1).toMatch(/revoke all on function public\.begin_ai_request\([^)]*\)\s*\n?\s*from public, anon;/)
  })

  it('كل إجراء يعمل على auth.uid() ولا يقبل معرّف مستخدم من العميل', () => {
    for (const fn of ['begin_ai_request', 'finish_ai_request']) {
      const body = phase1.slice(phase1.indexOf(`function public.${fn}(`))
      const signature = body.slice(0, body.indexOf('returns'))
      expect(signature, `${fn} يجب ألا يقبل user_id`).not.toMatch(/user_id|p_user/)
      const impl = body.slice(0, body.indexOf('$$;'))
      expect(impl, `${fn} يجب أن يستخدم auth.uid()`).toMatch(/auth\.uid\(\)/)
      expect(impl, `${fn} يجب أن يرفض غير المصادق`).toMatch(/not authenticated/)
    }
  })

  it('حسم الطلب مقيّد بصف المستخدم وبالحالة pending', () => {
    const fn = phase1.slice(phase1.indexOf('function public.finish_ai_request('))
    const impl = fn.slice(fn.indexOf('update public.ai_requests_metadata'), fn.indexOf('$$;'))
    expect(impl).toMatch(/user_id = uid/)
    expect(impl).toMatch(/status = 'pending'/)
  })

  it('حد المعدّل ذرّي — يقفل لكل مستخدم قبل العد', () => {
    const fn = phase1.slice(phase1.indexOf('function public.begin_ai_request('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/pg_advisory_xact_lock/)
    // القفل قبل العد، وإلا فلا قيمة له.
    expect(impl.indexOf('pg_advisory_xact_lock')).toBeLessThan(impl.indexOf('into n_burst'))
  })

  it('جدول تتبّع الاستخدام لا يقبل أي عمود نصي للمحتوى', () => {
    const declared = [...phase1.matchAll(/add column if not exists (\w+)/g)].map((m) => m[1])
    for (const forbidden of ['body', 'prompt', 'text', 'content', 'subject']) {
      expect(declared).not.toContain(forbidden)
    }
  })

  it('بوابة التسجيل مفروضة في القاعدة لا في الواجهة', () => {
    expect(phase1).toMatch(/function public\.handle_new_user\(\)/)
    expect(phase1).toMatch(/signup is invite-only/)
    // المطابقة بلا حساسية لحالة الأحرف، وتستثني المنتهية والملغاة.
    const fn = phase1.slice(phase1.indexOf('function public.handle_new_user()'))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/lower\(email\) = lower\(/)
    expect(impl).toMatch(/revoked_at is null/)
    expect(impl).toMatch(/expires_at is null or expires_at > now\(\)/)
  })

  it('الوضع الافتراضي عام — لا تغيير سلوك على التثبيت الحالي', () => {
    expect(phase1).toMatch(/jsonb_build_object\('mode', 'public'\)/)
    expect(phase1).toMatch(/on conflict \(key\) do nothing/)
  })

  it('الهجرة إضافية فقط — لا حذف عمود ولا جدول ولا بيانات', () => {
    const sql = phase1.replace(/--[^\n]*/g, '')
    expect(sql).not.toMatch(/drop table/i)
    expect(sql).not.toMatch(/drop column/i)
    expect(sql).not.toMatch(/delete from/i)
    expect(sql).not.toMatch(/truncate/i)
    // إسقاط القيد مسموح لأنه يُعاد فورًا موسَّعًا، وإسقاط المُشغّل لأنه يُعاد إنشاؤه.
  })

  it('توسيع قيد الحالة يحفظ كل القيم القديمة', () => {
    const check = phase1.match(/check \(status in \(([^)]*)\)\)/)?.[1] ?? ''
    expect(check).toContain("'success'")
    expect(check).toContain("'error'")
    expect(check).toContain("'pending'")
  })
})

describe('المرحلة ٢ — المؤسسات والأدوار', () => {
  const NEW_TABLES = ['org_units', 'permissions', 'roles', 'role_permissions', 'memberships', 'membership_roles', 'audit_log']

  it('تُفعّل RLS على كل جدول جديد', () => {
    for (const table of NEW_TABLES) {
      expect(rbacRls, table).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security;`))
    }
  })

  it('كل جدول جديد له سياسة SELECT صريحة', () => {
    for (const table of NEW_TABLES) {
      expect(rbacRls, `${table} بلا سياسة قراءة`).toMatch(new RegExp(`for select to authenticated[\\s\\S]{0,400}?on public\\.${table}|on public\\.${table}[\\s\\S]{0,400}?for select to authenticated`))
    }
  })

  it('كل دوال التفويض security definer و stable', () => {
    for (const fn of ['is_org_member', 'permission_scope', 'has_permission', 'can_access_row', 'owner_unit']) {
      const body = authz.slice(authz.indexOf(`function public.${fn}(`))
      const header = body.slice(0, body.indexOf('as $$'))
      expect(header, `${fn} يجب أن تكون security definer`).toMatch(/security definer/)
      expect(header, `${fn} يجب أن تكون stable`).toMatch(/stable/)
      expect(header, `${fn} يجب أن تثبّت search_path`).toMatch(/set search_path = public/)
    }
  })

  it('لا دالة تفويض تقبل معرّف مستخدم من العميل', () => {
    for (const fn of ['is_org_member', 'permission_scope', 'has_permission']) {
      const body = authz.slice(authz.indexOf(`function public.${fn}(`))
      const signature = body.slice(0, body.indexOf('returns'))
      expect(signature, fn).not.toMatch(/p_user|user_id/)
    }
    // can_access_row تأخذ مالك الصف (لا هوية المستدعي) عن قصد، والمستدعي
    // دائمًا auth.uid() داخل الجسم — فلا يمكن للعميل أن يسأل «بصفة غيري».
    const decision = authz.slice(authz.indexOf('function public.can_access_row('))
    expect(decision.slice(0, decision.indexOf('$$;'))).toMatch(/uid\s+uuid := auth\.uid\(\)/)
    // owner_unit بحث خالص عن وحدة مالك صف — لا تتخذ قرارًا فلا تحتاج auth.uid().
    const lookup = authz.slice(authz.indexOf('function public.owner_unit('))
    expect(lookup.slice(0, lookup.indexOf('$$;'))).not.toMatch(/permission|scope/)
  })

  it('كل استدعاء تفويض في السياسات ملفوف بـ (select …) لأداء InitPlan', () => {
    // بلا اللف يُقيّم PostgreSQL الدالة مرة لكل صف بدل مرة لكل عبارة.
    const unwrapped: string[] = []
    const pattern = /public\.(is_org_member|has_permission|can_access_owned_row|can_access_row)\(/g
    for (const match of rbacRls.matchAll(pattern)) {
      const before = rbacRls.slice(Math.max(0, match.index - 9), match.index)
      if (!before.endsWith('(select ')) unwrapped.push(`${match[1]} @${match.index}`)
    }
    expect(unwrapped, `استدعاءات غير ملفوفة: ${unwrapped.join(', ')}`).toEqual([])
  })

  it('مسار المالك محفوظ في كل سياسة محتوى — التوسيع لا يستبدل', () => {
    const contentPolicies = ['correspondences_select', 'correspondences_update']
    for (const policy of contentPolicies) {
      const block = rbacRls.slice(rbacRls.indexOf(`create policy "${policy}"`))
      const body = block.slice(0, block.indexOf(';'))
      expect(body, `${policy} يجب أن يحفظ وصول المالك`).toMatch(/user_id = \(select auth\.uid\(\)\)/)
    }
  })

  it('الإنشاء والحذف يبقيان للمالك وحده', () => {
    const insert = rbacRls.slice(rbacRls.indexOf('create policy "correspondences_insert_own"'))
    expect(insert.slice(0, insert.indexOf(';'))).toMatch(/with check \(user_id = \(select auth\.uid\(\)\)\)/)
    const del = rbacRls.slice(rbacRls.indexOf('create policy "correspondences_delete_own"'))
    expect(del.slice(0, del.indexOf(';'))).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/)
  })

  it('صف بلا مؤسسة لا يصل إليه غير مالكه', () => {
    const fn = authz.slice(authz.indexOf('function public.can_access_row('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/if p_organization_id is null then return false; end if;/)
  })

  it('العضوية غير النشطة والمؤسسة غير النشطة لا تمنحان شيئًا', () => {
    for (const fn of ['my_membership', 'is_org_member', 'permission_scope']) {
      const body = authz.slice(authz.indexOf(`function public.${fn}(`))
      const impl = body.slice(0, body.indexOf('$$;'))
      expect(impl, `${fn} يجب أن يشترط عضوية نشطة`).toMatch(/m\.status = 'active'/)
      expect(impl, `${fn} يجب أن يشترط مؤسسة نشطة`).toMatch(/o\.status = 'active'/)
    }
  })

  it('أدوار النظام غير قابلة للتعديل — منع تصعيد الامتياز', () => {
    for (const policy of ['roles_update_manager', 'roles_delete_manager']) {
      const block = rbacRls.slice(rbacRls.indexOf(`create policy "${policy}"`))
      expect(block.slice(0, block.indexOf(';')), policy).toMatch(/is_system = false/)
    }
    const rolePerms = rbacRls.slice(rbacRls.indexOf('create policy "role_permissions_write"'))
    expect(rolePerms.slice(0, rolePerms.indexOf(';'))).toMatch(/r\.is_system = false/)
  })

  it('سجل التدقيق إلحاقي: لا سياسة كتابة وتُسحب الصلاحيات', () => {
    const policies = rbacRls.match(/create policy "[^"]*" on public\.audit_log[\s\S]*?;/g) ?? []
    for (const policy of policies) {
      expect(policy, 'سياسة audit_log الوحيدة يجب أن تكون للقراءة').toMatch(/for select/)
    }
    expect(rbacRls).toMatch(/revoke insert, update, delete on public\.audit_log\s+from authenticated;/)
    expect(auditTriggers).toMatch(/audit_log is append-only/)
  })

  it('سجل التدقيق بلا مفاتيح أجنبية — يبقى بعد ما يوثّقه', () => {
    const table = rbacSchema.slice(rbacSchema.indexOf('create table if not exists public.audit_log'))
    const body = table.slice(0, table.indexOf(');'))
    expect(body, 'مفتاح أجنبي هنا يجعل الحذف المتتالي يصطدم بمنع التعديل').not.toMatch(/references/)
  })

  it('قراءة سجل التدقيق تتطلب audit.view ومحصورة بالمؤسسة', () => {
    const policy = rbacRls.slice(rbacRls.indexOf('create policy "audit_log_select"'))
    expect(policy.slice(0, policy.indexOf(';'))).toMatch(/has_permission\('audit\.view', organization_id\)/)
  })

  it('إسناد الأدوار يُسجَّل تلقائيًا ويُعلَّم منح الذات', () => {
    expect(auditTriggers).toMatch(/after insert or delete on public\.membership_roles/)
    expect(auditTriggers).toMatch(/'self_grant'/)
  })

  it('النقل لا يُضيّق قيدًا ولا يفقد بيانات، ويتحقق قبل أن يمرّ', () => {
    expect(backfill).not.toMatch(/set not null/i)
    expect(backfill).not.toMatch(/drop (table|column)/i)
    // تحديثات النقل مشروطة بـ organization_id is null فلا تلمس صفًا مربوطًا.
    const updates = backfill.match(/update public\.\w+\s+set organization_id = org_id[^;]*/g) ?? []
    expect(updates.length).toBeGreaterThan(0)
    for (const update of updates) {
      expect(update, 'كل تحديث يجب أن يقتصر على الصفوف غير المربوطة').toMatch(/organization_id is null/)
    }
    expect(backfill, 'يجب أن يفشل النقل بصوت عالٍ لا أن يمرّ ناقصًا').toMatch(/raise exception\s+\n?\s*'backfill incomplete/)
  })

  it('النقل لا يمنح أي دور رؤية مراسلات مستخدم آخر', () => {
    expect(backfill).toMatch(/permission_key = 'correspondence\.view'/)
    expect(backfill).toMatch(/rp\.scope <> 'own'/)
    expect(backfill).toMatch(/cross-user correspondence visibility/)
  })

  it('النقل قابل لإعادة التنفيذ', () => {
    expect(backfill).toMatch(/on conflict \(organization_id, user_id\) do nothing/)
    expect(backfill).toMatch(/on conflict \(membership_id, role_id\) do nothing/)
    expect(backfill).toMatch(/lower\(code\) = 'default'/)
  })

  it('شجرة الوحدات تمنع الحلقات وعبور المؤسسات', () => {
    expect(rbacSchema).toMatch(/cannot be its own ancestor/)
    expect(rbacSchema).toMatch(/must belong to the same organization/)
  })

  it('الواجهة لا تعتمد على صلاحياتها المحلية كحاجز', () => {
    const authorization = readFileSync(join(root, 'src/services/db/authorization.ts'), 'utf8')
    // العقد موثّق صراحةً: الحماية في القاعدة لا في المتصفح.
    expect(authorization).toMatch(/RLS|قاعدة البيانات/)
    expect(authorization).not.toMatch(/service_role/i)
  })
})

describe('المرحلة ٣ — المراسلة المؤسسية', () => {
  const PHASE3_TABLES = [
    'classification_levels', 'reference_number_policies', 'reference_number_counters',
    'correspondence_links', 'referral_instructions', 'referrals', 'notifications',
  ]

  it('تُفعّل RLS على كل جدول جديد', () => {
    for (const table of PHASE3_TABLES) {
      expect(rlsPhase3, table).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security;`))
    }
    expect(attachments).toMatch(/alter table public\.attachments enable row level security;/)
  })

  it('source يبقى قائمًا و direction مفهوم مستقل', () => {
    expect(corrCore).toMatch(/add column if not exists direction/)
    expect(corrCore).not.toMatch(/drop column .*source/i)
    expect(corrCore).toMatch(/source` القائم يبقى كما هو للتوافق/)
  })

  it('كل عمود جديد له افتراضي يحفظ السلوك القائم', () => {
    expect(corrCore).toMatch(/direction public\.qalam_direction not null default 'outgoing'/)
    expect(corrCore).toMatch(/current_status public\.qalam_correspondence_status not null default 'draft'/)
    // التخليص الافتراضي يساوي أدنى تصنيف، فلا يفقد أحد وصولًا كان يملكه.
    expect(corrCore).toMatch(/clearance_rank integer not null default 1/)
    expect(corrCore).toMatch(/set classification_key = 'internal' where classification_key is null/)
  })

  it('التصنيف يؤثر في التحكم بالوصول لا في العرض فقط', () => {
    const fn = corrCore.slice(corrCore.indexOf('function public.can_access_row('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/classification_levels/)
    expect(impl).toMatch(/my_clearance.*<.*needed_rank|coalesce\(my_clearance, 0\) < needed_rank/)
    // المالك قبل فحص التصنيف: تصنيفه لا يحجبه عن مراسلته.
    // نقارن مواضع الشروط في المنطق، لا مواضع أسماء المتغيرات (تسبقها الإعلانات).
    const ownerGuard = impl.indexOf('if p_owner_id = uid then return true;')
    const classificationGuard = impl.indexOf('if p_classification is not null then')
    expect(ownerGuard).toBeGreaterThan(-1)
    expect(classificationGuard).toBeGreaterThan(-1)
    expect(ownerGuard).toBeLessThan(classificationGuard)
  })

  it('مولّد الأرقام ذرّي ولا يقرأ ثم يكتب', () => {
    const fn = refNumbers.slice(refNumbers.indexOf('function public.issue_reference_number('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl, 'الزيادة والقراءة عملية واحدة').toMatch(/on conflict \(organization_id, scope_key\)\s*\n?\s*do update set seq = ctr\.seq \+ 1/)
    expect(impl).toMatch(/returning ctr\.seq into next_seq/)
    expect(impl, 'لا يُعاد إصدار رقم').toMatch(/if row_data\.reference_number is not null then\s*\n\s*return row_data\.reference_number;/)
  })

  it('لا تنسيق رقم مثبّت في الكود', () => {
    // الصيغة تأتي من السياسة، والرموز تُستبدل لا تُلصق.
    expect(refNumbers).toMatch(/result := policy\.format;/)
    expect(refNumbers).toMatch(/replace\(result, '\{ORG\}'/)
  })

  it('الرقم يمر بالدالة وحدها — حارس على العمود', () => {
    expect(rlsPhase3).toMatch(/guard_reference_number/)
    expect(rlsPhase3).toMatch(/reference numbers are issued by issue_reference_number\(\)/)
    expect(refNumbers, 'الدالة ترفع راية محلية فيسمح لها الحارس').toMatch(/set_config\('qalam\.issuing_reference', 'on', true\)/)
  })

  it('العدّادات محجوبة عن المتصفح تمامًا', () => {
    expect(rlsPhase3).toMatch(/revoke all on public\.reference_number_counters from public, anon, authenticated;/)
  })

  it('مسار المرفق مُولَّد ولا يُكتب من العميل', () => {
    expect(attachments).toMatch(/storage_path\s+text generated always as/)
    expect(attachments).toMatch(/stored,/)
  })

  it('سياسات المرفقات لا تبحث عن الصف الذي تُدرجه', () => {
    // دالة STABLE تستخدم لقطة ما قبل العبارة فلا ترى الصف الجديد،
    // فينكسر INSERT … RETURNING وهو ما يُصدره عميل Supabase.
    const policy = rlsPhase3.slice(rlsPhase3.indexOf('create policy "attachments_insert"'))
    const body = policy.slice(0, policy.indexOf(';'))
    expect(body).toMatch(/can_access_attachment_row/)
    expect(body).not.toMatch(/can_access_attachment\(/)
  })

  it('لا سياسة UPDATE للمرفقات — التعديل يجعل السجل كاذبًا', () => {
    const policies = rlsPhase3.match(/create policy "[^"]*" on public\.attachments[\s\S]*?;/g) ?? []
    for (const policy of policies) {
      expect(policy).not.toMatch(/for update/)
    }
    expect(rlsPhase3).toMatch(/revoke update on public\.attachments\s+from authenticated;/)
  })

  it('سياسة Storage تشتق القرار من نفس الدالة', () => {
    expect(attachments).toMatch(/can_access_storage_object/)
    expect(attachments).toMatch(/bucket_id = 'correspondence-attachments'/)
    // مسار لا يطابق الاتفاق يُرفض بدل أن يُفترض صحيحًا.
    const fn = attachments.slice(attachments.indexOf('function public.can_access_storage_object('))
    expect(fn.slice(0, fn.indexOf('$$;'))).toMatch(/exception when others then\s*\n\s*return false;/)
  })

  it('لا سياسة UPDATE لكائنات Storage', () => {
    const storageBlock = attachments.slice(attachments.indexOf('سياسات Storage'))
    expect(storageBlock).not.toMatch(/for update/)
  })

  it('الإحالة والرد يمران بإجراءات لا بكتابة مباشرة', () => {
    expect(rlsPhase3).toMatch(/revoke insert, update, delete on public\.referrals from authenticated;/)
    for (const fn of ['create_referral', 'respond_to_referral']) {
      const body = referrals.slice(referrals.indexOf(`function public.${fn}(`))
      const impl = body.slice(0, body.indexOf('$$;'))
      expect(impl, `${fn} يجب أن يرفض غير المصادق`).toMatch(/not authenticated/)
      expect(impl, `${fn} يجب أن يفحص الصلاحية`).toMatch(/not permitted/)
    }
  })

  it('الإحالة لا تتجاوز حدود المؤسسة', () => {
    const fn = referrals.slice(referrals.indexOf('function public.create_referral('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/not an active member/)
    expect(impl).toMatch(/outside the organization/)
  })

  it('الإشعار لا يحمل محتوى مراسلة', () => {
    const table = referrals.slice(referrals.indexOf('create table if not exists public.notifications'))
    const body = table.slice(0, table.indexOf(');'))
    for (const forbidden of ['subject', 'body', 'title', 'message', 'content']) {
      expect(body, `العمود ${forbidden} يسرّب محتوى`).not.toMatch(new RegExp(`\\b${forbidden}\\s`))
    }
    expect(body, 'المحتوى مفتاح ترجمة لا نص').toMatch(/kind\s+text not null/)
  })

  it('الإشعارات لا تُنشأ ولا تُعدَّل من المتصفح', () => {
    expect(rlsPhase3).toMatch(/revoke insert, update on public\.notifications\s+from authenticated;/)
    expect(referrals).toMatch(/create trigger notify_referral_trg/)
  })

  it('السياسات المتبادلة تمر بدوال definer فلا تتكرر لا نهائيًا', () => {
    // سياسة المراسلات تحتاج الإحالات والعكس؛ الاستعلام المباشر يُنتج
    // infinite recursion detected in policy.
    const policy = rlsPhase3.slice(rlsPhase3.indexOf('create policy "correspondences_select"'))
    const body = policy.slice(0, policy.indexOf(';'))
    expect(body).toMatch(/is_referred_to_me/)
    expect(body, 'لا استعلام مباشر عن جدول الإحالات').not.toMatch(/from public\.referrals/)

    const referralPolicy = rlsPhase3.slice(rlsPhase3.indexOf('create policy "referrals_select"'))
    const referralBody = referralPolicy.slice(0, referralPolicy.indexOf(';'))
    expect(referralBody).toMatch(/can_view_correspondence/)
    expect(referralBody).not.toMatch(/from public\.correspondences/)
  })

  it('كل استدعاء تفويض في سياسات المرحلة ٣ ملفوف بـ (select …)', () => {
    const unwrapped: string[] = []
    const pattern = /public\.(is_org_member|has_permission|can_access_correspondence|can_access_attachment_row|is_referred_to_me|can_view_correspondence|is_referral_target)\(/g
    for (const match of rlsPhase3.matchAll(pattern)) {
      const before = rlsPhase3.slice(Math.max(0, match.index - 9), match.index)
      // داخل أجسام الدوال لا حاجة للف — نفحص السياسات فقط.
      const context = rlsPhase3.slice(Math.max(0, match.index - 600), match.index)
      const inPolicy = context.lastIndexOf('create policy') > context.lastIndexOf('$$')
      if (inPolicy && !before.endsWith('(select ')) unwrapped.push(`${match[1]} @${match.index}`)
    }
    expect(unwrapped, `غير ملفوف: ${unwrapped.join(', ')}`).toEqual([])
  })

  it('المرحلة ٣ إضافية — لا حذف بيانات ولا تضييق قيد', () => {
    for (const [name, sql] of [
      ['0012', corrCore], ['0013', refNumbers], ['0014', attachments],
      ['0015', referrals], ['0016', rlsPhase3],
    ] as const) {
      const stripped = sql.replace(/--[^\n]*/g, '')
      expect(stripped, `${name} لا يحذف جدولًا`).not.toMatch(/drop table/i)
      expect(stripped, `${name} لا يحذف عمودًا`).not.toMatch(/drop column/i)
      expect(stripped, `${name} لا يمسح بيانات`).not.toMatch(/truncate/i)
      expect(stripped, `${name} لا يفرض not null على عمود قائم`).not.toMatch(/alter column \w+ set not null/i)
    }
  })
})

describe('المرحلة ٤ — سير العمل والتفويض', () => {
  const PHASE4_TABLES = [
    'workflow_transitions', 'correspondence_transitions', 'signatures',
    'delegations', 'delegation_permissions',
  ]

  it('تُفعّل RLS على كل جدول جديد', () => {
    for (const table of PHASE4_TABLES) {
      expect(rlsPhase4, table).toMatch(new RegExp(`alter table public\\.${table}\\s+enable row level security;`))
    }
  })

  it('سلطة الفعل منفصلة عن صلاحية الاطّلاع — المالك لا يُستثنى', () => {
    // خلل أمسكته بوابة المرحلة: can_access_row تُرجع true للمالك فورًا،
    // فكان الموظف يعتمد مراسلته بنفسه.
    const fn = workflow.slice(workflow.indexOf('function public.can_act_on_correspondence('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl, 'لا استثناء للمالك في سلطة الفعل').not.toMatch(/p_owner_id = uid then return true/)
    expect(impl).toMatch(/permission_scope\(p_permission, p_organization_id\)/)
    // ونطاق 'own' يعني صفوفه هو — لا تجاهل الملكية بالكلية.
    expect(impl).toMatch(/if scope = 'own' then return p_owner_id = uid; end if;/)
  })

  it('الانتقال يستخدم سلطة الفعل لا صلاحية الاطّلاع', () => {
    const fn = workflow.slice(workflow.indexOf('function public.transition_correspondence('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/can_act_on_correspondence/)
    expect(impl, 'استخدام دالة الاطّلاع هنا يعيد الخلل').not.toMatch(/can_access_correspondence/)
  })

  it('الانتقالات المتاحة تُشتق من نفس السلطة', () => {
    const fn = workflow.slice(workflow.indexOf('function public.available_transitions('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/can_act_on_correspondence/)
    expect(impl, 'وتحترم فصل المهام فلا يظهر زر يفشل').toMatch(/separation_of_duties_block/)
  })

  it('لا انتقال مثبّت في الكود — الخريطة في جدول', () => {
    expect(workflow).toMatch(/create table if not exists public\.workflow_transitions/)
    const fn = workflow.slice(workflow.indexOf('function public.transition_correspondence('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/from public\.workflow_transitions/)
    expect(impl).toMatch(/transition from % to % is not allowed/)
  })

  it('عمود الحالة محمي بطبقتين', () => {
    // صلاحية العمود تمنع قبل تقييم السياسة، والمُشغّل يمسك ما يفلت.
    expect(rlsPhase4).toMatch(/revoke update \(current_status\) on public\.correspondences from authenticated;/)
    expect(workflow).toMatch(/revoke update \(current_status\) on public\.correspondences from authenticated;/)
    expect(workflow).toMatch(/status changes must go through transition_correspondence\(\)/)
  })

  it('النسخة المعتمدة لا تُعدَّل في مكانها', () => {
    const fn = workflow.slice(workflow.indexOf('function public.guard_approved_content('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/'approved', 'signed', 'issued', 'closed'/)
    expect(impl).toMatch(/approved content is immutable/)
    expect(workflow, 'والتنقيح يحفظ المعتمد إصدارًا').toMatch(/insert into public\.correspondence_versions/)
  })

  it('التوقيع لا يدّعي ما ليس له', () => {
    expect(workflow).toMatch(/ليس توقيعًا رقميًا مؤهَّلًا قانونيًا/)
    expect(workflow, 'أعمدة المزوّد مُهيَّأة ولا تُملأ اليوم').toMatch(/provider\s+text,/)
    expect(workflow, 'وبصمة النص تُثبت ما وُقّع عليه').toMatch(/encode\(sha256/)
  })

  it('التوقيع لا يُعدَّل، ومُشغّله لا يمنع الحذف المتتالي', () => {
    // مُشغّل يرفض DELETE كان سيجعل حذف المراسلة أو الحساب مستحيلًا.
    expect(rlsPhase4).toMatch(/before update on public\.signatures/)
    const trigger = rlsPhase4.slice(rlsPhase4.indexOf('create trigger signatures_no_change'))
    expect(trigger.slice(0, trigger.indexOf(';'))).not.toMatch(/delete/)
    expect(rlsPhase4).toMatch(/revoke insert, update, delete on public\.signatures\s+from authenticated;/)
  })

  it('فصل المهام سياسة اختيارية مُطفأة افتراضيًا', () => {
    const fn = workflow.slice(workflow.indexOf('function public.separation_of_duties_block('))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    // coalesce(..., false) ⇒ الغياب يعني مُطفأة، فلا يتغيّر سلوك قائم.
    expect(impl).toMatch(/coalesce\(\(policy ->> 'creator_not_approver'\)::boolean, false\)/)
    expect(impl).toMatch(/coalesce\(\(policy ->> 'reviewer_not_signatory'\)::boolean, false\)/)
  })

  it('التفويض لا يمنح أوسع مما يملكه المفوِّض', () => {
    const create = delegation.slice(delegation.indexOf('function public.create_delegation('))
    expect(create.slice(0, create.indexOf('$$;'))).toMatch(/you do not hold the permission/)

    // والأهم: يُفحص عند كل استعلام لا عند الإنشاء فقط.
    const scope = delegation.slice(delegation.indexOf('function public.delegated_scope('))
    const impl = scope.slice(0, scope.indexOf('$$;'))
    expect(impl).toMatch(/permission_scope_direct\(p_permission, p_organization_id, row_data\.delegator_id\)/)
    expect(impl, 'تفويض محصور بوحدة لا يمنح نطاق المؤسسة').toMatch(/granted := 'descendants'/)
  })

  it('التفويض ينتهي بنفسه ولا يعتمد على أحد', () => {
    const scope = delegation.slice(delegation.indexOf('function public.delegated_scope('))
    const impl = scope.slice(0, scope.indexOf('$$;'))
    expect(impl).toMatch(/d\.starts_at <= now\(\)/)
    expect(impl).toMatch(/d\.ends_at > now\(\)/)
    expect(impl).toMatch(/d\.revoked_at is null/)

    const create = delegation.slice(delegation.indexOf('function public.create_delegation('))
    const createImpl = create.slice(0, create.indexOf('$$;'))
    expect(createImpl, 'لا مدة مفتوحة').toMatch(/needs an end date/)
    expect(createImpl, 'ولا تفويض دائم متنكّر').toMatch(/cannot exceed one year/)
  })

  it('permission_scope تجمع الأدوار والتفويض دون تغيير أي سياسة', () => {
    const fn = delegation.slice(delegation.indexOf('function public.permission_scope(p_permission'))
    const impl = fn.slice(0, fn.indexOf('$$;'))
    expect(impl).toMatch(/permission_scope_direct/)
    expect(impl).toMatch(/delegated_scope/)
    expect(impl, 'يُؤخذ الأوسع').toMatch(/order by public\.scope_rank\(scope\) desc/)
  })

  it('التفويض والانتقالات والتواقيع لا تُكتب مباشرة', () => {
    for (const table of ['delegations', 'delegation_permissions', 'correspondence_transitions', 'signatures']) {
      expect(rlsPhase4, table).toMatch(
        new RegExp(`revoke insert, update, delete on public\\.${table}\\s+from authenticated;`),
      )
    }
  })

  it('المرحلة ٤ إضافية — لا حذف بيانات ولا تضييق قيد', () => {
    for (const [name, sql] of [['0018', workflow], ['0019', delegation], ['0020', rlsPhase4]] as const) {
      const stripped = sql.replace(/--[^\n]*/g, '')
      expect(stripped, `${name} لا يحذف جدولًا`).not.toMatch(/drop table/i)
      expect(stripped, `${name} لا يحذف عمودًا`).not.toMatch(/drop column/i)
      expect(stripped, `${name} لا يمسح بيانات`).not.toMatch(/truncate/i)
    }
  })
})
