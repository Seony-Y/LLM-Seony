import { Capacitor, registerPlugin } from '@capacitor/core'
import { env } from '../../shared/config/env'

export type UpdateStatus = 'latest' | 'downloaded' | 'installNeeded'

interface AppUpdatePlugin {
  ready(): Promise<{ version: number; nativeApi: number }>
  check(options: { server: string }): Promise<{ status: UpdateStatus }>
  apply(): Promise<void>
}

const appUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate')

/** 업데이트 기능이 없는 옛 앱에서는 아무것도 하지 않는다. */
export const updateSupported =
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AppUpdate') && env.serverUrl !== ''

export async function reportReady(): Promise<void> {
  if (updateSupported) await appUpdate.ready()
}

export async function checkUpdate(): Promise<UpdateStatus> {
  return (await appUpdate.check({ server: env.serverUrl })).status
}

export async function applyUpdate(): Promise<void> {
  await appUpdate.apply()
}
