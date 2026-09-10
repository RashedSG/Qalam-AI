import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const netlifyToml = readFileSync(join(root, 'netlify.toml'), 'utf8')

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

describe('خصوصية سجلات الخادم', () => {
  const functionFiles = walk(join(root, 'netlify'))
  const isLogger = (file: string) => file.endsWith('_shared/log.ts')
  const isTest = (file: string) => file.endsWith('.test.ts')

  it('لا تستدعي أي دالة console مباشرة — كلها تمر بالمُسجّل المُعقّم', () => {
    const offenders = functionFiles.filter((file) => {
      if (isLogger(file) || isTest(file)) return false
      return /console\.(log|error|warn|info|debug)\s*\(/.test(stripComments(readFileSync(file, 'utf8')))
    })
    expect(offenders).toEqual([])
  })

  it('لا يُسجَّل جسم استجابة المزوّد الخارجي', () => {
    const openai = readFileSync(join(root, 'netlify/functions/_shared/openai.ts'), 'utf8')
    // قراءة الجسم عند الفشل هي بذاتها التسريب: لا res.text() ولا res.json() قبل التحقق من res.ok.
    const failureBranch = openai.slice(openai.indexOf('if (!res.ok)'), openai.indexOf('const data ='))
    expect(failureBranch).not.toMatch(/res\.(text|json)\(\)/)
    expect(failureBranch).not.toMatch(/detail/)
  })

  it('لا تُسجَّل رسالة الاستثناء الخام في مسار تنفيذ الذكاء الاصطناعي', () => {
    const ai = stripComments(readFileSync(join(root, 'netlify/functions/ai.ts'), 'utf8'))
    // النطاق مقصود: استثناءات تنفيذ الطلب هي التي قد تحمل محتوى مستخدم
    // أو صدى prompt. خطأ الإعداد قبل ذلك يحمل أسماء متغيرات بيئة فقط.
    const executionSection = ai.slice(ai.indexOf('const attempt = async'))
    expect(executionSection).not.toMatch(/err\.message/)
    expect(executionSection).not.toMatch(/String\(err\)/)
  })

  it('خطأ الإعداد يسجّل أسماء المتغيرات الناقصة فقط — لا قيمها', () => {
    const env = readFileSync(join(root, 'netlify/functions/_shared/env.ts'), 'utf8')
    // رسالة ConfigError تُبنى من أسماء ثابتة مدفوعة في missing، لا من process.env.
    const thrown = env.slice(env.indexOf('if (missing.length)'), env.indexOf('return {'))
    expect(thrown).toMatch(/missing\.join/)
    expect(thrown).not.toMatch(/process\.env/)
  })

  it('لا يستخدم كود الخادم Service Role Key', () => {
    const offenders = functionFiles.filter(
      (file) => !isTest(file) && /SERVICE_ROLE/i.test(stripComments(readFileSync(file, 'utf8'))),
    )
    expect(offenders).toEqual([])
  })
})

describe('حد المعدّل الدائم', () => {
  it('لا يعتمد الحدُّ الفعلي على ذاكرة الدالة', () => {
    const ai = readFileSync(join(root, 'netlify/functions/ai.ts'), 'utf8')
    // الحاجز المحلي مسموح كتصفية أولى، لكن يجب أن يُستدعى الحد الدائم أيضًا.
    expect(ai).toMatch(/beginAiRequest/)
    expect(ai).toMatch(/finishAiRequest/)
  })

  it('يُرجع Retry-After مع كل رفض 429', () => {
    const ai = readFileSync(join(root, 'netlify/functions/ai.ts'), 'utf8')
    const rejections = ai.match(/fail\(429[\s\S]{0,220}?\)\n/g) ?? []
    expect(rejections.length).toBeGreaterThan(0)
    for (const rejection of rejections) {
      expect(rejection).toMatch(/Retry-After/)
    }
  })

  it('يستدعي إجراءات القاعدة برمز المستخدم لا بمفتاح إداري', () => {
    const usage = readFileSync(join(root, 'netlify/functions/_shared/usage.ts'), 'utf8')
    expect(usage).toMatch(/Authorization: `Bearer \$\{ctx\.accessToken\}`/)
    // التعليقات تشرح لماذا لا نستخدم service_role، فلا تُحسب استخدامًا له.
    expect(stripComments(usage)).not.toMatch(/service_role/i)
  })
})

describe('سقف زمني للطلبات الخارجية', () => {
  it('كل استدعاء خارجي محدود بمهلة', () => {
    const openai = readFileSync(join(root, 'netlify/functions/_shared/openai.ts'), 'utf8')
    expect(openai).toMatch(/AbortController/)
    expect(openai).toMatch(/signal: controller\.signal/)

    const usage = readFileSync(join(root, 'netlify/functions/_shared/usage.ts'), 'utf8')
    expect(usage).toMatch(/AbortSignal\.timeout/)
  })
})

describe('رؤوس الأمان', () => {
  const csp = netlifyToml.match(/Content-Security-Policy = """([\s\S]*?)"""/)?.[1].replace(/\\\n/g, '') ?? ''

  it('تُعرَّف سياسة CSP', () => {
    expect(csp).not.toBe('')
  })

  it('تمنع السكربت المضمّن — لا unsafe-inline ولا unsafe-eval في script-src', () => {
    const scriptSrc = csp.match(/script-src([^;]*)/)?.[1] ?? ''
    expect(scriptSrc).not.toMatch(/unsafe-inline/)
    expect(scriptSrc).not.toMatch(/unsafe-eval/)
  })

  it('تحصر الاتصالات الصادرة ولا تسمح بمستضيف مفتوح', () => {
    const connectSrc = csp.match(/connect-src([^;]*)/)?.[1] ?? ''
    expect(connectSrc).toMatch(/'self'/)
    expect(connectSrc).toMatch(/supabase\.co/)
    expect(connectSrc.trim()).not.toMatch(/(^|\s)\*(\s|$)/)
    expect(connectSrc).not.toMatch(/https:(\s|$)/)
  })

  it('تُغلق التأطير والكائنات وقاعدة الروابط', () => {
    expect(csp).toMatch(/frame-ancestors 'none'/)
    expect(csp).toMatch(/object-src 'none'/)
    expect(csp).toMatch(/base-uri 'self'/)
    expect(csp).toMatch(/form-action 'self'/)
  })

  it('لا يسمح البناء الحالي بمصدر لم تُصرَّح به CSP', () => {
    const html = readFileSync(join(root, 'index.html'), 'utf8')
    const origins = [...html.matchAll(/https:\/\/([a-zA-Z0-9.-]+)/g)].map((m) => m[1])
    for (const origin of new Set(origins)) {
      expect(csp, `${origin} مستخدم في index.html لكنه غير مسموح في CSP`).toContain(origin)
    }
  })

  it('الميكروفون مفتوح لأصل الموقع وحده — والكاميرا مغلقة', () => {
    // فُتح في المرحلة ٦ للمساعد الصوتي. (self) لا (*) ولا نطاق طرف ثالث.
    const permissions = netlifyToml.match(/Permissions-Policy = "([^"]*)"/)?.[1] ?? ''
    expect(permissions).toMatch(/microphone=\(self\)/)
    expect(permissions).not.toMatch(/microphone=\(\*\)/)
    expect(permissions).toMatch(/camera=\(\)/)
  })

  it('لا تُخزَّن استجابات الدوال في الوسيط', () => {
    expect(netlifyToml).toMatch(/for = "\/\.netlify\/functions\/\*"/)
  })
})

