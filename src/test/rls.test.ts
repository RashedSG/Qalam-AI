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
