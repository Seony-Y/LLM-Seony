/** 주고받은 말 한 번. */
export interface Turn {
  id: string
  at: string
  question: string
  reply: string
}

export interface RecordData {
  event: { title: string; note: string; startsAt: string; remind: boolean }
  /** dueDate는 YYYY-MM-DD. 예전 기록에는 없다. */
  todo: { title: string; doneAt: string | null; dueDate?: string }
  note: { body: string }
  /** written은 AI가 쓴 일기일 때, 담은 마지막 대화 시각과 정해진 글. */
  diary: { date: string; body: string; written?: { until: string; rule: string } }
  talk: { turns: Turn[] }
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
