import { supabase } from '@/lib/supabase'
import type { Draft } from '@/types/database'

export async function listDrafts(userId: string, limit = 100): Promise<Draft[]> {
  const { data, error } = await supabase
    .from('drafts')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Draft[]
}

export async function getDraft(id: string): Promise<Draft | null> {
  const { data, error } = await supabase.from('drafts').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Draft | null) ?? null
}

export type NewDraft = Omit<Draft, 'id' | 'created_at' | 'updated_at' | 'organization_id'>

export async function createDraft(input: NewDraft): Promise<Draft> {
  const { data, error } = await supabase.from('drafts').insert(input).select('*').single()
  if (error) throw error
  return data as Draft
}

export async function updateDraft(id: string, patch: Partial<Draft>): Promise<Draft> {
  const { data, error } = await supabase.from('drafts').update(patch).eq('id', id).select('*').single()
  if (error) throw error
  return data as Draft
}

export async function deleteDraft(id: string): Promise<void> {
  const { error } = await supabase.from('drafts').delete().eq('id', id)
  if (error) throw error
}

export async function duplicateDraft(draft: Draft): Promise<Draft> {
  const { id: _id, created_at: _c, updated_at: _u, organization_id: _o, ...rest } = draft
  return createDraft({ ...rest, title: `${draft.title || 'مسودة'} — نسخة` })
}
