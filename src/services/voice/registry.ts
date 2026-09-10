/**
 * سجل مزودي الصوت.
 * إضافة مزوّد جديد = ملف ينفّذ الواجهة + تسجيله هنا. لا تعديل في أي مكوّن.
 */
import { whisperStt } from './whisperStt'
import { browserTts } from './browserTts'
import type { SttProvider, TtsProvider } from './types'

const sttRegistry = new Map<string, SttProvider>([[whisperStt.id, whisperStt]])
const ttsRegistry = new Map<string, TtsProvider>([[browserTts.id, browserTts]])

let activeStt = whisperStt.id
let activeTts = browserTts.id

export function registerStt(provider: SttProvider): void {
  sttRegistry.set(provider.id, provider)
}

export function registerTts(provider: TtsProvider): void {
  ttsRegistry.set(provider.id, provider)
}

export function setActiveStt(id: string): void {
  if (!sttRegistry.has(id)) throw new Error(`STT provider not registered: ${id}`)
  activeStt = id
}

export function setActiveTts(id: string): void {
  if (!ttsRegistry.has(id)) throw new Error(`TTS provider not registered: ${id}`)
  activeTts = id
}

export function getStt(): SttProvider {
  const provider = sttRegistry.get(activeStt)
  if (!provider) throw new Error(`STT provider not registered: ${activeStt}`)
  return provider
}

export function getTts(): TtsProvider {
  const provider = ttsRegistry.get(activeTts)
  if (!provider) throw new Error(`TTS provider not registered: ${activeTts}`)
  return provider
}

export function listStt(): SttProvider[] {
  return [...sttRegistry.values()]
}
