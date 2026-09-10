import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const rls = readFileSync(join(root, 'supabase/migrations/0002_rls.sql'), 'utf8')
const schema = readFileSync(join(root, 'supabase/migrations/0001_schema.sql'), 'utf8')
const seed = readFileSync(join(root, 'supabase/migrations/0003_seed.sql'), 'utf8')
const phase1 = readFileSync(join(root, 'supabase/migrations/0006_phase1_security.sql'), 'utf8')

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
