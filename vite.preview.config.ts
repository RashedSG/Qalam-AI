/**
 * وضع المعاينة البصرية — أداة تطوير لا بناء إنتاج.
 *
 * يشغّل التطبيق كاملًا ببديل عن عميل Supabase، فتُراجَع كل شاشة بالعين بلا
 * مشروع حيّ ولا بيانات ولا دورة اعتماد. البديل يُبدَّل هنا وحده: لا يستورده
 * التطبيق ولا يدخل حزمة الإنتاج.
 *
 *   npx vite --config vite.preview.config.ts
 */
import { defineConfig, mergeConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'
import base from './vite.config'

export default mergeConfig(base, defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/lib\/supabase$/,
        replacement: fileURLToPath(new URL('./scripts/dev/supabaseMock.ts', import.meta.url)),
      },
    ],
  },
  server: { port: 5200 },
}))
