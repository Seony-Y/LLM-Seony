import { expect, test } from 'vitest'
import type { DayState } from '../assistant/speech'
import { defaultSettings, type AssistantRecord } from '../records/types'
import { buildTimeline } from './timeline'

const now = new Date(2026, 10, 24, 10, 0)

function event(title: string, startsAt: Date): AssistantRecord<'event'> {
  const at = now.toISOString()
  return {
    id: title,
    kind: 'event',
    data: { title, note: '', startsAt: startsAt.toISOString(), remind: true },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    dirty: 0,
  }
}

const state: DayState = {
  now,
  settings: defaultSettings,
  events: [event('회의', new Date(2026, 10, 24, 14)), event('치과', new Date(2026, 10, 25, 15))],
  todos: [],
  weather: null,
}

function shownAt(at: Date, current = state) {
  return buildTimeline(current).filter((entry) => entry.at <= at.getTime()).at(-1)!
}

test('지금 모습으로 시작하고 시각 순서로 이어진다', () => {
  const timeline = buildTimeline(state)
  expect(timeline[0].at).toBe(now.getTime())
  expect(timeline.map(({ at }) => at)).toEqual(timeline.map(({ at }) => at).sort((a, b) => a - b))
})

test('일정이 시작되면 다음 일정으로 넘어간다', () => {
  expect(shownAt(now).events).toEqual(['오후 2:00 회의', '내일 오후 3:00 치과'])
  expect(shownAt(new Date(2026, 10, 24, 14, 1)).events).toEqual(['내일 오후 3:00 치과'])
})

test('자정이 지나면 내일이 오늘이 된다', () => {
  expect(shownAt(new Date(2026, 10, 25, 0, 1)).events).toEqual(['오후 3:00 치과'])
})

test('밤에는 밤 모습이 되고 새벽 5시에 돌아온다', () => {
  expect(shownAt(new Date(2026, 10, 24, 21, 0)).scene).toBe('night')
  expect(shownAt(new Date(2026, 10, 25, 4, 59)).scene).toBe('night')
  expect(shownAt(new Date(2026, 10, 25, 5, 0)).scene).toBe('morning')
})

test('오늘 비 소식은 내일까지 이어지지 않는다', () => {
  const rainy: DayState = {
    ...state,
    weather: { sky: 'cloud', isDay: true, place: '', temperature: 5, rainAt: new Date(2026, 10, 24, 15) },
  }
  expect(shownAt(now, rainy).scene).toBe('rain')
  expect(shownAt(new Date(2026, 10, 24, 16), rainy).body).toContain('지금 비')
  expect(shownAt(new Date(2026, 10, 25, 12), rainy).scene).toBe('morning')
})

test('오래 열지 않으면 낡은 일정을 보여주지 않는다', () => {
  const last = shownAt(new Date(2026, 11, 24))
  expect(last.title).toBe('오랜만이에요.')
  expect(last.events).toEqual([])
})
