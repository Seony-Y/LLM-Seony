import { expect, test } from 'vitest'
import type { DayForecast, TodayWeather } from '../online/weather'
import { defaultSettings, type AssistantRecord } from '../records/types'
import { giftLine, weatherTip } from './speech'

const morning = new Date(2026, 10, 27, 7)

function event(title: string, hour: number): AssistantRecord<'event'> {
  const at = new Date(2026, 10, 27, hour).toISOString()
  return {
    id: title,
    kind: 'event',
    data: { title, note: '', startsAt: at, remind: true },
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    dirty: 0,
  }
}

function weather(day: Partial<DayForecast>): TodayWeather {
  const today = { date: '2026-11-27', sky: 'cloud', low: 3, high: 9, rainAt: null, ...day } as DayForecast
  return { sky: 'cloud', isDay: true, place: '', temperature: 5, rainAt: null, days: [today] }
}

test('비가 오면 그 뒤 첫 일정과 엮어 우산을 챙기라고 한다', () => {
  const rain = weather({ rainAt: new Date(2026, 10, 27, 14) })
  const events = [event('점심', 12), event('미팅', 15), event('저녁', 19)]
  expect(weatherTip(morning, events, rain, 'warm')).toBe('오후 2:00부터 비 온대요. 오후 3:00 미팅 갈 때 우산 챙겨요.')
  expect(weatherTip(morning, [event('점심', 12)], rain, 'nag')).toBe('오후 2:00부터 비 온대요. 우산 또 두고 가지 말고요.')
})

test('비가 없으면 눈, 추위, 더위, 일교차 순으로 하나만 말한다', () => {
  expect(weatherTip(morning, [], weather({ sky: 'snow', low: -8 }), 'warm')).toContain('눈 소식')
  expect(weatherTip(morning, [], weather({ low: -8, high: 4 }), 'warm')).toBe('-8°까지 내려가요. 단단히 입어요.')
  expect(weatherTip(morning, [], weather({ low: 22, high: 33 }), 'warm')).toBe('낮에 33°까지 올라요. 물 자주 마셔요.')
  expect(weatherTip(morning, [], weather({ low: 2, high: 14 }), 'warm')).toBe('2°에서 14°, 일교차가 커요. 겉옷 챙겨요.')
  expect(weatherTip(morning, [], weather({}), 'warm')).toBeNull()
})

test('그날 예보가 없으면 말하지 않는다', () => {
  expect(weatherTip(new Date(2026, 11, 10, 7), [], weather({ low: -10 }), 'warm')).toBeNull()
})

test('방의 물건을 누르면 돌아가며 말하고, 단짝부터는 반말이다', () => {
  const settings = { ...defaultSettings, userName: '대장' }
  expect(giftLine('mug', settings, 0, 1)).toEqual({ title: '따뜻한 차 한 잔 어때요?', body: '대장도 잠깐 쉬어가요.' })
  expect(giftLine('mug', settings, 1, 1)?.title).toBe('후후, 아직 뜨거워요.')
  expect(giftLine('mug', settings, 0, 3)?.title).toBe('차 한 잔 할래?')
  expect(giftLine('crown', settings, 0, 4)?.body).toBe('대장 생각하면서 만든 거야.')
  expect(giftLine('없는 물건', settings, 0)).toBeNull()
})
