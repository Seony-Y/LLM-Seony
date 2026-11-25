import { expect, test } from 'vitest'
import type { AssistantRecord, Kind, RecordData } from '../records/types'
import { recall, relatedNotes, type RecallSource } from './recall'

// 2026-11-24는 화요일
const now = new Date(2026, 10, 24, 10)

function record<K extends Kind>(kind: K, data: RecordData[K], createdAt = now) {
  const at = createdAt.toISOString()
  return { id: JSON.stringify(data), kind, data, createdAt: at, updatedAt: at, deletedAt: null, dirty: 0 } as Extract<
    AssistantRecord,
    { kind: K }
  >
}

const note = (body: string, createdAt?: Date) => record('note', { body }, createdAt)
const event = (title: string, startsAt: Date) =>
  record('event', { title, note: '', startsAt: startsAt.toISOString(), remind: true })

const source: RecallSource = {
  now,
  notes: [
    note('주차는 B2 17번 기둥'),
    note('역 앞 국밥집 맛있었음', new Date(2026, 10, 18)),
    note('민수 딸 이름은 서연'),
    note('민수 생일 3월 2일'),
    note('엄마 신발 240'),
    note('딸기는 냉장고 아래 칸'),
    note('매운 거 잘 못 먹음'),
  ],
  events: [
    event('업무 회의', new Date(2026, 10, 24, 14)),
    event('민수와 저녁', new Date(2026, 10, 25, 19)),
    event('치과', new Date(2026, 11, 2, 15)),
  ],
  todos: [
    record('todo', { title: '영양제 먹기', doneAt: null }),
    record('todo', { title: '보고서 보내기', doneAt: now.toISOString() }),
  ],
}

const texts = (question: string) => recall(question, source).map(({ text }) => text)

test.each([
  ['주차 어디 했지?', '주차는 B2 17번 기둥'],
  ['주차 어디에 했더라', '주차는 B2 17번 기둥'],
  ['주차했지?', '주차는 B2 17번 기둥'],
  ['지난주 국밥집 뭐였지?', '역 앞 국밥집 맛있었음'],
  ['민수 딸 이름이 뭐였지?', '민수 딸 이름은 서연'],
  ['엄마 신발 사이즈 몇이야?', '엄마 신발 240'],
  ['치과 언제야?', '치과'],
  ['국밥집 찾아줘', '역 앞 국밥집 맛있었음'],
])('%s', (question, answer) => expect(texts(question)[0]).toBe(answer))

test('한 글자 낱말이 다른 낱말 속에서 걸리지 않는다', () => {
  expect(texts('민수 딸 이름이 뭐였지?')).not.toContain('딸기는 냉장고 아래 칸')
})

test('비슷하게 맞는 것은 함께 보여준다', () => {
  expect(texts('민수 뭐였지?')).toEqual(
    expect.arrayContaining(['민수 딸 이름은 서연', '민수 생일 3월 2일', '민수와 저녁']),
  )
})

test('모르는 것은 답하지 않는다', () => {
  expect(texts('고양이 이름 뭐였지?')).toEqual([])
  expect(texts('뭐야?')).toEqual([])
})

test('목록을 물으면 목록으로 답한다', () => {
  expect(texts('오늘 일정 뭐야?')).toEqual(['업무 회의'])
  expect(texts('내일 뭐 있어?')).toEqual(['민수와 저녁'])
  expect(texts('다음 주 일정 알려줘')).toEqual(['치과'])
  expect(texts('일정 뭐 있어?')).toHaveLength(3)
  expect(texts('할 일 뭐 남았어?')).toEqual(['영양제 먹기'])
})

test('일정에 나온 사람에 대한 기억을 찾는다', () => {
  const related = (title: string) => relatedNotes(title, source.notes).map(({ data }) => data.body)
  expect(related('민수와 저녁').sort()).toEqual(['민수 딸 이름은 서연', '민수 생일 3월 2일'])
  expect(related('국밥집에서 점심')).toEqual(['역 앞 국밥집 맛있었음'])
  expect(related('업무 회의')).toEqual([])
  expect(related('저녁')).toEqual([])
})

test('할 날을 물으면 그날 할 일만 답한다', () => {
  const todos = [
    record('todo', { title: '나중 일', doneAt: null, dueDate: '2026-11-30' }),
    record('todo', { title: '오늘 일', doneAt: null, dueDate: '2026-11-24' }),
  ]
  const found = (question: string) => recall(question, { ...source, todos }).map(({ text }) => text)
  expect(found('오늘 할 일 뭐야?')).toEqual(['오늘 일'])
  expect(found('할 일 뭐 남았어?')).toEqual(['오늘 일', '나중 일'])
})
