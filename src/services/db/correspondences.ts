import { supabase } from '@/lib/supabase'
import type { Correspondence, CorrespondenceVersion } from '@/types/database'

export interface HistoryFilters {
  search?: string
  type?: string
  language?: string
  departmentKey?: string
  from?: string
  to?: string
}

export async function listCorrespondences(
  userId: string,
  filters: HistoryFilters = {},
  limit = 50,
): Promise<Correspondence[]> {
  let query = supabase
    .from('correspondences')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (filters.type) query = query.eq('correspondence_type', filters.type)
  if (filters.language) query = query.eq('language', filters.language)
  if (filters.departmentKey) query = query.eq('department_key', filters.departmentKey)
  if (filters.from) query = query.gte('created_at', filters.from)
  if (filters.to) query = query.lte('created_at', filters.to)
  if (filters.search) {
    const term = filters.search.replace(/[%,()]/g, ' ').trim()
    if (term) query = query.or(`subject.ilike.%${term}%,body.ilike.%${term}%,recipient.ilike.%${term}%`)
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Correspondence[]
}

export async function getCorrespondence(id: string): Promise<Correspondence | null> {
  const { data, error } = await supabase.from('correspondences').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Correspondence | null) ?? null
}

export type NewCorrespondence = Omit<
  Correspondence,
  'id' | 'created_at' | 'updated_at' | 'organization_id' | 'is_archived'
> &
  Partial<Pick<Correspondence, 'is_archived'>>

export async function createCorrespondence(input: NewCorrespondence): Promise<Correspondence> {
  const { data, error } = await supabase.from('correspondences').insert(input).select('*').single()
  if (error) throw error
  return data as Correspondence
}

export async function updateCorrespondence(
  id: string,
  patch: Partial<Correspondence>,
): Promise<Correspondence> {
  const { data, error } = await supabase
    .from('correspondences')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw error
  return data as Correspondence
}

export async function deleteCorrespondence(id: string): Promise<void> {
  const { error } = await supabase.from('correspondences').delete().eq('id', id)
  if (error) throw error
}

export async function listVersions(correspondenceId: string): Promise<CorrespondenceVersion[]> {
  const { data, error } = await supabase
    .from('correspondence_versions')
    .select('*')
    .eq('correspondence_id', correspondenceId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CorrespondenceVersion[]
}

export async function addVersion(input: {
  correspondence_id: string
  user_id: string
  variant_kind: string
  subject: string
  body: string
  note?: string
}): Promise<CorrespondenceVersion> {
  const { data, error } = await supabase
    .from('correspondence_versions')
    .insert({ note: '', ...input })
    .select('*')
    .single()
  if (error) throw error
  return data as CorrespondenceVersion
}
