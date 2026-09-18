import { registerPlugin } from '@capacitor/core'

interface LocalLlmPlugin {
  chat(options: { prompt: string }): Promise<{ text: string }>
}

const localLlm = registerPlugin<LocalLlmPlugin>('LocalLlm')

export async function requestAssistant(prompt: string) {
  const response = await localLlm.chat({ prompt })
  return response.text
}