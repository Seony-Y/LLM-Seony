import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

interface DeviceActionsPlugin {
  composeMessage(options: { recipient: string; message?: string }): Promise<void>
  dial(options: { recipient: string }): Promise<void>
  shareToKakao(options: { message: string }): Promise<void>
  listen(options: { prompt: string }): Promise<{ text: string }>
  addListener(
    event: 'sharedText',
    listener: (data: { text: string }) => void,
  ): Promise<PluginListenerHandle>
}

const deviceActions = registerPlugin<DeviceActionsPlugin>('DeviceActions')

function assertNative() {
  if (!Capacitor.isNativePlatform()) throw new Error('전화와 문자는 폰 앱에서 할 수 있어요.')
}

export async function composeMessage(recipient: string, message: string): Promise<void> {
  assertNative()
  await deviceActions.composeMessage({ recipient, message })
}

export async function dial(recipient: string): Promise<void> {
  assertNative()
  await deviceActions.dial({ recipient })
}

/** 받는 사람은 카카오톡에서 고른다. 웹에서는 시스템 공유 창을 쓴다. */
export async function shareToKakao(message: string): Promise<void> {
  if (Capacitor.isNativePlatform()) return deviceActions.shareToKakao({ message })
  if (!navigator.share) throw new Error('카카오톡 보내기는 폰에서 할 수 있어요.')
  try {
    await navigator.share({ text: message })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw new Error('보내지 않고 닫았어요.', { cause })
    }
    throw cause
  }
}

/** 브라우저 음성 인식. 표준 타입에 없어 쓰는 만큼만 적는다. */
interface Recognition {
  lang: string
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
}

const browser = globalThis as {
  SpeechRecognition?: new () => Recognition
  webkitSpeechRecognition?: new () => Recognition
}
const WebRecognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition

export const canListen = Capacitor.isNativePlatform() || WebRecognition !== undefined

/** 한 번 말한 것을 글로 받는다. 말없이 끝나면 빈 글이다. */
export async function listen(prompt: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      return (await deviceActions.listen({ prompt })).text
    } catch (cause) {
      // 화면만 새로 받은 예전 앱에는 음성 입력이 없다.
      if ((cause as { code?: string }).code === 'UNIMPLEMENTED') {
        throw new Error('새 앱을 설치하면 말로 입력할 수 있어요.', { cause })
      }
      throw cause
    }
  }
  if (!WebRecognition) throw new Error('이 브라우저에서는 음성 입력을 쓸 수 없어요.')
  const recognition = new WebRecognition()
  recognition.lang = 'ko-KR'
  return new Promise((resolve, reject) => {
    let text = ''
    recognition.onresult = ({ results }) => {
      text = results[0]?.[0]?.transcript ?? ''
    }
    recognition.onerror = ({ error }) => {
      if (error === 'not-allowed' || error === 'service-not-allowed') reject(new Error('마이크 권한이 필요해요.'))
      else if (error !== 'no-speech' && error !== 'aborted') reject(new Error('잘 듣지 못했어요.'))
    }
    recognition.onend = () => resolve(text.trim())
    recognition.start()
  })
}

/** 다른 앱에서 공유한 글을 받는다. 앱이 꺼져 있을 때 받은 글도 한 번 전달된다. */
export function onSharedText(listener: (text: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  const handle = deviceActions.addListener('sharedText', ({ text }) => listener(text))
  return () => void handle.then((registered) => registered.remove()).catch(console.error)
}
