import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

export interface AuthValue {
  user: User | null
  session: Session | null
  loading: boolean
  accessToken: string | null
  signInWithPassword: (email: string, password: string) => Promise<void>
  signUpWithPassword: (email: string, password: string, fullName: string) => Promise<{ needsConfirmation: boolean }>
  signInWithGoogle: () => Promise<void>
  /**
   * جاهز لإضافة Microsoft لاحقًا — Supabase يدعم مزود 'azure'.
   * تفعيله يتطلب ضبط المزود في لوحة Supabase فقط، بلا تغيير في الكود.
   */
  signInWithOAuth: (provider: 'google' | 'azure') => Promise<void>
  sendPasswordReset: (email: string) => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signUpWithPassword = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    })
    if (error) throw error
    // عند تفعيل تأكيد البريد لا تُنشأ جلسة مباشرة.
    return { needsConfirmation: !data.session }
  }, [])

  const signInWithOAuth = useCallback(async (provider: 'google' | 'azure') => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) throw error
  }, [])

  const signInWithGoogle = useCallback(() => signInWithOAuth('google'), [signInWithOAuth])

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      accessToken: session?.access_token ?? null,
      signInWithPassword,
      signUpWithPassword,
      signInWithGoogle,
      signInWithOAuth,
      sendPasswordReset,
      signOut,
    }),
    [session, loading, signInWithPassword, signUpWithPassword, signInWithGoogle, signInWithOAuth, sendPasswordReset, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
