import { localDate } from '../assistant/speech'
import type { AssistantRecord, Repeat } from './types'

type EventRecord = AssistantRecord<'event'>

const DAY = 86_400_000
/** 어제 일기를 쓸 수 있게 조금 지난 것까지 펼친다. */
const PAST_DAYS = 8
const FUTURE_DAYS = 60
const SEPARATOR = '@'

export const REPEAT_LABEL = { day: '매일', weekday: '평일', week: '매주', month: '매월' }

export function repeatOf(every: Repeat['every'] | '', date: Date): Repeat | undefined {
  if (!every) return undefined
  return every === 'month' ? { every, on: date.getDate() } : { every }
}

/** 다음 차례. 31일처럼 그 달에 없는 날은 말일로 하되, 다음 달에는 다시 31일로 돌아간다. */
export function nextDate({ every, on }: Repeat, date: Date): Date {
  const next = new Date(date)
  if (every === 'month') {
    next.setMonth(next.getMonth() + 1, 1)
    const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
    next.setDate(Math.min(on ?? date.getDate(), last))
    return next
  }
  next.setDate(next.getDate() + (every === 'week' ? 7 : 1))
  while (every === 'weekday' && (next.getDay() === 0 || next.getDay() === 6)) next.setDate(next.getDate() + 1)
  return next
}

/** 반복되는 일정을 하루씩 펼친다. 저장된 것은 하나뿐이고 나머지는 그때그때 만든다. */
export function expandEvents(events: EventRecord[], now: Date): EventRecord[] {
  // 먼 앞날에 시작하는 반복도 첫 차례는 보여준다.
  return expand(events, now.getTime() - PAST_DAYS * DAY, now.getTime() + FUTURE_DAYS * DAY, true)
}

/** 달력처럼 정한 기간에 있는 일정만. 반복은 그 기간만큼 펼친다. */
export function eventsBetween(events: EventRecord[], from: Date, to: Date): EventRecord[] {
  return expand(events, from.getTime(), to.getTime(), false).filter(({ data }) => {
    const at = Date.parse(data.startsAt)
    return at >= from.getTime() && at < to.getTime()
  })
}

function expand(events: EventRecord[], from: number, to: number, keepFirst: boolean): EventRecord[] {
  return events.flatMap((event) => {
    const { repeat, skip = [] } = event.data
    if (!repeat) return [event]
    const list: EventRecord[] = []
    let at = new Date(event.data.startsAt)
    while (at.getTime() < to || (keepFirst && list.length === 0)) {
      const date = localDate(at)
      if (at.getTime() >= from && !skip.includes(date)) {
        list.push({
          ...event,
          id: `${event.id}${SEPARATOR}${date}`,
          data: { ...event.data, startsAt: at.toISOString() },
        })
      }
      at = nextDate(repeat, at)
    }
    return list
  })
}

/** 펼친 일정이면 저장된 일정의 id, 아니면 그대로. */
export function seriesId(id: string) {
  return id.split(SEPARATOR)[0]
}

export function occurrenceId(id: string, date: string) {
  return `${seriesId(id)}${SEPARATOR}${date}`
}

/** 반복되는 일정은 다음 차례만 남긴다. */
export function nextOccurrences(events: EventRecord[], now: Date): EventRecord[] {
  const seen = new Set<string>()
  return [...events]
    .sort((left, right) => left.data.startsAt.localeCompare(right.data.startsAt))
    .filter((event) => {
      if (!event.data.repeat) return true
      const id = seriesId(event.id)
      if (new Date(event.data.startsAt) < now || seen.has(id)) return false
      seen.add(id)
      return true
    })
}
