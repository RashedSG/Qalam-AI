import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { ThemeMode } from '@/types/database'

const STORAGE_KEY = 'qalam.theme'

export interface ThemeValue {
  theme: ThemeMode
  resolved: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
}

export const ThemeContext = createContext<ThemeValue | null>(null)

function readStored(): ThemeMode {
  if (typeof window === 'undefined') return 'light'
  const v = window.localStorage.getItem(STORAGE_KEY)
  return v === 'dark' || v === 'system' ? v : 'light'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!mq) return
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.style.colorScheme = resolved
    try {
      window.localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // تجاهل — التخزين المحلي قد يكون معطلًا.
    }
  }, [theme, resolved])

  const setTheme = useCallback((next: ThemeMode) => setThemeState(next), [])
  const value = useMemo<ThemeValue>(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
