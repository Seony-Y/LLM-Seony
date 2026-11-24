import { DIARY_HOUR, formatTime, greeting, localDate, sceneFor, type DayState, type Scene } from '../assistant/speech'

export interface WidgetEntry {
  /** 이 시각부터 보여준다. */
  at: number
  scene: Scene
  title: string
  body: string
  events: string[]
  todos: number
}

const DAYS = 3
const HOUR = 3_600_000
/** 또리의 말이나 배경이 바뀔 수 있는 시각. */
const TURNING_HOURS = [0, 5, 11, 21, DIARY_HOUR]
const EVENT_LINES = 2

/** 앱이 꺼져 있어도 위젯이 때에 맞게 바뀌도록 앞으로의 모습을 미리 만든다. */
export function buildTimeline(state: DayState): WidgetEntry[] {
  const start = state.now.getTime()
  const end = start + DAYS * 24 * HOUR
  const moments = new Set([start])
  for (let day = 0; day <= DAYS; day += 1) {
    for (const hour of TURNING_HOURS) {
      const at = new Date(state.now)
      at.setDate(at.getDate() + day)
      moments.add(at.setHours(hour, 0, 0, 0))
    }
  }
  for (const { data } of state.events) moments.add(Date.parse(data.startsAt))
  if (state.weather?.rainAt) moments.add(state.weather.rainAt.getTime())

  const entries = [...moments]
    .filter((at) => at >= start && at < end)
    .sort((left, right) => left - right)
    .map((at) => entryAt(new Date(at), state))
  return [
    ...entries,
    {
      at: end,
      scene: 'morning',
      title: '오랜만이에요.',
      body: '눌러서 열면 새로 정리할게요.',
      events: [],
      todos: 0,
    },
  ]
}

function entryAt(now: Date, state: DayState): WidgetEntry {
  const moment = { ...state, now }
  const events = state.events
    .filter(({ data }) => Date.parse(data.startsAt) > now.getTime())
    .slice(0, EVENT_LINES)
    .map(({ data }) => `${dayLabel(new Date(data.startsAt), now)}${formatTime(new Date(data.startsAt))} ${data.title}`)
  return {
    at: now.getTime(),
    scene: sceneFor(moment),
    ...greeting(moment),
    events,
    todos: state.todos.filter(({ data }) => !data.doneAt).length,
  }
}

function dayLabel(date: Date, now: Date) {
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (localDate(date) === localDate(now)) return ''
  if (localDate(date) === localDate(tomorrow)) return '내일 '
  return `${date.getMonth() + 1}/${date.getDate()} `
}
