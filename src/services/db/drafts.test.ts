import { beforeEach, describe, expect, it, vi } from 'vitest'

/** عميل Supabase وهمي يلتقط الاستدعاءات ويعيد صفًا ثابتًا. */
const state = {
  table: '',
  inserted: null as unknown,
  updated: null as unknown,
  deletedId: '',
  filters: [] as Array<[string, string]>,
}

const row = {
  id: 'draft-1',
  user_id: 'user-1',
  title: 'متابعة طلب',
  subject: 'متابعة طلب شراء',
  body: 'نص المراسلة',
  language: 'ar',
  correspondence_type: 'follow_up',
  recipient: 'الإدارة المالية',
  department_key: null,
  original_input: 'فكرة المستخدم',
  analysis: null,
  organization_id: null,
  created_at: '2026-09-09T10:00:00Z',
  updated_at: '2026-09-09T10:00:00Z',
}

function builder() {
  const api = {
    select: () => api,
    eq: (col: string, val: string) => {
      state.filters.push([col, val])
      return api
    },
    order: () => api,
    limit: () => Promise.resolve({ data: [row], error: null }),
    maybeSingle: () => Promise.resolve({ data: row, error: null }),
    single: () => Promise.resolve({ data: row, error: null }),
    insert: (payload: unknown) => {
      state.inserted = payload
      return api
    },
    update: (payload: unknown) => {
      state.updated = payload
      return api
    },
    delete: () => api,
    then: undefined,
  }
  return api
}

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    from: (table: string) => {
      state.table = table
      const api = builder()
      // delete().eq() يجب أن يُرجع Promise
      const originalDelete = api.delete
      api.delete = () => {
        const chain = {
          eq: (_col: string, val: string) => {
            state.deletedId = val
            return Promise.resolve({ error: null })
          },
        }
        void originalDelete
        return chain as unknown as typeof api
      }
      return api
    },
  },
}))

const { createDraft, deleteDraft, duplicateDraft, listDrafts, updateDraft } = await import('./drafts')

beforeEach(() => {
  state.table = ''
  state.inserted = null
  state.updated = null
  state.deletedId = ''
  state.filters = []
})

describe('drafts service', () => {
  it('يجلب مسودات المستخدم من الجدول الصحيح ومقيّدة بمعرّفه', async () => {
    const result = await listDrafts('user-1')
    expect(state.table).toBe('drafts')
    expect(state.filters).toContainEqual(['user_id', 'user-1'])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('draft-1')
  })

  it('ينشئ مسودة مع ربطها بالمستخدم', async () => {
    await createDraft({
      user_id: 'user-1',
      title: 'عنوان',
      subject: 'موضوع',
      body: 'نص',
      language: 'ar',
      correspondence_type: 'follow_up',
      recipient: 'المالية',
      department_key: null,
      original_input: null,
      analysis: null,
    })
    expect(state.table).toBe('drafts')
    expect(state.inserted).toMatchObject({ user_id: 'user-1', body: 'نص' })
  })

  it('يحدّث المسودة بالحقول الممرّرة فقط', async () => {
    await updateDraft('draft-1', { body: 'نص محدّث' })
    expect(state.updated).toEqual({ body: 'نص محدّث' })
    expect(state.filters).toContainEqual(['id', 'draft-1'])
  })

  it('يحذف المسودة بالمعرّف', async () => {
    await deleteDraft('draft-1')
    expect(state.deletedId).toBe('draft-1')
  })

  it('يستنسخ المسودة دون نسخ المعرّف أو الطوابع الزمنية', async () => {
    await duplicateDraft(row as never)
    const payload = state.inserted as Record<string, unknown>
    expect(payload).not.toHaveProperty('id')
    expect(payload).not.toHaveProperty('created_at')
    expect(payload).not.toHaveProperty('updated_at')
    expect(payload.title).toBe('متابعة طلب — نسخة')
    expect(payload.user_id).toBe('user-1')
  })
})
