import { Capacitor } from '@capacitor/core'
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications'
import { briefing, localDate, type DayState } from '../assistant/speech'

export const BRIEFING_HOUR = 7
const BRIEFING_DAYS = 7
const EVENT_LIMIT = 50

type PlanState = Pick<DayState, 'now' | 'settings' | 'events' | 'todos'>

function notificationId(key: string) {
  let hash = 2166136261
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 16777619)
  }
  return hash >>> 1 || 1
}

/** 지금 기록으로 울려야 할 알림 전체. 기기에 예약된 알림은 항상 이 목록과 같아야 한다. */
export function planNotifications(state: PlanState): LocalNotificationSchema[] {
  const { now, settings, events } = state
  const planned: LocalNotificationSchema[] = events
    .filter((event) => event.data.remind && new Date(event.data.startsAt) > now)
    .sort((left, right) => left.data.startsAt.localeCompare(right.data.startsAt))
    .slice(0, EVENT_LIMIT)
    .map((event) => ({
      id: notificationId(`event:${event.id}`),
      title: event.data.title,
      body: event.data.note || `${settings.assistantName}: 지금이에요.`,
      schedule: { at: new Date(event.data.startsAt), allowWhileIdle: true },
    }))

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
  return planned
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
