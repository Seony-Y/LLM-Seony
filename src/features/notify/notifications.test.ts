import { expect, test, vi } from 'vitest'
import { defaultSettings, type AssistantRecord } from '../records/types'
import { planNotifications, snooze, snoozed, toQuick } from './notifications'

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

test('아침 보고에 그날 예보를 일정과 엮어 덧붙인다', () => {
  const rainy = { date: '2026-11-25', sky: 'rain' as const, low: 4, high: 8, rainAt: new Date(2026, 10, 25, 9) }
  const planned = planNotifications({
    now,
    settings: { ...defaultSettings, briefing: true },
    events: [event('회의', new Date(2026, 10, 25, 10), false)],
    todos: [],
    weather: { sky: 'cloud', isDay: true, place: '', temperature: 5, rainAt: null, days: [rainy] },
  })
  expect(planned[0].body).toBe('일정 1개, 첫 일정은 오전 10:00 회의\n오전 9:00부터 비 온대요. 오전 10:00 회의 갈 때 우산 챙겨요.')
  expect(planned[1].body).not.toContain('\n')
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

test('장소가 있는 곧 있을 일정은 걸리는 시간과 여유만큼 먼저 나서라고 알린다', () => {
  const at = (hour: number, place?: string) => {
    const record = event(`${place ?? '집'} ${hour}시`, new Date(2026, 10, 24, hour))
    return { ...record, data: { ...record.data, place } }
  }
  const tomorrow = at(12, '강남역')
  tomorrow.data.startsAt = new Date(2026, 10, 25, 12).toISOString()
  // 이미 늦은 곳, 너무 가까운 곳, 길을 모르는 곳, 내일 일정은 알리지 않는다.
  const events = [at(12, '강남역'), at(13, '회사'), at(14), at(11, '먼 곳'), at(12, '옆집'), tomorrow]
  const travel = new Map([
    ['강남역', { place: '강남역 2호선', minutes: 40 }],
    ['먼 곳', { place: '먼 곳', minutes: 90 }],
    ['옆집', { place: '옆집', minutes: 2 }],
  ])
  const planned = planNotifications({ now, settings: defaultSettings, events, todos: [] }, travel)
  const leaving = planned.filter(({ title }) => title.endsWith('나설 시간이에요'))
  expect(leaving.map(({ title, body, schedule }) => [title, body, schedule?.at])).toEqual([
    ['강남역 12시, 나설 시간이에요', '강남역 2호선까지 차로 40분쯤 걸려요.', new Date(2026, 10, 24, 11, 10)],
  ])
})

test('생일 같은 날은 사흘 전과 그날 아침 9시에 알린다', () => {
  const at = now.toISOString()
  const notes = ['민수 생일 11월 26일', '지수 생일 11월 24일', '메모 11월 25일'].map(
    (body): AssistantRecord<'note'> => ({ id: body, kind: 'note', data: { body }, createdAt: at, updatedAt: at, deletedAt: null, dirty: 0 }),
  )
  const planned = planNotifications({ now, settings: defaultSettings, events: [], todos: [], notes })
  // 지금은 24일 10시라 민수 생일 사흘 전과 오늘인 지수 생일 9시 알림은 지났다. 생일이 아닌 메모는 알리지 않는다.
  expect(planned.map(({ title, body, schedule }) => [title, body, schedule?.at])).toEqual([
    ['오늘, 챙길 날이에요', '민수 생일 11월 26일', new Date(2026, 10, 26, 9)],
  ])
  const later = planNotifications({ now: new Date(2026, 10, 25), settings: defaultSettings, events: [], todos: [], notes })
  // 지난 생일은 내년 것을 맞춘다.
  expect(later.filter(({ body }) => body.startsWith('지수')).map(({ schedule }) => schedule?.at)).toEqual([
    new Date(2027, 10, 21, 9),
    new Date(2027, 10, 24, 9),
  ])
})

test('일정과 출발 알림에는 다시 알림, 할 일이 하나뿐인 알림에는 끝냄 버튼을 단다', () => {
  const todos = [todo('장보기', '2026-11-24')]
  const planned = planNotifications({ now, settings: defaultSettings, events: [event('회의', new Date(2026, 10, 24, 11))], todos })
  expect(planned.find(({ title }) => title === '회의')?.actionTypeId).toBe('later')
  const reminder = planned.find(({ title }) => title.startsWith('아직 남은 일'))
  expect(reminder).toMatchObject({ actionTypeId: 'todo-one', extra: { todoId: '장보기' } })
  const many = planNotifications({ now, settings: defaultSettings, events: [], todos: [...todos, todo('청소', '2026-11-24')] })
  expect(many.find(({ title }) => title.startsWith('아직 남은 일'))?.actionTypeId).toBeUndefined()
})

test('미룬 알림은 10분 뒤에 다시 울리고, 지난 것은 버린다', () => {
  const saved = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
  })
  try {
    snooze({ id: 1, title: '회의', body: '지금이에요.' }, now)
    expect(snoozed(now)).toMatchObject([{ title: '회의', schedule: { at: new Date(2026, 10, 24, 10, 10) }, actionTypeId: 'later' }])
    expect(snoozed(new Date(2026, 10, 24, 10, 11))).toEqual([])
  } finally {
    vi.unstubAllGlobals()
  }
})

test('버튼이 달린 알림은 기기가 직접 띄울 수 있게 바꾼다', () => {
  const planned = planNotifications({
    now,
    settings: defaultSettings,
    events: [event('회의', new Date(2026, 10, 24, 11))],
    todos: [todo('장보기', '2026-11-24')],
  })
  const quick = planned.filter(({ actionTypeId }) => actionTypeId).map(toQuick)
  // 밀린 할 일은 다음 아침들에도 알리므로 앞의 둘만 본다.
  expect(quick.slice(0, 2)).toEqual([
    expect.objectContaining({ title: '회의', action: 'later', at: new Date(2026, 10, 24, 11).getTime() }),
    expect.objectContaining({ title: '아직 남은 일 1개', action: 'done', todoId: '장보기' }),
  ])
})
