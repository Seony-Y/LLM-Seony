import { Capacitor, registerPlugin } from '@capacitor/core'
import {
  LocalNotifications,
  type ActionPerformed,
  type LocalNotificationSchema,
} from '@capacitor/local-notifications'
import type { AssistantRecord } from '../records/types'
import { anniversaries } from '../recall/anniversary'
import { relatedNotes } from '../recall/recall'
import { briefing, dueTodos, localDate, type DayState } from '../assistant/speech'
import { TRAVEL_WINDOW } from '../online/travel'
import type { Travel } from '../records/serverRecords'

export const BRIEFING_HOUR = 7
const BRIEFING_DAYS = 7
export const TODO_HOURS = { morning: 8, evening: 18 }
const TODO_TITLES = 3
/** 반복 일정이 자리를 다 차지하지 않게 넉넉히 둔다. */
const EVENT_LIMIT = 120

const MEMORY_LEAD = 30 * 60_000
/** 알림의 "10분 뒤 다시". */
const SNOOZE = 10 * 60_000
const SNOOZE_KEY = 'personal-assistant.snoozes'
/** 알림 버튼 묶음. 할 일은 하나일 때만 끝낼 수 있다. */
const ACTION_TYPES = { todo: 'todo-one', later: 'later' } as const

interface QuickReminder {
  id: number
  at: number
  title: string
  body: string
  action: 'done' | 'later'
  todoId?: string
}

/** 앱을 열지 않고 버튼을 처리하도록 기기가 직접 띄우는 알림. 새 앱에만 있다. */
const quickReminders = registerPlugin<{ schedule(options: { items: QuickReminder[] }): Promise<void> }>(
  'QuickReminders',
)
/** 걸리는 시간에 더해 챙기고 나설 여유. */
const TRAVEL_SPARE = 10 * 60_000
/** 이보다 가까우면 출발 알림이 필요 없다. */
const MIN_TRAVEL_MINUTES = 5
/** 생일 같은 날은 준비할 수 있게 며칠 전과 그날 아침에 알린다. */
const ANNIVERSARY_HOUR = 9
const ANNIVERSARY_LEADS = [
  { days: 3, title: '사흘 뒤, 챙길 날이에요' },
  { days: 0, title: '오늘, 챙길 날이에요' },
]

type PlanState = Pick<DayState, 'now' | 'settings' | 'events' | 'todos' | 'notes'> & { weather?: DayState['weather'] }

function notificationId(key: string) {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619)
  }
  return hash >>> 1 || 1
}

