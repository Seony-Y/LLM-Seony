import { Capacitor, registerPlugin } from '@capacitor/core'

interface DeviceActionsPlugin {
  composeMessage(options: { recipient: string; message?: string }): Promise<void>
  dial(options: { recipient: string }): Promise<void>
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
