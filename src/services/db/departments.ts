import { supabase } from '@/lib/supabase'
import type { Department } from '@/types/database'

export async function fetchDepartments(): Promise<Department[]> {
  const { data, error } = await supabase
    .from('departments')
    .select('*')
    .order('is_system', { ascending: false })
    .order('name_ar', { ascending: true })
  if (error) throw error
  return (data ?? []) as Department[]
}

export async function createCustomDepartment(
  userId: string,
  nameAr: string,
  nameEn = '',
): Promise<Department> {
  const { data, error } = await supabase
    .from('departments')
    .insert({ user_id: userId, name_ar: nameAr, name_en: nameEn, is_system: false })
    .select('*')
    .single()
  if (error) throw error
  return data as Department
}
