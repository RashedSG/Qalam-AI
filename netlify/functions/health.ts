/** فحص جاهزية الخدمة — لا يكشف أي قيم سرية، فقط ما إذا كانت مضبوطة. */
import type { Handler } from '@netlify/functions'

export const handler: Handler = async () => ({
  statusCode: 200,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify({
    service: 'qalam-ai',
    ok: true,
    config: {
      openai: Boolean(process.env.OPENAI_API_KEY),
      supabase: Boolean(process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL),
    },
  }),
})
