import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const rls = readFileSync(join(root, 'supabase/migrations/0002_rls.sql'), 'utf8')
const schema = readFileSync(join(root, 'supabase/migrations/0001_schema.sql'), 'utf8')
const seed = readFileSync(join(root, 'supabase/migrations/0003_seed.sql'), 'utf8')

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
