import { DIARY_HOUR, diaryBody, localDate, type DayState } from './speech'
import type { AssistantRecord, Turn } from '../records/types'

export interface DiaryEntry {
  date: string
  /** 연결이 안 될 때 쓰는 글. */
  body: string
  /** 그날의 모습과 대화. */
  state: DayState
  turns: Turn[]
}

export function diaryEntry(state: DayState, talk: Turn[]): DiaryEntry {
  const date = localDate(state.now)
  const turns = talk.filter(({ at }) => localDate(new Date(at)) === date)
  return { date, body: diaryBody(state), state, turns }
}

export function lastTurnAt({ turns }: DiaryEntry) {
  return turns.at(-1)?.at ?? ''
}

/** 지금 써야 할 일기. 밤 10시 이후에는 오늘 것, 그리고 앱을 열지 않아 빠진 어제 것. */
export function pendingDiaries(
  state: DayState,
  written: AssistantRecord<'diary'>[],
  talk: Turn[] = [],
  connected = false,
): DiaryEntry[] {
  const entries: DiaryEntry[] = []

  const yesterday = new Date(state.now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(23, 59, 59, 999)
  const last = diaryEntry(stateAt(yesterday, state), talk)
  const usedByThen =
    last.turns.length > 0 ||
    [...state.events, ...state.todos].some(({ createdAt }) => Date.parse(createdAt) <= yesterday.getTime())
  const saved = written.find(({ data }) => data.date === last.date)?.data
  if (usedByThen && (!saved || (connected && (!saved.written || saved.written.until < lastTurnAt(last))))) {
    entries.push(last)
  }

  if (state.now.getHours() >= DIARY_HOUR) {
    const today = diaryEntry(state, talk)
    if (needsWriting(today, written, connected)) entries.push(today)
  }
  return entries
}

function needsWriting(entry: DiaryEntry, written: AssistantRecord<'diary'>[], connected: boolean) {
  const saved = written.find(({ data }) => data.date === entry.date)?.data
  if (!saved) return true
  if (!saved.written) return connected || saved.body !== entry.body
  return connected && (saved.written.until < lastTurnAt(entry) || saved.written.rule !== entry.body)
}

/** 그 시각에 있던 할 일만 남기고, 나중에 끝낸 것은 아직 안 끝난 것으로 되돌린다. */
function stateAt(moment: Date, state: DayState): DayState {
  const todos = state.todos
    .filter(({ createdAt }) => Date.parse(createdAt) <= moment.getTime())
    .map((todo) => {
      const { doneAt } = todo.data
      const doneLater = doneAt !== null && Date.parse(doneAt) > moment.getTime()
      return doneLater ? { ...todo, data: { ...todo.data, doneAt: null } } : todo
    })
  return { ...state, now: moment, todos }
}
