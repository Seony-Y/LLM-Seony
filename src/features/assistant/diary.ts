import { DIARY_HOUR, diaryBody, localDate, type DayState } from './speech'
import type { AssistantRecord } from '../records/types'

interface DiaryEntry {
  date: string
  body: string
}

/** 지금 써야 할 일기. 밤 10시 이후에는 오늘 것, 그리고 앱을 열지 않아 빠진 어제 것. */
export function pendingDiaries(state: DayState, written: AssistantRecord<'diary'>[]): DiaryEntry[] {
  const entries: DiaryEntry[] = []
  const bodyOf = (date: string) => written.find(({ data }) => data.date === date)?.data.body

  const yesterday = new Date(state.now)
  yesterday.setDate(yesterday.getDate() - 1)
  yesterday.setHours(23, 59, 59, 999)
  const usedByThen = [...state.events, ...state.todos].some(
    ({ createdAt }) => Date.parse(createdAt) <= yesterday.getTime(),
  )
  if (usedByThen && bodyOf(localDate(yesterday)) === undefined) {
    entries.push({ date: localDate(yesterday), body: diaryBody(stateAt(yesterday, state)) })
  }

  if (state.now.getHours() >= DIARY_HOUR) {
    const today = { date: localDate(state.now), body: diaryBody(state) }
    if (bodyOf(today.date) !== today.body) entries.push(today)
  }
  return entries
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
