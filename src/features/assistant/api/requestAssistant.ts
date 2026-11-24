import { Capacitor, registerPlugin } from '@capacitor/core'

interface LocalLlmPlugin {
  chat(options: { prompt: string }): Promise<{ text: string }>
}

const localLlm = registerPlugin<LocalLlmPlugin>('LocalLlm')

interface Persona {
  assistantName: string
  userName: string
}

export async function requestAssistant(question: string, { assistantName, userName }: Persona) {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('AI 대화는 아직 폰 앱에서만 할 수 있어요.')
  }
  const today = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' }).format(new Date())
  const prompt = [
    `너는 ${userName}의 개인 비서 ${assistantName}이다. 오늘은 ${today}이다.`,
    '아래 질문 하나에만 한국어 존댓말로 두 문장 안에 답한다.',
    '앞의 대화는 무시한다. 모르면 모른다고 한다. 예약이나 검색처럼 할 수 없는 일은 못 한다고 한다.',
    `질문: ${question}`,
    // Qwen3가 생각 과정으로 토큰을 다 쓰지 않게 한다.
    '/no_think',
  ].join('\n')
  const response = await localLlm.chat({ prompt })
  const answer = response.text.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim()
  if (!answer) throw new Error('대답을 만들지 못했어요. 다시 물어봐 주세요.')
  return answer
}
