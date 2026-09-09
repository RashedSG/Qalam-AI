/**
 * سجل مزودي الذكاء الاصطناعي.
 * لإضافة Claude أو Gemini لاحقًا: أنشئ ملف مزود جديد ينفّذ AiProvider وسجّله هنا.
 * لا حاجة لتعديل أي صفحة أو مكوّن.
 */
import { openaiProvider } from './openaiProvider'
import type { AiProvider, AiProviderId } from './types'

const registry = new Map<AiProviderId, AiProvider>([[openaiProvider.id, openaiProvider]])

const DEFAULT_PROVIDER: AiProviderId = 'openai'

let activeProviderId: AiProviderId = DEFAULT_PROVIDER

export function registerAiProvider(provider: AiProvider): void {
  registry.set(provider.id, provider)
}

export function setActiveAiProvider(id: AiProviderId): void {
  if (!registry.has(id)) {
    throw new Error(`AI provider not registered: ${id}`)
  }
  activeProviderId = id
}

export function listAiProviders(): AiProvider[] {
  return [...registry.values()]
}

export function getAiProvider(): AiProvider {
  const provider = registry.get(activeProviderId)
  if (!provider) throw new Error(`AI provider not registered: ${activeProviderId}`)
  return provider
}
