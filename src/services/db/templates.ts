import { supabase } from '@/lib/supabase'
import type { Template } from '@/types/database'

export async function listTemplates(): Promise<Template[]> {
  const { data, error } = await supabase
    .from('templates')
    .select('*')
    .order('is_system', { ascending: false })
    .order('title_ar', { ascending: true })
  if (error) throw error
  return (data ?? []) as Template[]
}

export async function createTemplate(
  input: Pick<Template, 'user_id' | 'title_ar' | 'body_ar'> & Partial<Template>,
): Promise<Template> {
  const { data, error } = await supabase
    .from('templates')
    .insert({ is_system: false, ...input })
    .select('*')
    .single()
  if (error) throw error
  return data as Template
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('templates').delete().eq('id', id)
  if (error) throw error
}
