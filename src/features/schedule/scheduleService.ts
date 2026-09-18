import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'

export interface ScheduleItem {
  id: string
  notificationId?: number
  title: string
  note: string
  startsAt: string
}

const STORAGE_KEY = 'personal-assistant.schedules'

export function loadSchedules(): ScheduleItem[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as ScheduleItem[]
    return stored.sort((left, right) => left.startsAt.localeCompare(right.startsAt))
  } catch {
    return []
  }
}

export async function createSchedule(input: {
  title: string
  note: string
  startsAt: string
  withNotification: boolean
}): Promise<void> {
  if (!input.title.trim()) {
    throw new Error('일정 제목을 입력해 주세요.')
  }

  const startsAt = new Date(input.startsAt)
  if (Number.isNaN(startsAt.getTime()) || startsAt <= new Date()) {
    throw new Error('미래 시간을 선택해 주세요.')
  }

  const item: ScheduleItem = {
    id: crypto.randomUUID(),
    title: input.title.trim(),
    note: input.note.trim(),
    startsAt: startsAt.toISOString(),
  }

  if (input.withNotification) {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('시스템 알림 등록은 Android 앱에서 사용할 수 있습니다.')
    }

    let permission = await LocalNotifications.checkPermissions()
    if (permission.display !== 'granted') {
      permission = await LocalNotifications.requestPermissions()
    }
    if (permission.display !== 'granted') {
      throw new Error('알림 권한이 필요합니다. 휴대폰 설정에서 허용해 주세요.')
    }

    item.notificationId = Math.floor(Date.now() % 2_000_000_000)
    await LocalNotifications.schedule({
      notifications: [
        {
          id: item.notificationId,
          title: item.title,
          body: item.note || '등록한 일정 시간입니다.',
          schedule: { at: startsAt },
          extra: { scheduleId: item.id },
        },
      ],
    })
  }

  saveSchedules([...loadSchedules(), item])
}

export async function deleteSchedule(item: ScheduleItem): Promise<void> {
  if (item.notificationId && Capacitor.isNativePlatform()) {
    await LocalNotifications.cancel({ notifications: [{ id: item.notificationId }] })
  }
  saveSchedules(loadSchedules().filter((schedule) => schedule.id !== item.id))
}

function saveSchedules(items: ScheduleItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}