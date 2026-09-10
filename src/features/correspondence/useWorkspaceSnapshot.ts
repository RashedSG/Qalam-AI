import { useEffect, useRef } from 'react'
import { clearSnapshot, saveSnapshot, type WorkspaceKey } from './workspaceStorage'

const DEBOUNCE_MS = 600

/**
 * يحفظ لقطة العمل الحالية محليًا كلما تغيّرت، بتأخير بسيط لتفادي الكتابة المتكررة.
 * `useful` يمنع كتابة لقطة فارغة تُظهر شريط الاستعادة بلا داعٍ.
 */
export function useWorkspaceSnapshot<T>(key: WorkspaceKey, snapshot: T, useful: boolean): void {
  const serialized = JSON.stringify(snapshot)
  const lastWritten = useRef<string | null>(null)

  useEffect(() => {
    if (!useful) {
      // لم يعد هناك عمل يستحق الحفظ (بدء من جديد مثلًا).
      if (lastWritten.current !== null) {
        clearSnapshot(key)
        lastWritten.current = null
      }
      return
    }

    if (serialized === lastWritten.current) return

    const id = window.setTimeout(() => {
      saveSnapshot(key, JSON.parse(serialized) as T)
      lastWritten.current = serialized
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(id)
  }, [key, serialized, useful])
}
