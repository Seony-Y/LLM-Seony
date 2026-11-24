import { Capacitor, registerPlugin } from '@capacitor/core'

interface LocalLlmPlugin {
  chat(options: { prompt: string }): Promise<{ text: string }>
}

const localLlm = registerPlugin<LocalLlmPlugin>('LocalLlm')

export async function requestAssistant(prompt: string) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('대화는 아직 폰 앱에서만 할 수 있어요.')
  }
  // Qwen3가 생각 과정으로 토큰을 다 쓰지 않게 한다.
  const response = await localLlm.chat({ prompt: `${prompt} /no_think` })
  const answer = response.text.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim()
  if (!answer) throw new Error('대답을 만들지 못했어요. 다시 물어봐 주세요.')
  return answer
}
