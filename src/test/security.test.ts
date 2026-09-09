import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

/** يزيل التعليقات حتى لا تُحسب الإشارات التوثيقية كتسريب فعلي. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(full)) out.push(full)
  }
  return out
}

describe('أمن الأسرار', () => {
  const clientFiles = walk(join(root, 'src'))

  it('لا يقرأ كود المتصفح OPENAI_API_KEY إطلاقًا', () => {
    const offenders = clientFiles.filter((file) => {
      if (file.includes('/test/') || file.endsWith('.test.ts')) return false
      return /OPENAI_API_KEY/.test(stripComments(readFileSync(file, 'utf8')))
    })
    expect(offenders).toEqual([])
  })

  it('لا يستخدم كود المتصفح Service Role Key', () => {
    const offenders = clientFiles.filter((file) => {
      if (file.includes('/test/') || file.endsWith('.test.ts')) return false
      return /SERVICE_ROLE/i.test(stripComments(readFileSync(file, 'utf8')))
    })
    expect(offenders).toEqual([])
  })

  it('لا يتصل كود المتصفح بـ api.openai.com مباشرة', () => {
    const offenders = clientFiles.filter((file) => {
      if (file.includes('/test/') || file.endsWith('.test.ts')) return false
      return /api\.openai\.com/.test(stripComments(readFileSync(file, 'utf8')))
    })
    expect(offenders).toEqual([])
  })

  it('لا تُشحن وحدات الـ prompts إلى المتصفح عبر أي مكوّن أو صفحة', () => {
    const uiDirs = ['components', 'pages', 'features', 'contexts', 'hooks']
    const offenders = clientFiles.filter((file) => {
      if (!uiDirs.some((dir) => file.includes(`/src/${dir}/`))) return false
      return /from ['"]@\/prompts\//.test(readFileSync(file, 'utf8'))
    })
    expect(offenders).toEqual([])
  })

  it('لا يحتوي .env.example على أي قيمة سرية فعلية', () => {
    const env = readFileSync(join(root, '.env.example'), 'utf8')
    expect(env).toMatch(/^OPENAI_API_KEY=$/m)
    expect(env).not.toMatch(/sk-[A-Za-z0-9]/)
    expect(env).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
  })

  it('يستثني .env من Git', () => {
    const ignore = readFileSync(join(root, '.gitignore'), 'utf8')
    expect(ignore).toMatch(/^\.env$/m)
  })
})
