import { supabase } from '@/lib/supabase'
import type { Favorite, FavoriteKind } from '@/types/database'

export async function listFavorites(userId: string): Promise<Favorite[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as Favorite[]
}

export async function addFavorite(input: {
  user_id: string
  kind: FavoriteKind
  ref_id?: string | null
  label?: string
  content?: string
}): Promise<Favorite> {
  const { data, error } = await supabase
    .from('favorites')
    .upsert(
      { label: '', content: '', ref_id: null, ...input },
      { onConflict: 'user_id,kind,ref_id', ignoreDuplicates: false },
    )
    .select('*')
    .single()
  if (error) throw error
  return data as Favorite
}

export async function removeFavorite(id: string): Promise<void> {
  const { error } = await supabase.from('favorites').delete().eq('id', id)
  if (error) throw error
}
