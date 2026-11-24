import { expect, test } from 'vitest'
import type { AssistantRecord } from '../records/types'
import { bondOf } from './bond'

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
