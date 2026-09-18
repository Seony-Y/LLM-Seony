import { registerPlugin } from '@capacitor/core'

interface DeviceActionsPlugin {
  openCamera(): Promise<void>
  composeMessage(options: { recipient: string; message?: string }): Promise<void>
  dial(options: { recipient: string }): Promise<void>
}

type DeviceCommand =
  | { type: 'camera' }
  | { type: 'message'; recipient: string; message?: string }
  | { type: 'call'; recipient: string }

const deviceActions = registerPlugin<DeviceActionsPlugin>('DeviceActions')

export function parseDeviceCommand(input: string): DeviceCommand | null {
  const command = input.trim().replace(/[.!?]+$/, '')

  if (/^(?:카메라|사진기)(?:를)?\s*(?:켜|열어)(?:\s*줘)?$/.test(command)) {
    return { type: 'camera' }
  }

  const callMatch = command.match(
    /^(.+?)(?:한테|에게|에)\s*(?:전화(?:를)?\s*)?(?:걸어|전화해)(?:\s*줘)?$/,
  )
  if (callMatch) {
    return { type: 'call', recipient: callMatch[1].trim() }
  }

  const messageMatch = command.match(
    /^(.+?)(?:한테|에게|에)\s*(?:(?:(.+?)(?:이라고|라고)|(.+?다고))\s*)?(?:메시지|메세지|문자)(?:를)?\s*(?:보내|작성해)(?:\s*줘)?$/,
  )
  if (messageMatch) {
    const message = (messageMatch[2] ?? messageMatch[3])?.trim()
    return {
      type: 'message',
      recipient: messageMatch[1].trim(),
      ...(message ? { message } : {}),
    }
  }

  return null
}

export async function executeDeviceCommand(command: DeviceCommand): Promise<string> {
  if (command.type === 'camera') {
    await deviceActions.openCamera()
    return '카메라를 열었습니다.'
  }

  if (command.type === 'call') {
    await deviceActions.dial({ recipient: command.recipient })
    return `${command.recipient} 연락처로 전화 화면을 열었습니다.`
  }

  await deviceActions.composeMessage({
    recipient: command.recipient,
    message: command.message,
  })
  return `${command.recipient} 연락처로 메시지 작성 화면을 열었습니다.`
}