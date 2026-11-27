import { expect, test } from 'vitest'
import { defaultSettings, type AssistantRecord } from '../records/types'
import { diaryMaterial, tidyDiary } from './api/requestDiary'
import { diaryEntry, pendingDiaries } from './diary'
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

test('연결되어 있으면 대화를 담아 다시 쓰고, 새로 나눈 말이 없으면 그대로 둔다', () => {
  const night = state(new Date(2026, 10, 24, 22, 30))
  const turn = (id: string, hour = 12) => ({ id, at: new Date(2026, 10, 24, hour).toISOString(), question: id, reply: '' })
  const [plain] = pendingDiaries(night, [])
  const rule = plain.body
  const saved = (until?: string) => {
    const record = diary('2026-11-24', rule)
    if (until !== undefined) record.data.written = { until, rule }
    return [record]
  }
  expect(pendingDiaries(night, saved(), [turn('a')], false)).toEqual([])
  expect(pendingDiaries(night, saved(), [turn('a')], true)[0].turns).toHaveLength(1)
  expect(pendingDiaries(night, saved(turn('a').at), [turn('a')], true)).toEqual([])
  expect(pendingDiaries(night, saved(turn('a').at), [turn('b', 13)], true)).toHaveLength(1)
  // 연결이 끊겨도 담아 쓴 일기를 덮지 않고, 대화를 지워도 다시 쓰지 않는다.
  expect(pendingDiaries(night, saved(turn('a').at), [turn('b', 13)], false)).toEqual([])
  expect(pendingDiaries(night, saved(turn('a').at), [], true)).toEqual([])
})

test('어제 대화만 나눴어도 일기를 쓴다', () => {
  const at = new Date(2026, 10, 24, 20).toISOString()
  const entries = pendingDiaries(state(new Date(2026, 10, 25, 9)), [], [{ id: 'a', at, question: '안녕', reply: '네' }])
  expect(dates(entries)).toEqual(['2026-11-24'])
})

test('일기는 한 문단으로 잇고 끊긴 마지막 문장은 버린다', () => {
  expect(tidyDiary('- 오늘은 조용했다.\n\n창밖이 추워 보였다. 내일은')).toBe('오늘은 조용했다. 창밖이 추워 보였다.')
})

test('일기 자료에 내일 일정을 넣어 마무리할 거리를 준다', () => {
  const now = new Date(2026, 10, 24, 22)
  const at = new Date(2026, 10, 25, 15).toISOString()
  const event: AssistantRecord<'event'> = {
    id: 'e',
    kind: 'event',
    data: { title: '치과', note: '', startsAt: at, remind: true },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    dirty: 0,
  }
  const material = diaryMaterial(diaryEntry({ ...state(now), events: [event] }, []))
  expect(material).toContain('일정: 없음')
  expect(material).toContain('내일 일정: 오후 3:00 치과')
})