/** 지금 기록으로 울려야 할 알림 전체. 기기에 예약된 알림은 항상 이 목록과 같아야 한다. travel은 장소별 이동 시간. */
export function planNotifications(state: PlanState, travel = new Map<string, Travel>()): LocalNotificationSchema[] {
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
    actionTypeId: ACTION_TYPES.later,
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

  for (const { note, next } of anniversaries(notes, now)) {
    for (const lead of ANNIVERSARY_LEADS) {
      const at = new Date(next)
      at.setDate(next.getDate() - lead.days)
      at.setHours(ANNIVERSARY_HOUR, 0, 0, 0)
      if (at <= now) continue
      planned.push({
        id: notificationId(`anniversary:${note.id}:${localDate(next)}:${lead.days}`),
        title: lead.title,
        body: note.data.body,
        schedule: { at, allowWhileIdle: true },
      })
    }
  }

  // 길 사정은 바뀌므로 곧 있을 일정만 출발 시각을 알린다.
  for (const event of upcoming) {
    const route = travel.get(event.data.place?.trim() ?? '')
    const startsAt = Date.parse(event.data.startsAt)
    if (!route || route.minutes < MIN_TRAVEL_MINUTES || startsAt > now.getTime() + TRAVEL_WINDOW) continue
    const at = new Date(startsAt - route.minutes * 60_000 - TRAVEL_SPARE)
    if (at <= now) continue
    planned.push({
      id: notificationId(`travel:${event.id}`),
      title: `${event.data.title}, 나설 시간이에요`,
      body: `${route.place}까지 차로 ${route.minutes}분쯤 걸려요.`,
      schedule: { at, allowWhileIdle: true },
      actionTypeId: ACTION_TYPES.later,
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
        ...(todos.length === 1 && { actionTypeId: ACTION_TYPES.todo, extra: { todoId: todos[0].id } }),
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

export function applyNotifications(state: PlanState, travel?: Map<string, Travel>): Promise<void> {
  if (!Capacitor.isNativePlatform()) return queue
  const run = async () => {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return
    const { notifications } = await LocalNotifications.getPending()
    if (notifications.length) {
      await LocalNotifications.cancel({ notifications: notifications.map(({ id }) => ({ id })) })
    }
    const planned = planNotifications(state, travel)
    if (!Capacitor.isPluginAvailable('QuickReminders')) {
      // 예전 앱은 버튼을 누르면 앱이 열려 처리한다.
      const all = [...planned, ...snoozed(state.now)]
      if (all.length) await LocalNotifications.schedule({ notifications: all })
      return
    }
    const plain = planned.filter(({ actionTypeId }) => !actionTypeId)
    if (plain.length) await LocalNotifications.schedule({ notifications: plain })
    await quickReminders.schedule({ items: planned.filter(({ actionTypeId }) => actionTypeId).map(toQuick) })
  }
  queue = queue.then(run, run)
  return queue
}

export function toQuick({ id, title, body, schedule, actionTypeId, extra }: LocalNotificationSchema): QuickReminder {
  return {
    id,
    at: schedule?.at?.getTime() ?? 0,
    title,
    body,
    action: actionTypeId === ACTION_TYPES.todo ? 'done' : 'later',
    todoId: (extra as { todoId?: string } | undefined)?.todoId,
  }
}

/** 미뤄둔 알림. 예약을 새로 할 때 지워지지 않도록 기기에 둔다. 예전 앱에서만 쓴다. */
interface Snooze {
  id: number
  at: number
  title: string
  body: string
}

function readSnoozes(): Snooze[] {
  try {
    return JSON.parse(localStorage.getItem(SNOOZE_KEY) ?? '[]') as Snooze[]
  } catch {
    return []
  }
}

function writeSnoozes(snoozes: Snooze[]) {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify(snoozes))
  } catch {
    // 저장하지 못하면 다음 예약 때 미룬 알림이 빠질 뿐이다.
  }
}

export function snoozed(now: Date): LocalNotificationSchema[] {
  return readSnoozes()
    .filter(({ at }) => at > now.getTime())
    .map(({ id, at, title, body }) => ({
      id,
      title,
      body,
      schedule: { at: new Date(at), allowWhileIdle: true },
      actionTypeId: ACTION_TYPES.later,
    }))
}

/** 알림을 10분 뒤에 다시 울리도록 남긴다. 예약은 applyNotifications가 한다. */
export function snooze(
  { id, title, body }: Pick<LocalNotificationSchema, 'id' | 'title' | 'body'>,
  now = new Date(),
) {
  const kept = readSnoozes().filter(({ at }) => at > now.getTime())
  const again = { id: notificationId(`later:${id}:${now.getTime()}`), at: now.getTime() + SNOOZE, title, body }
  writeSnoozes([...kept, again])
}

/** 알림 버튼 묶음을 등록한다. 앱을 열 때 한 번 부른다. */
export async function registerNotificationActions(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await LocalNotifications.registerActionTypes({
    types: [
      { id: ACTION_TYPES.todo, actions: [{ id: 'done', title: '끝냄' }] },
      { id: ACTION_TYPES.later, actions: [{ id: 'later', title: '10분 뒤 다시' }] },
    ],
  })
}

/** 알림의 버튼을 눌러 앱이 열렸을 때 부른다. 알림 자체를 누른 것은 tap이다. */
export function onNotificationAction(
  listener: (action: 'done' | 'later' | 'tap', notification: ActionPerformed['notification']) => void,
): () => void {
  if (!Capacitor.isNativePlatform()) return () => {}
  const handle = LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
    listener(actionId === 'done' || actionId === 'later' ? actionId : 'tap', notification)
  })
  return () => void handle.then((registered) => registered.remove()).catch(console.error)
}
