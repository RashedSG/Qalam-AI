/**
 * حد معدّل بسيط في الذاكرة لكل مستخدم.
 * ملاحظة: ذاكرة الدالة غير مشتركة بين النسخ، لذا هذا حاجز أول فقط
 * وليس بديلًا عن حد معدّل مركزي عند التوسع (Upstash/Redis لاحقًا).
 */

const WINDOW_MS = 60_000
const MAX_REQUESTS = 20

const hits = new Map<string, number[]>()

export function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const list = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS)
  if (list.length >= MAX_REQUESTS) {
    hits.set(userId, list)
    return false
  }
  list.push(now)
  hits.set(userId, list)

  // تنظيف دوري بسيط لتفادي تضخم الذاكرة
  if (hits.size > 500) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < WINDOW_MS)) hits.delete(key)
    }
  }
  return true
}
