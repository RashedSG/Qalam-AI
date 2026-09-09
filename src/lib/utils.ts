import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** تنسيق تاريخ قصير حسب لغة الواجهة. */
export function formatDate(value: string | null | undefined, lang: 'ar' | 'en' = 'ar'): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
}

/** "منذ ٣ أيام" */
export function formatRelative(value: string | null | undefined, lang: 'ar' | 'en' = 'ar'): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diffMs = date.getTime() - Date.now()
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ]
  const rtf = new Intl.RelativeTimeFormat(lang === 'ar' ? 'ar-AE' : 'en-AE', { numeric: 'auto' })
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit)
  }
  return rtf.format(0, 'minute')
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** عنوان مقترح من الموضوع أو أول سطر. */
export function deriveTitle(subject: string, body: string, fallback = 'مراسلة بدون عنوان'): string {
  const s = subject.trim()
  if (s) return s.slice(0, 120)
  const firstLine = body.trim().split('\n').find((l) => l.trim().length > 0)
  return firstLine ? firstLine.trim().slice(0, 120) : fallback
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/** لون شارة الدرجة (٠–١٠٠). */
export function scoreTone(score: number): 'good' | 'warn' | 'bad' {
  if (score >= 85) return 'good'
  if (score >= 65) return 'warn'
  return 'bad'
}
