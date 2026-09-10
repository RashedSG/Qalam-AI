import {
  BookOpen,
  BookMarked,
  Building2,
  FileEdit,
  FilePlus2,
  GraduationCap,
  History,
  Home,
  Languages,
  LayoutTemplate,
  Inbox,
  Network,
  Reply,
  Send,
  ScrollText,
  Settings,
  ClipboardList,
  UserCheck,
  ShieldCheck,
  Sparkles,
  Star,
  Bot,
  User,
  Users,
} from 'lucide-react'
import type { TranslationKey } from '@/i18n'
import type { PermissionKey } from '@/types/permissions'

export interface NavItem {
  to: string
  labelKey: TranslationKey
  icon: typeof Home
  /** يظهر العنصر فقط لمن يملك هذه الصلاحية. غيابها = يظهر للجميع. */
  permission?: PermissionKey
}

/** التنقل الرئيسي — نفس المصدر للشريط الجانبي وقائمة الجوال. */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/dashboard', labelKey: 'nav.dashboard', icon: Home },
  { to: '/write', labelKey: 'nav.write', icon: FilePlus2 },
  { to: '/reply', labelKey: 'nav.reply', icon: Reply },
  { to: '/improve', labelKey: 'nav.improve', icon: Sparkles },
  { to: '/translate', labelKey: 'nav.translate', icon: Languages },
  { to: '/learn', labelKey: 'nav.learn', icon: GraduationCap },
  // المساعد في التنقل الرئيسي لا في قسم المؤسسة: أدواته تمر بمسار المالك في
  // RLS، فيعمل للمستخدم الشخصي على مراسلاته هو.
  { to: '/assistant', labelKey: 'nav.assistant', icon: Bot },
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

/**
 * قسم الإدارة — لا يظهر إلا لمن يملك صلاحيته.
 * الإخفاء للتجربة؛ المنع الفعلي في RLS.
 */
export const ADMIN_NAV: NavItem[] = [
  { to: '/organization', labelKey: 'nav.organization', icon: Building2, permission: 'organization.manage' },
  { to: '/organization/structure', labelKey: 'nav.structure', icon: Network, permission: 'organization.manage' },
  { to: '/organization/users', labelKey: 'nav.users', icon: Users, permission: 'users.manage' },
  { to: '/organization/roles', labelKey: 'nav.roles', icon: ShieldCheck, permission: 'roles.manage' },
  { to: '/organization/audit', labelKey: 'nav.audit', icon: ScrollText, permission: 'audit.view' },
]

/**
 * المراسلة المؤسسية — لا يظهر القسم إلا لعضو مؤسسة.
 * «صندوق عملي» بلا صلاحية: كل عضو له إحالات محتملة.
 */
export const ENTERPRISE_NAV: NavItem[] = [
  { to: '/my-work', labelKey: 'nav.mywork', icon: ClipboardList },
  { to: '/delegation', labelKey: 'nav.delegation', icon: UserCheck },
  { to: '/inbox', labelKey: 'nav.inbox', icon: Inbox, permission: 'correspondence.view' },
  { to: '/outbox', labelKey: 'nav.outbox', icon: Send, permission: 'correspondence.view' },
]
