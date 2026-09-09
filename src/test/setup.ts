import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// متغيرات بيئة وهمية حتى لا يتحول التطبيق إلى شاشة "الإعداد غير مكتمل" أثناء الاختبار.
vi.stubEnv('VITE_SUPABASE_URL', 'http://localhost:54321')
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

// jsdom لا ينفّذ matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }),
})
