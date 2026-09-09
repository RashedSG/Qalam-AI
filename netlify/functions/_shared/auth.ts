/**
 * التحقق من هوية المستخدم قبل أي استدعاء لـ OpenAI.
 * يمنع تحوّل الدالة إلى وكيل مفتوح (open proxy) يستنزف المفتاح.
 */

export interface AuthedUser {
  id: string
  email: string | null
}

export async function verifySupabaseUser(
  authorizationHeader: string | undefined,
  supabaseUrl: string,
  supabaseAnonKey: string,
): Promise<AuthedUser | null> {
  const token = authorizationHeader?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: supabaseAnonKey,
      },
    })
    if (!res.ok) return null
    const user = (await res.json()) as { id?: string; email?: string }
    if (!user?.id) return null
    return { id: user.id, email: user.email ?? null }
  } catch {
    return null
  }
}
