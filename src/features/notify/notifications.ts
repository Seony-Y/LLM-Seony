import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import type { AssistantRecord } from '../records/types'
import { relatedNotes } from '../recall/recall'
import { briefing, dueTodos, localDate, type DayState } from '../assistant/speech'

export const BRIEFING_HOUR = 7
const BRIEFING_DAYS = 7
export const TODO_HOURS = { morning: 8, evening: 18 }
const TODO_TITLES = 3
/** 반복 일정이 자리를 다 차지하지 않게 넉넉히 둔다. */
const EVENT_LIMIT = 120

const MEMORY_LEAD = 30 * 60_000

type PlanState = Pick<DayState, 'now' | 'settings' | 'events' | 'todos' | 'notes'>

function notificationId(key: string) {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619)
  }
  return hash >>> 1 || 1
}

/** 지금 기록으로 울려야 할 알림 전체. 기기에 예약된 알림은 항상 이 목록과 같아야 한다. */
export function planNotifications(state: PlanState): LocalNotificationSchema[] {
  const { now, settings, events, notes = [] } = state
  const upcoming = events
    .filter((event) => event.data.remind && new Date(event.data.startsAt) > now)
    .sort((left, right) => left.data.startsAt.localeCompare(right.data.startsAt))
    .slice(0, EVENT_LIMIT)
  const planned: LocalNotificationSchema[] = upcoming.map((event) => ({
    id: notificationId(`event:${event.id}`),
    title: event.data.title,
    body: event.data.note || `${settings.assistantName}: 지금이에요.`,
    schedule: { at: new Date(event.data.startsAt), allowWhileIdle: true },
  }))

  // 만나기 전에 떠올릴 수 있게, 아는 것이 있는 일정만 미리 알린다.
  for (const event of upcoming) {
    const at = new Date(Date.parse(event.data.startsAt) - MEMORY_LEAD)
    const memories = relatedNotes(event.data.title, notes).map(({ data }) => data.body)
    if (at <= now || memories.length === 0) continue
    planned.push({
      id: notificationId(`memory:${event.id}`),
      title: `30분 뒤 ${event.data.title}`,
      body: `기억하죠? ${memories.join(' · ')}`,
      schedule: { at, allowWhileIdle: true },
    })
  }

  for (let offset = 0; settings.briefing && offset < BRIEFING_DAYS; offset += 1) {
    const at = new Date(now)
    at.setDate(now.getDate() + offset)
    at.setHours(BRIEFING_HOUR, 0, 0, 0)
    if (at <= now) continue
    planned.push({
      id: notificationId(`briefing:${localDate(at)}`),
      ...briefing(at, state),
      schedule: { at, allowWhileIdle: true },
    })
  }
  for (let offset = 0; settings.todoReminder && offset < BRIEFING_DAYS; offset += 1) {
    const day = new Date(now)
    day.setDate(now.getDate() + offset)
    const date = localDate(day)
    const due = dueTodos(day, state.todos).filter(({ data }) => data.dueDate)
    // 밀린 일은 아침에만 알린다.
    const reminders = [
      { hour: TODO_HOURS.morning, todos: due, title: '오늘 할 일' },
      { hour: TODO_HOURS.evening, todos: due.filter(({ data }) => data.dueDate === date), title: '아직 남은 일' },
    ]
    for (const { hour, todos, title } of reminders) {
      const at = new Date(day)
      at.setHours(hour, 0, 0, 0)
      if (at <= now || !todos.length) continue
      planned.push({
        id: notificationId(`todo:${hour}:${date}`),
        title: `${title} ${todos.length}개`,
        body: todoTitles(todos),
        schedule: { at, allowWhileIdle: true },
      })
    }
  }
  return planned
}

function todoTitles(todos: AssistantRecord<'todo'>[]) {
  const titles = todos.slice(0, TODO_TITLES).map(({ data }) => data.title).join(', ')
  const others = todos.length - TODO_TITLES
  return others > 0 ? `${titles} 외 ${others}개` : titles
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false
  let permission = await LocalNotifications.checkPermissions()
  if (permission.display !== 'granted') permission = await LocalNotifications.requestPermissions()
  return permission.display === 'granted'
}

export async function exactAlarmAllowed(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true
  return (await LocalNotifications.checkExactNotificationSetting()).exact_alarm === 'granted'
}

export async function openExactAlarmSetting(): Promise<void> {
  await LocalNotifications.changeExactNotificationSetting()
}

let queue: Promise<void> = Promise.resolve()

export function applyNotifications(state: PlanState): Promise<void> {
  if (!Capacitor.isNativePlatform()) return queue
  const run = async () => {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
    const { notifications } = await LocalNotifications.getPending()
    if (notifications.length) {
      await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) })
    }
    const planned = planNotifications(state)
    if (planned.length) await LocalNotifications.schedule({ notifications: planned })
  }
  queue = queue.then(run, run)
  return queue
}
