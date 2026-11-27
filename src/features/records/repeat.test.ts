import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { localDate } from '../assistant/speech'
import { database } from './db'
import { loadRecords, saveRecord } from './recordStore'
import { eventsBetween, expandEvents, nextDate, nextOccurrences, seriesId } from './repeat'
import { toggleTodo } from './todoStore'
import type { AssistantRecord, RecordData, Repeat } from './types'

// 2026-11-25는 수요일
const now = new Date(2026, 10, 25, 14)

function event(startsAt: Date, data: Partial<RecordData['event']>): AssistantRecord<'event'> {
  const at = now.toISOString()
  return {
    id: 'e', kind: 'event', createdAt: at, updatedAt: at, deletedAt: null, dirty: 0,
    data: { title: '운동', note: '', startsAt: startsAt.toISOString(), remind: true, ...data },
  }
}

const run = (repeat: Repeat, from: Date, count: number) => {
  const dates: string[] = []
  for (let at = from; dates.length < count; ) {
    at = nextDate(repeat, at)
    dates.push(localDate(at).slice(5))
  }
  return dates
}

test('다음 차례', () => {
  const friday = new Date(2026, 10, 27)
  expect(run({ every: 'day' }, friday, 2)).toEqual(['11-28', '11-29'])
  expect(run({ every: 'weekday' }, friday, 2)).toEqual(['11-30', '12-01'])
  expect(run({ every: 'week' }, friday, 2)).toEqual(['12-04', '12-11'])
  expect(run({ every: 'month', on: 31 }, new Date(2026, 11, 31), 3)).toEqual(['01-31', '02-28', '03-31'])
})

test('반복 일정을 펼치고, 건너뛴 날은 뺀다', () => {
  const list = expandEvents([event(new Date(2026, 10, 1, 9), { repeat: { every: 'day' }, skip: ['2026-11-26'] })], now)
  const dates = list.map(({ data }) => localDate(new Date(data.startsAt)))
  expect(dates).toContain('2026-11-24')
  expect(dates).not.toContain('2026-11-01')
  expect(dates).not.toContain('2026-11-26')
  expect(new Set(list.map(({ id }) => id)).size).toBe(list.length)
  expect(seriesId(list[0].id)).toBe('e')
  // 오늘 9시는 지났고 내일은 건너뛰므로 모레가 다음이다.
  expect(nextOccurrences(list, now).map(({ data }) => localDate(new Date(data.startsAt)))).toEqual(['2026-11-27'])
})

test('먼 앞날에 시작하는 반복도 하나는 나온다', () => {
  const list = expandEvents([event(new Date(2027, 5, 1, 9), { repeat: { every: 'month', on: 1 } })], now)
  expect(list).toHaveLength(1)
})

beforeEach(async () => (await database).clear('records'))

const live = async () =>
  (await loadRecords())
    .filter(({ deletedAt }) => !deletedAt)
    .map(({ data }) => data as RecordData['todo'])
    .sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? ''))

test('반복 할 일을 끝내면 다음 차례가 생기고, 되돌리면 사라진다', async () => {
  const data = { title: '영양제 먹기', doneAt: null, dueDate: '2026-11-22', repeat: { every: 'day' as const } }
  await saveRecord('todo', data, 't')
  await toggleTodo('t', now)
  expect(await live()).toMatchObject([
    { dueDate: '2026-11-22', doneAt: now.toISOString() },
    { dueDate: '2026-11-26', doneAt: null, repeat: { every: 'day' } },
  ])
  await toggleTodo('t', now)
  expect(await live()).toMatchObject([{ dueDate: '2026-11-22', doneAt: null }])
  await toggleTodo('t', now)
  expect(await live()).toHaveLength(2)
})

test('다음 차례를 이미 끝냈으면 되돌려도 남긴다', async () => {
  await saveRecord('todo', { title: '물', doneAt: null, dueDate: '2026-11-25', repeat: { every: 'day' } }, 't')
  await toggleTodo('t', now)
  await toggleTodo('t@2026-11-26', now)
  await toggleTodo('t', now)
  expect((await live()).map(({ dueDate }) => dueDate)).toEqual(['2026-11-25', '2026-11-26', '2026-11-27'])
})

test('달력은 정한 기간만큼 반복을 펼치고, 기간 밖의 일정은 뺀다', () => {
  const weekly = event(new Date(2026, 10, 2, 9), { repeat: { every: 'week' } })
  const once = { ...event(new Date(2027, 2, 20, 9), {}), id: 'once' }
  const later = { ...event(new Date(2027, 5, 1, 9), {}), id: 'later' }
  // 펼쳐 두는 60일을 훌쩍 넘긴 3월도 보인다.
  const march = eventsBetween([weekly, once, later], new Date(2027, 2, 1), new Date(2027, 3, 1))
  expect(march.map(({ id }) => id)).toEqual(['e@2027-03-01', 'e@2027-03-08', 'e@2027-03-15', 'e@2027-03-22', 'e@2027-03-29', 'once'])
})
