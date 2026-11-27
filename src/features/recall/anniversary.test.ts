import { expect, test } from 'vitest'
import type { AssistantRecord } from '../records/types'
import { anniversaries, yearlyDate } from './anniversary'

function note(body: string): AssistantRecord<'note'> {
  return {
    id: body,
    kind: 'note',
    data: { body },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    dirty: 0,
  }
}

test('생일이나 기념일과 날짜가 함께 적힌 기억만 해마다 챙긴다', () => {
  expect(yearlyDate('엄마 생신은 3월 5일')).toEqual({ month: 3, day: 5 })
  expect(yearlyDate('결혼기념일 10 월 3 일')).toEqual({ month: 10, day: 3 })
  expect(yearlyDate('아빠 생일은 음력 8월 15일')).toBeNull()
  expect(yearlyDate('3월 5일에 이사')).toBeNull()
  expect(yearlyDate('지수 생일은 13월 1일')).toBeNull()
  expect(yearlyDate('지수 생일은 2월 30일')).toBeNull()
})

test('다음에 오는 날을 가까운 순으로 세고, 지난 날은 내년으로 넘긴다', () => {
  const now = new Date(2026, 10, 27, 15)
  const notes = [note('엄마 생신은 3월 5일'), note('지수 생일 11월 27일'), note('민수 생일 11월 30일'), note('메모')]
  expect(anniversaries(notes, now).map(({ note: { id }, days, next }) => [id, days, next.getFullYear()])).toEqual([
    ['지수 생일 11월 27일', 0, 2026],
    ['민수 생일 11월 30일', 3, 2026],
    ['엄마 생신은 3월 5일', 98, 2027],
  ])
})

test('윤년이 아니면 2월 29일은 28일에 챙긴다', () => {
  const [{ next }] = anniversaries([note('생일 2월 29일')], new Date(2026, 0, 1))
  expect(next).toEqual(new Date(2026, 1, 28))
})
