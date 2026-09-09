import { useContext } from 'react'
import { ThemeContext, type ThemeValue } from '@/contexts/ThemeContext'

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within <ThemeProvider>')
  return ctx
}
