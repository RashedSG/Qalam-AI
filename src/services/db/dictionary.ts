import { supabase } from '@/lib/supabase'
import type { DictionaryEntry } from '@/types/database'

export async function listDictionary(): Promise<DictionaryEntry[]> {
  const { data, error } = await supabase
    .from('dictionary_entries')
    .select('*')
    .order('category', { ascending: true })
    .order('phrase', { ascending: true })
  if (error) throw error
  return (data ?? []) as DictionaryEntry[]
}

export async function createDictionaryEntry(
  input: Pick<DictionaryEntry, 'user_id' | 'category' | 'phrase'> & Partial<DictionaryEntry>,
): Promise<DictionaryEntry> {
  const { data, error } = await supabase
    .from('dictionary_entries')
    .insert({ is_system: false, ...input })
    .select('*')
    .single()
  if (error) throw error
  return data as DictionaryEntry
}

export async function deleteDictionaryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('dictionary_entries').delete().eq('id', id)
  if (error) throw error
}
