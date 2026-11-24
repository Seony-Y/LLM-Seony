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
