import { database } from './db'
import type { AssistantRecord, Kind, RecordData } from './types'

const listeners = new Set<() => void>()

export function subscribeRecords(listener: () => void) {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function notifyRecords() {
  listeners.forEach((listener) => listener())
}

export async function loadRecords(): Promise<AssistantRecord[]> {
  return (await database).getAll('records')
}

/** 시계가 뒤로 가도 같은 기록의 수정 시각은 항상 늘어난다. */
function nextTimestamp(previous?: string) {
  const floor = previous ? Date.parse(previous) + 1 : 0
  return new Date(Math.max(Date.now(), floor)).toISOString()
}

export async function saveRecord<K extends Kind>(
  kind: K,
  data: RecordData[K],
  id: string = crypto.randomUUID(),
): Promise<void> {
  const transaction = (await database).transaction('records', 'readwrite')
  const previous = await transaction.store.get(id)
  const updatedAt = nextTimestamp(previous?.updatedAt)
  await transaction.store.put({
    id,
    kind,
    data,
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
    deletedAt: null,
    dirty: 1,
  } as AssistantRecord)
  await transaction.done
  notifyRecords()
}

export async function setDeleted(id: string, deleted: boolean): Promise<void> {
  const transaction = (await database).transaction('records', 'readwrite')
  const record = await transaction.store.get(id)
  if (record) {
    const updatedAt = nextTimestamp(record.updatedAt)
    await transaction.store.put({
      ...record,
      updatedAt,
      deletedAt: deleted ? updatedAt : null,
      dirty: 1,
    })
  }
  await transaction.done
  notifyRecords()
}

/** 내용은 지우고, 지웠다는 사실만 남겨 다른 기기와 서버에서도 지워지게 한다. */
export async function emptyTrash(): Promise<void> {
  const transaction = (await database).transaction('records', 'readwrite')
  for (const record of await transaction.store.getAll()) {
    if (!record.deletedAt || isPurged(record)) continue
    await transaction.store.put({
      ...record,
      data: { purged: true },
      updatedAt: nextTimestamp(record.updatedAt),
      dirty: 1,
    } as unknown as AssistantRecord)
  }
  await transaction.done
  notifyRecords()
}

export function isPurged(record: AssistantRecord) {
  return 'purged' in record.data
}

const LEGACY_KEY = 'personal-assistant.schedules'

interface LegacySchedule {
  id: string
  title: string
  note: string
  startsAt: string
  notificationId?: number
}

/** 이전 버전이 localStorage에 남긴 일정을 한 번만 옮긴다. 원본은 지우지 않는다. */
export async function importLegacySchedules(): Promise<void> {
  const transaction = (await database).transaction(['records', 'meta'], 'readwrite')
  if (await transaction.objectStore('meta').get('legacyImported')) return

  let items: LegacySchedule[] = []
  try {
    items = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? '[]') as LegacySchedule[]
  } catch {
    // 읽을 수 없는 값은 옮길 일정이 없는 것으로 본다.
  }
  const now = new Date().toISOString()
  for (const item of items) {
    await transaction.objectStore('records').put({
      id: item.id,
      kind: 'event',
      data: {
        title: item.title,
        note: item.note,
        startsAt: item.startsAt,
        remind: item.notificationId !== undefined,
      },
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      dirty: 1,
    })
  }
  await transaction.objectStore('meta').put(1, 'legacyImported')
  await transaction.done
  notifyRecords()
}
