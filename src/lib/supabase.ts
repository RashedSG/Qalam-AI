import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** هل الإعدادات مكتملة؟ تُستخدم لعرض شاشة إرشاد بدل انهيار التطبيق. */
export const isSupabaseConfigured = Boolean(url && anonKey)

if (!isSupabaseConfigured && import.meta.env.DEV) {
  console.warn(
    '[qalam] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY غير مضبوطة. انسخ .env.example إلى .env.',
  )
}

/**
 * مفتاح anon مُصمَّم ليكون عامًا — الحماية الفعلية من RLS في قاعدة البيانات.
 * لا تستخدم Service Role Key هنا إطلاقًا.
 */
export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost:54321',
  anonKey ?? 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
  },
)
