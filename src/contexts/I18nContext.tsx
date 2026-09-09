import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ar, en, type TranslationKey } from '@/i18n'
import type { Language } from '@/types/domain'

const STORAGE_KEY = 'qalam.language'

const DICTIONARIES: Record<Language, Record<TranslationKey, string>> = { ar, en }

export interface I18nValue {
  lang: Language
  dir: 'rtl' | 'ltr'
  setLang: (lang: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
}

export const I18nContext = createContext<I18nValue | null>(null)

function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'ar'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'en' ? 'en' : 'ar'
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(readStoredLanguage)
  const dir: 'rtl' | 'ltr' = lang === 'ar' ? 'rtl' : 'ltr'

  useEffect(() => {
    const root = document.documentElement
    root.lang = lang
    root.dir = dir
    try {
      window.localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // التخزين المحلي قد يكون معطلًا — لا يؤثر على عمل التطبيق.
    }
  }, [lang, dir])

  const setLang = useCallback((next: Language) => setLangState(next), [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => {
      const dict = DICTIONARIES[lang]
      let value: string = dict[key] ?? ar[key] ?? key
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          value = value.replaceAll(`{${k}}`, String(v))
        }
      }
      return value
    },
    [lang],
  )

  const value = useMemo<I18nValue>(() => ({ lang, dir, setLang, t }), [lang, dir, setLang, t])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
