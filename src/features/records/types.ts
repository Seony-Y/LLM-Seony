export interface RecordData {
  event: { title: string; note: string; startsAt: string; remind: boolean }
  todo: { title: string; doneAt: string | null }
  note: { body: string }
  diary: { date: string; body: string }
  setting: { assistantName: string; userName: string; tone: Tone; briefing: boolean }
}

export type Tone = 'warm' | 'nag'
export type Kind = keyof RecordData

interface RecordOf<K extends Kind> {
  id: string
  kind: K
  data: RecordData[K]
  createdAt: string
  updatedAt: string
  deletedAt: string | null
  dirty: 0 | 1
}

export type AssistantRecord<K extends Kind = Kind> = { [P in K]: RecordOf<P> }[K]

export const SETTINGS_ID = 'settings'
export const defaultSettings: RecordData['setting'] = {
  assistantName: '또리',
  userName: '대장',
  tone: 'warm',
  briefing: false,
}
