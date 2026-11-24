import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

interface DeviceActionsPlugin {
  composeMessage(options: { recipient: string; message?: string }): Promise<void>
  dial(options: { recipient: string }): Promise<void>
  shareToKakao(options: { message: string }): Promise<void>
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

/** 다른 앱에서 공유한 글을 받는다. 앱이 꺼져 있을 때 받은 글도 한 번 전달된다. */
export function onSharedText(listener: (text: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  const handle = deviceActions.addListener('sharedText', ({ text }) => listener(text))
  return () => void handle.then((registered) => registered.remove()).catch(console.error)
}
