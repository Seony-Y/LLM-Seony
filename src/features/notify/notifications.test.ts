import { expect, test } from 'vitest'
import { defaultSettings, type AssistantRecord } from '../records/types'
import { planNotifications } from './notifications'

const now = new Date(2026, 10, 24, 10, 0)

function event(id: string, startsAt: Date, remind = true): AssistantRecord<'event'> {
  return {
    id,
    kind: 'event',
    data: { title: id, note: '', startsAt: startsAt.toISOString(), remind },
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    deletedAt: null,
    dirty: 0,
  }
}

test('앞으로 있을, 알림을 켠 일정만 울린다', () => {
  const events = [
    event('past', new Date(2026, 10, 24, 9)),
    event('next', new Date(2026, 10, 24, 11)),
    event('silent', new Date(2026, 10, 24, 12), false),
  ]
  const planned = planNotifications({ now, settings: defaultSettings, events, todos: [] })
  expect(planned.map(({ title }) => title)).toEqual(['next'])
})

test('아는 것이 있는 일정은 30분 전에 떠올려준다', () => {
  const at = now.toISOString()
  const note: AssistantRecord<'note'> = {
    id: 'n',
    kind: 'note',
    data: { body: '민수 딸 이름은 서연' },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    dirty: 0,
  }
  const planned = planNotifications({
    now,
    settings: defaultSettings,
    events: [event('민수와 저녁', new Date(2026, 10, 24, 19)), event('업무 회의', new Date(2026, 10, 24, 15))],
    todos: [],
    notes: [note],
  })
  expect(planned).toHaveLength(3)
  expect(planned[2]).toMatchObject({
    title: '30분 뒤 민수와 저녁',
    body: '기억하죠? 민수 딸 이름은 서연',
    schedule: { at: new Date(2026, 10, 24, 18, 30) },
  })
})

test('지난 7시를 빼고 7일 안의 아침 보고를 그날 일정으로 만든다', () => {
  const planned = planNotifications({
    now,
    settings: { ...defaultSettings, briefing: true },
    events: [event('회의', new Date(2026, 10, 25, 10), false)],
    todos: [],
  })
  expect(planned).toHaveLength(6)
  expect(planned[0].schedule?.at).toEqual(new Date(2026, 10, 25, 7))
  expect(planned[0].body).toContain('일정 1개')
  expect(planned[1].body).toContain('잡힌 일정은 없어요')
  expect(new Set(planned.map(({ id }) => id)).size).toBe(6)
})

function todo(title: string, dueDate?: string, doneAt: string | null = null): AssistantRecord<'todo'> {
  return { ...event(title, now), kind: 'todo', data: { title, doneAt, dueDate } } as AssistantRecord<'todo'>
}

const todoPlan = (todos: AssistantRecord<'todo'>[], at = now, todoReminder = true) =>
  planNotifications({ now: at, settings: { ...defaultSettings, todoReminder }, events: [], todos }).map(
    ({ title, body, schedule }) => `${schedule!.at!.getDate()}일 ${schedule!.at!.getHours()}시 ${title}: ${body}`,
  )

test('할 일은 그날 아침과 저녁에 알린다', () => {
  expect(todoPlan([todo('보고서', '2026-11-30')])).toEqual([
    '30일 8시 오늘 할 일 1개: 보고서',
    '30일 18시 아직 남은 일 1개: 보고서',
  ])
  expect(todoPlan([todo('오늘 일', '2026-11-24')])[0]).toBe('24일 18시 아직 남은 일 1개: 오늘 일')
})

test('밀린 일은 아침에만 알린다', () => {
  const plan = todoPlan([todo('밀린 일', '2026-11-20')])
  expect(plan).toHaveLength(6)
  expect(plan.every((text) => text.includes('8시 오늘 할 일'))).toBe(true)
})

test('여러 개는 한 번에 묶는다', () => {
  const todos = ['가', '나', '다', '라'].map((title) => todo(title, '2026-11-30'))
  expect(todoPlan(todos)[0]).toBe('30일 8시 오늘 할 일 4개: 가, 나, 다 외 1개')
})

test('끝낸 일, 날짜 없는 일, 알림을 끈 때는 울리지 않는다', () => {
  expect(todoPlan([todo('끝', '2026-11-30', now.toISOString()), todo('언젠가')])).toEqual([])
  expect(todoPlan([todo('보고서', '2026-11-30')], now, false)).toEqual([])
})