describe('وكيل قلم — الحدود البنيوية', () => {
  const agentTools = readFileSync(join(root, 'netlify/functions/_shared/agentTools.ts'), 'utf8')
  const agentLoop = readFileSync(join(root, 'netlify/functions/_shared/agentLoop.ts'), 'utf8')
  const agentFn = readFileSync(join(root, 'netlify/functions/agent.ts'), 'utf8')
  const migration = readFileSync(join(root, 'supabase/migrations/0021_agent_foundation.sql'), 'utf8')

  it('كل أداة وكيل في القاعدة security invoker — لا تجاوز لـRLS', () => {
    // security definer في أداة وكيل = مسار تجاوز كامل، وأخطر خطأ ممكن هنا.
    const blocks = migration.split('create or replace function public.agent_').slice(1)
    const readTools = blocks.filter((block) => /^(search|get|list)/.test(block))
    expect(readTools.length).toBeGreaterThan(0)
    for (const block of readTools) {
      const header = block.slice(0, block.indexOf('as $$'))
      const name = block.slice(0, block.indexOf('('))
      expect(header, `agent_${name} يجب أن تكون security invoker`).toMatch(/security invoker/)
      expect(header, `agent_${name} يجب ألا تكون security definer`).not.toMatch(/security definer/)
    }
  })

  it('الأدوات تُستدعى برمز المستخدم لا بمفتاح إداري', () => {
    expect(agentTools).toMatch(/Authorization: `Bearer \$\{ctx\.accessToken\}`/)
    expect(stripComments(agentTools)).not.toMatch(/service_role/i)
    expect(stripComments(agentFn)).not.toMatch(/service_role/i)
  })

  it('لا أداة كتابة في السجل', () => {
    const names = [...agentTools.matchAll(/name: '([a-z_]+)'/g)].map((match) => match[1])
    expect(names.length).toBeGreaterThan(3)
    for (const name of names) {
      expect(name, `${name} يبدو أداة كتابة`).not.toMatch(
        /^(create|update|delete|approve|sign|issue|refer|transition|revise|grant|set|send)_/,
      )
    }
  })

  it('كل محتوى خارجي يُغلَّف — رسائل المستخدم ونتائج الأدوات', () => {
    expect(agentLoop).toMatch(/wrapUntrusted\(turn\.content/)
    expect(agentLoop).toMatch(/wrapUntrusted\(JSON\.stringify\(result\)/)
  })

  it('تعليمات النظام تُصرّح بحدود الوكيل', () => {
    expect(agentLoop).toMatch(/لا تعتمد مراسلة ولا توقّعها/)
    expect(agentLoop).toMatch(/أدواتك للقراءة فقط/)
    expect(agentLoop).toMatch(/UNTRUSTED_CONTRACT/)
  })

  it('الحلقة محدودة من كل الجهات', () => {
    for (const limit of ['maxSteps', 'maxToolCalls', 'timeoutMs', 'maxTotalTokens']) {
      expect(agentLoop, limit).toContain(limit)
    }
    expect(agentLoop, 'قائمة سماح للأدوات').toMatch(/findTool\(call\.function\.name\)/)
  })

  it('جسم خطأ المزوّد لا يُقرأ في مسار الوكيل', () => {
    const failure = agentLoop.slice(agentLoop.indexOf('if (!res.ok)'), agentLoop.indexOf('const data ='))
    expect(failure).not.toMatch(/res\.(text|json)\(\)/)
  })

  it('لا يُسجَّل نص رسالة ولا نتيجة أداة', () => {
    // نقتطع الاستدعاء نفسه لا نافذة تقديرية: النافذة الواسعة تبتلع كتلة
    // الإرجاع التي تحمل reply بطبيعتها، فيفشل الاختبار لسبب خاطئ.
    const start = agentFn.indexOf("log.info('ai.completed'")
    const logCall = agentFn.slice(start, agentFn.indexOf('})', start) + 2)
    for (const forbidden of ['reply', 'content', 'messages', 'citations']) {
      expect(logCall, `السجل يجب ألا يحمل ${forbidden}`).not.toContain(forbidden)
    }
    // السجل يحمل الأسماء والنتائج المنطقية فقط.
    expect(agentLoop).toMatch(/toolCalls\.push\(\{ tool: call\.function\.name, ok, ms:/)
  })

  it('حصة الوكيل مستقلة عن حصة المهام البسيطة', () => {
    expect(agentFn).toMatch(/begin_agent_run/)
    expect(agentFn).toMatch(/finish_agent_run/)
    expect(migration).toMatch(/'agent_limits'/)
  })

  it('الواجهة لا تتصل بأي مزوّد مباشرة', () => {
    const client = readFileSync(join(root, 'src/services/ai/agent.ts'), 'utf8')
    expect(client).toMatch(/\/\.netlify\/functions/)
    expect(stripComments(client)).not.toMatch(/api\.openai\.com/)
  })
})

describe('المساعد الصوتي — الخصوصية والحدود', () => {
  const voiceFn = readFileSync(join(root, 'netlify/functions/voice.ts'), 'utf8')
  const recorder = readFileSync(join(root, 'src/services/voice/recorder.ts'), 'utf8')
  const session = readFileSync(join(root, 'src/hooks/useVoiceSession.ts'), 'utf8')
  const intents = readFileSync(join(root, 'src/services/voice/intents.ts'), 'utf8')

  it('الصوت الخام لا يُخزَّن في أي موضع', () => {
    const server = stripComments(voiceFn)
    // لا Storage ولا قاعدة بيانات ولا ملف مؤقت.
    expect(server).not.toMatch(/storage|bucket|upload/i)
    expect(server).not.toMatch(/insert into|\.from\(['"]/)
    expect(server).not.toMatch(/writeFile|createWriteStream|\/tmp\//)

    const client = stripComments(recorder)
    expect(client, 'لا تخزين محلي للصوت').not.toMatch(/localStorage|sessionStorage|indexedDB/i)
  })

  it('لا يُسجَّل النص المنطوق في سجل الخادم', () => {
    const start = voiceFn.indexOf("log.info('voice.transcribed'")
    const logCall = voiceFn.slice(start, voiceFn.indexOf('})', start) + 2)
    expect(logCall).toMatch(/durationMs/)
    for (const forbidden of ['text', 'audio', 'payload']) {
      expect(logCall, `السجل يجب ألا يحمل ${forbidden}`).not.toContain(`${forbidden}:`)
    }
  })

  it('جسم خطأ المزوّد لا يُقرأ — قد يحمل صدى ما نُطق', () => {
    const failure = voiceFn.slice(voiceFn.indexOf('if (!res.ok)'), voiceFn.indexOf('const data ='))
    expect(failure).not.toMatch(/res\.(text|json)\(\)/)
  })

  it('الصلاحية تُطلب عند الضغط لا عند تحميل الصفحة', () => {
    // فحص الدعم (typeof …getUserMedia === 'function') لا يطلب شيئًا؛
    // الاستدعاء الفعلي هو ما يفتح نافذة الإذن. نفحص الاستدعاء لا الذِكر.
    const calls = [...recorder.matchAll(/getUserMedia\(/g)]
    expect(calls, 'استدعاء واحد فقط').toHaveLength(1)

    const implementation = recorder.slice(recorder.indexOf('export async function startRecording'))
    expect(implementation).toMatch(/getUserMedia\(/)
  })

  it('رفض الصلاحية يُصنَّف ولا يُبتلع', () => {
    expect(recorder).toMatch(/NotAllowedError/)
    expect(recorder).toMatch(/permission_denied/)
    expect(recorder).toMatch(/no_microphone/)
  })

  it('الميكروفون يُحرَّر في كل مسار — نجاح وإلغاء', () => {
    expect(recorder).toMatch(/const release = \(\) => \{/)
    // نبدأ من التنفيذ لا من تعريف الواجهة: كلاهما يحوي «stop: ()».
    const implementation = recorder.slice(recorder.indexOf('const release'))
    const stopBlock = implementation.slice(
      implementation.indexOf('stop: ()'),
      implementation.indexOf('cancel: ()'),
    )
    expect(stopBlock, 'مسار الإنهاء يُحرّر الميكروفون').toMatch(/release\(\)/)
    const cancelBlock = implementation.slice(implementation.indexOf('cancel: ()'))
    expect(cancelBlock, 'ومسار الإلغاء كذلك').toMatch(/release\(\)/)
  })

  it('بدء الاستماع يُسكت النطق — لا يُسجَّل صوت المساعد', () => {
    const start = session.slice(session.indexOf('const startListening'))
    const body = start.slice(0, start.indexOf('setState(\'listening\')'))
    expect(body).toMatch(/getTts\(\)\.stop\(\)/)
  })

  it('الأمر الحساس لا يصل الوكيل', () => {
    const sensitive = session.slice(session.indexOf("if (intent.kind === 'sensitive')"))
    const block = sensitive.slice(0, sensitive.indexOf('return'))
    expect(block, 'لا استدعاء للوكيل في مسار الأمر الحساس').not.toMatch(/askAgent/)
  })

  it('تصنيف النيّة تنقّل لا فعل', () => {
    // لا استدعاء إجراء ولا خدمة كتابة في ملف النيّات.
    expect(stripComments(intents)).not.toMatch(/supabase|rpc\(|fetch\(/)
    expect(intents).toMatch(/تنقّل\*\* لا إلى \*\*فعل/)
  })

  it('الميكروفون مسموح لأصل الموقع وحده', () => {
    const permissions = netlifyToml.match(/Permissions-Policy = "([^"]*)"/)?.[1] ?? ''
    expect(permissions).toMatch(/microphone=\(self\)/)
    expect(permissions, 'الكاميرا تبقى مغلقة').toMatch(/camera=\(\)/)
  })

  it('الصوت لا يضيف مستضيفًا خارجيًا للـCSP', () => {
    const csp = netlifyToml.match(/Content-Security-Policy = """([\s\S]*?)"""/)?.[1].replace(/\\\n/g, '') ?? ''
    const mediaSrc = csp.match(/media-src([^;]*)/)?.[1] ?? ''
    expect(mediaSrc).toMatch(/'self'/)
    expect(mediaSrc).toMatch(/blob:/)
    expect(mediaSrc, 'لا مستضيف خارجي للوسائط').not.toMatch(/https?:\/\//)
  })
})
