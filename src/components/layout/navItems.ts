import {
  BookOpen,
  BookMarked,
  FileEdit,
  FilePlus2,
  GraduationCap,
  History,
  Home,
  Languages,
  LayoutTemplate,
  Reply,
  Settings,
  Sparkles,
  Star,
  User,
} from 'lucide-react'
import type { TranslationKey } from '@/i18n'

export interface NavItem {
  to: string
  labelKey: TranslationKey
  icon: typeof Home
}

/** التنقل الرئيسي — نفس المصدر للشريط الجانبي وقائمة الجوال. */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: Home },
  { to: '/write', labelKey: 'nav.write', icon: FilePlus2 },
  { to: '/reply', labelKey: 'nav.reply', icon: Reply },
  { to: '/improve', labelKey: 'nav.improve', icon: Sparkles },
  { to: '/translate', labelKey: 'nav.translate', icon: Languages },
  { to: '/learn', labelKey: 'nav.learn', icon: GraduationCap },
]

export const LIBRARY_NAV: NavItem[] = [
  { to: '/templates', labelKey: 'nav.templates', icon: LayoutTemplate },
  { to: '/dictionary', labelKey: 'nav.dictionary', icon: BookOpen },
  { to: '/drafts', labelKey: 'nav.drafts', icon: FileEdit },
  { to: '/history', labelKey: 'nav.history', icon: History },
  { to: '/favorites', labelKey: 'nav.favorites', icon: Star },
]

export const ACCOUNT_NAV: NavItem[] = [
  { to: '/profile', labelKey: 'nav.profile', icon: User },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
]

/** أهم أربع وظائف للجوال + زر "المزيد". */
export const MOBILE_NAV: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: Home },
  { to: '/write', labelKey: 'nav.write', icon: FilePlus2 },
  { to: '/reply', labelKey: 'nav.reply', icon: Reply },
  { to: '/learn', labelKey: 'nav.learn', icon: BookMarked },
]
