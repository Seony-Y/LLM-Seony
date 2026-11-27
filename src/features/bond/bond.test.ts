import { expect, test } from 'vitest'
import type { AssistantRecord } from '../records/types'
import { bondOf, shownGifts } from './bond'

function todo(day: number, done = false): AssistantRecord<'todo'> {
  const at = new Date(2026, 10, day, 10).toISOString()
  return {
    id: `${day}-${Math.random()}`,
    kind: 'todo',
    data: { title: 'x', doneAt: done ? at : null },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    dirty: 0,
  }
}

test('맡기면 1점, 끝내면 2점이 쌓인다', () => {
  expect(bondOf([todo(1), todo(1, true)]).points).toBe(4)
})

test('하루에 몰아서 올릴 수 없다', () => {
  expect(bondOf(Array.from({ length: 100 }, () => todo(1))).points).toBe(12)
})

test('지워도 줄어들지 않는다', () => {
  const done = todo(1, true)
  const deleted = { ...done, deletedAt: done.updatedAt }
  const purged = { ...deleted, data: { purged: true, doneAt: done.data.doneAt } } as never
  expect(bondOf([deleted]).points).toBe(3)
  expect(bondOf([purged]).points).toBe(3)
})

test('점수에 따라 단계가 오른다', () => {
  expect(bondOf([])).toMatchObject({ level: 0, remaining: 15, progress: 0 })
  const days = (count: number) =>
    bondOf(Array.from({ length: count }, (_, day) => Array.from({ length: 4 }, () => todo(day + 1, true))).flat())
  expect(days(2)).toMatchObject({ level: 1, points: 24 })
  expect(days(21)).toMatchObject({ level: 4, remaining: 0, progress: 1 })
})

test('방에는 얻었고 숨기지 않은 물건만 보인다', () => {
  expect(shownGifts(0)).toEqual([false, false, false, false])
  expect(shownGifts(3)).toEqual([true, true, true, false])
  expect(shownGifts(3, ['balloon', 'crown'])).toEqual([true, false, true, false])
})

test('하루 한 번 출석하면 1점이 쌓이고, 그날 한도 안에서 센다', () => {
  const settings = {
    id: 'settings',
    kind: 'setting',
    data: { assistantName: '또리', userName: '대장', tone: 'warm', briefing: false, todoReminder: true, visits: ['2026-11-01', '2026-11-02'] },
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-02T00:00:00.000Z',
    deletedAt: null,
    dirty: 0,
  } as AssistantRecord<'setting'>
  expect(bondOf([settings]).points).toBe(2)
  expect(bondOf([settings, ...Array.from({ length: 20 }, () => todo(1))]).points).toBe(13)
})

test('출석은 날짜마다 한 번만 세고, 예전 설정에 남긴 출석도 함께 센다', () => {
  const visit = (date: string) =>
    ({ id: `visit-${date}`, kind: 'visit', data: { date }, createdAt: `${date}T01:00:00.000Z`, updatedAt: `${date}T01:00:00.000Z`, deletedAt: null, dirty: 0 }) as AssistantRecord<'visit'>
  const legacy = {
    id: 'settings',
    kind: 'setting',
    data: { assistantName: '또리', userName: '대장', tone: 'warm', briefing: false, todoReminder: true, visits: ['2026-11-01'] },
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    deletedAt: null,
    dirty: 0,
  } as AssistantRecord<'setting'>
  expect(bondOf([legacy, visit('2026-11-01'), visit('2026-11-02'), visit('2026-11-02')])).toMatchObject({ points: 2, visits: 2 })
})

test('지워진 출석 기록은 세지 않는다', () => {
  const purged = { id: 'visit-x', kind: 'visit', data: { purged: true }, createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', deletedAt: '2026-11-01T00:00:00.000Z', dirty: 0 } as never
  expect(bondOf([purged])).toMatchObject({ points: 0, visits: 0 })
})
