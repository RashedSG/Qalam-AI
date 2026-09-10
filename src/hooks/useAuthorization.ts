import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { can, EMPTY_AUTHORIZATION, loadAuthorization } from '@/services/db/authorization'
import type { PermissionKey, Scope } from '@/types/permissions'

/**
 * سياق التفويض للمستخدم الحالي.
 *
 * يُحمَّل مرة ويبقى في الذاكرة: الأدوار لا تتغير في أثناء الجلسة عادةً، وتغييرها
 * يمر بواجهة الإدارة التي تُبطل هذا الاستعلام بنفسها.
 */
export function useAuthorization() {
  const { user } = useAuth()

  const query = useQuery({
    queryKey: ['authorization', user?.id],
    queryFn: loadAuthorization,
    enabled: Boolean(user?.id),
    staleTime: 5 * 60 * 1000,
  })

  const context = query.data ?? EMPTY_AUTHORIZATION

  return {
    ...context,
    loading: query.isLoading,
    /** لإخفاء عناصر الواجهة فقط — الحماية في قاعدة البيانات. */
    can: (permission: PermissionKey, scope: Scope = 'own') => can(context, permission, scope),
    refetch: query.refetch,
  }
}
