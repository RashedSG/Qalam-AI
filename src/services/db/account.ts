import { supabase } from '@/lib/supabase'

/** حذف كل بيانات المستخدم مع الإبقاء على الحساب. */
export async function deleteMyData(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_data')
  if (error) throw error
}

/** حذف الحساب نهائيًا. لا يمكن التراجع. */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account')
  if (error) throw error
  await supabase.auth.signOut()
}
