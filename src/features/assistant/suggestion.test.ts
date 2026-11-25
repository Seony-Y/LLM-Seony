import { expect, test } from 'vitest'
import { readSuggestion, suggestionGuide } from './suggestion'

const now = new Date(2026, 10, 25, 14)
const read = (text: string) => readSuggestion(text, now)

test('제안을 읽는다', () => {
  expect(read('[[일정|2026-12-02|15:00|치과|없음]]')).toEqual({
    type: 'event',
    title: '치과',
    startsAt: new Date(2026, 11, 2, 15),
    repeat: undefined,
  })
  expect(read('[[할일|2026-11-27|보고서 보내기|매월]]')).toEqual({
    type: 'todo',
    title: '보고서 보내기',
    dueDate: '2026-11-27',
    repeat: { every: 'month', on: 27 },
  })
  expect(read('[[기억|민수 생일 3월 2일]]')).toEqual({ type: 'note', body: '민수 생일 3월 2일', explicit: true })
})

test('오늘 할 일은 받는다', () => {
  expect(read('[[할일|2026-11-25|약 먹기|없음]]')).toMatchObject({ dueDate: '2026-11-25' })
})

test.each([
  '없음',
  '[[일정|2026-11-25|13:00|지난 일|없음]]',
  '[[일정|2026-02-30|13:00|없는 날|없음]]',
  '[[일정|내일|3시|치과|없음]]',
  '[[일정|2026-12-02|25:00|치과|없음]]',
  '[[일정|2026-12-02|15:00||없음]]',
  '[[할일|2026-11-24|지난 할 일|없음]]',
  '[[삭제|모두]]',
  '[[기억|]]',
  '[[일정|2026-12',
])('형식이 다르면 버린다: %s', (text) => expect(read(text)).toBeUndefined())

test('달력에 이번 주와 다음 주를 적는다', () => {
  const guide = suggestionGuide(now)
  expect(guide).toContain('2026-11-25 이번 주 수요일 (오늘)')
  expect(guide).toContain('2026-11-29 이번 주 일요일')
  expect(guide).toContain('2026-12-02 다음 주 수요일')
})
