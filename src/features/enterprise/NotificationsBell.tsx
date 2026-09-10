import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/States'
import { useI18n } from '@/hooks/useI18n'
import { useAuth } from '@/hooks/useAuth'
import { listNotifications, markNotificationsRead } from '@/services/db/enterprise'
import { formatRelative } from '@/lib/utils'
import type { TranslationKey } from '@/i18n'

/**
 * ⚠️ خصوصية: الإشعار لا يحمل موضوع المراسلة ولا نصها — النص هنا مفتاح ترجمة
 * ثابت. لو حمل الموضوع لتسرّب محتوى مراسلة سرية إلى من لا يملك تخليصها.
 */
export function NotificationsBell() {
  const { t, lang } = useI18n()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const notifications = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => listNotifications(),
    enabled: Boolean(user?.id),
    // الإشعارات حدث خارجي: نُحدّثها دوريًا بدل انتظار تفاعل المستخدم.
    refetchInterval: 60_000,
  })

  const markRead = useMutation({
    mutationFn: () => markNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  })

  const items = notifications.data ?? []
  const unread = items.filter((item) => !item.read_at).length

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={t('notif.title')}
        className="relative"
      >
        <Bell className="size-[18px]" aria-hidden="true" />
        {unread > 0 ? (
          <span
            className="absolute -top-0.5 end-0 min-w-4 rounded-full bg-gold-500 px-1 text-[0.65rem] font-bold leading-4 text-navy-900"
            aria-hidden="true"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('notif.title')}
        footer={
          <>
            {unread > 0 ? (
              <Button variant="outline" loading={markRead.isPending} onClick={() => markRead.mutate()}>
                {t('notif.markRead')}
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t('common.close')}
            </Button>
          </>
        }
      >
        {items.length === 0 ? (
          <EmptyState title={t('notif.empty')} />
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={
                  item.read_at
                    ? 'rounded-xl border border-[rgb(var(--q-border))] p-3'
                    : 'rounded-xl border border-gold-500/40 bg-gold-500/5 p-3'
                }
              >
                <p className="text-sm leading-7">{t(`notif.${item.kind}` as TranslationKey)}</p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="q-muted text-xs">{formatRelative(item.created_at, lang)}</span>
                  {item.entity_type === 'referral' ? (
                    <Link
                      to="/my-work"
                      onClick={() => setOpen(false)}
                      className="text-xs font-medium underline"
                    >
                      {t('mywork.title')}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}
