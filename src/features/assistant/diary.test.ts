import { expect, test } from 'vitest'
import { defaultSettings, type AssistantRecord } from '../records/types'
import { pendingDiaries } from './diary'
import type { DayState } from './speech'

function todo(title: string, createdAt: Date, doneAt: Date | null = null): AssistantRecord<'todo'> {
  const at = createdAt.toISOString()
  return {
    id: title,
    kind: 'todo',
    data: { title, doneAt: doneAt?.toISOString() ?? null },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    dirty: 0,
  }
}

function diary(date: string, body = ''): AssistantRecord<'diary'> {
  return { ...todo(date, new Date()), kind: 'diary', data: { date, body } } as AssistantRecord<'diary'>
}

function state(now: Date, todos: AssistantRecord<'todo'>[] = []): DayState {
  return { now, settings: defaultSettings, events: [], todos, weather: null }
}

const dates = (entries: { date: string }[]) => entries.map(({ date }) => date)

test('밤 10시부터 오늘 일기를 쓴다', () => {
  expect(pendingDiaries(state(new Date(2026, 10, 24, 21, 59)), [])).toEqual([])
  expect(dates(pendingDiaries(state(new Date(2026, 10, 24, 22, 0)), []))).toEqual(['2026-11-24'])
})

test('내용이 같으면 다시 쓰지 않는다', () => {
  const night = state(new Date(2026, 10, 24, 22, 30))
  const [entry] = pendingDiaries(night, [])
  expect(pendingDiaries(night, [diary(entry.date, entry.body)])).toEqual([])
})

test('어젯밤 앱을 열지 않았으면 어제 모습으로 채워 쓴다', () => {
  const morning = new Date(2026, 10, 25, 9)
  const entries = pendingDiaries(
    state(morning, [
      todo('빨래', new Date(2026, 10, 24, 10), new Date(2026, 10, 25, 8)),
      todo('오늘 맡긴 일', new Date(2026, 10, 25, 8)),
    ]),
    [],
  )
  expect(dates(entries)).toEqual(['2026-11-24'])
  expect(entries[0].body).toContain('"빨래", 미뤘지만')
  expect(entries[0].body).not.toContain('오늘 맡긴 일')
})

test('어제 일기가 있거나 어제는 쓰기 전이었으면 채우지 않는다', () => {
  const morning = new Date(2026, 10, 25, 9)
  const old = todo('빨래', new Date(2026, 10, 24, 10))
  expect(pendingDiaries(state(morning, [old]), [diary('2026-11-24')])).toEqual([])
  expect(pendingDiaries(state(morning, [todo('새 일', morning)]), [])).toEqual([])
})
