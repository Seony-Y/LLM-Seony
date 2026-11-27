import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'
import type { WidgetEntry } from './timeline'

interface RoomWidgetPlugin {
  update(options: { timeline: string }): Promise<void>
  requestPin(): Promise<void>
  addListener(event: 'prompt', listener: (data: { voice?: boolean }) => void): Promise<PluginListenerHandle>
}

const roomWidget = registerPlugin<RoomWidgetPlugin>('RoomWidget')

export async function updateWidget(timeline: WidgetEntry[]): Promise<void> {
  if (Capacitor.isNativePlatform()) await roomWidget.update({ timeline: JSON.stringify(timeline) })
}

export async function requestWidgetPin(): Promise<void> {
  await roomWidget.requestPin()
}

/** 위젯의 "대화하기"나 마이크를 눌러 앱이 열렸을 때 부른다. voice는 마이크를 눌렀을 때. */
export function onWidgetPrompt(listener: (voice: boolean) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  const handle = roomWidget.addListener('prompt', ({ voice }) => listener(voice === true))
  return () => void handle.then((registered) => registered.remove()).catch(console.error)
}
