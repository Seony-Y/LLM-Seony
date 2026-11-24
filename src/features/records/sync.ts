import { database } from './db'
import { notifyRecords } from './recordStore'
import type { AssistantRecord } from './types'

export interface RemoteRow {
  id: string
  kind: AssistantRecord['kind']
  data: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
  seq: number
}

export interface RemoteRecords {
  push(rows: Omit<RemoteRow, 'seq'>[]): Promise<void>
  /** seq 순서로 한 쪽씩 준다. 더 없으면 빈 배열이다. */
  pull(afterSeq: number): Promise<RemoteRow[]>
}

const PUSH_ROWS = 100

/** 사용자가 서버를 연결할 때 부른다. 다른 서버로 바꿨다면 기기의 기록을 모두 다시 올린다. */
export async function linkServer(serverId: string): Promise<void> {
  const transaction = (await database).transaction(['records', 'meta'], 'readwrite')
  const records = transaction.objectStore('records')
  const meta = transaction.objectStore('meta')
  const previous = await meta.get('serverId')
  if (previous !== serverId) {
    for (const record of await records.getAll()) await records.put({ ...record, dirty: 1 })
    await meta.delete('cursor')
    await meta.delete('lastSyncedAt')
    await meta.put(serverId, 'serverId')
  }
  await transaction.done
  notifyRecords()
}

/** 기기에 먼저 저장된 변경을 올리고, 서버의 변경을 내려받는다. 나중에 수정된 값이 남는다. */
export async function syncRecords(remote: RemoteRecords, serverId: string): Promise<void> {
  const db = await database
  if ((await db.get('meta', 'serverId')) !== serverId) {
    throw new Error('연결했던 서버와 다릅니다. 비밀 키를 다시 입력해 주세요.')
  }

  const pending = await db.getAllFromIndex('records', 'dirty', 1)
  for (let start = 0; start < pending.length; start += PUSH_ROWS) {
    const batch = pending.slice(start, start + PUSH_ROWS)
    await remote.push(
      batch.map((record) => ({
        id: record.id,
        kind: record.kind,
        data: record.data,
        created_at: record.createdAt,
        updated_at: record.updatedAt,
        deleted_at: record.deletedAt,
      })),
    )
    const transaction = db.transaction('records', 'readwrite')
    for (const sent of batch) {
      const current = await transaction.store.get(sent.id)
      // 올리는 동안 다시 수정됐다면 다음 동기화에서 올린다.
      if (current?.updatedAt === sent.updatedAt) {
        await transaction.store.put({ ...current, dirty: 0 })
      }
    }
    await transaction.done
  }

  let cursor = Number((await db.get('meta', 'cursor')) ?? 0)
  for (;;) {
    const rows = await remote.pull(cursor)
    if (rows.length === 0) break
    const transaction = db.transaction(['records', 'meta'], 'readwrite')
    for (const row of rows) {
      const local = await transaction.objectStore('records').get(row.id)
      const keepLocal =
        local?.dirty === 1 && Date.parse(local.updatedAt) > Date.parse(row.updated_at)
      if (!keepLocal) {
        await transaction.objectStore('records').put({
          id: row.id,
          kind: row.kind,
          data: row.data,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          deletedAt: row.deleted_at,
          dirty: 0,
        } as AssistantRecord)
      }
      cursor = Math.max(cursor, row.seq)
    }
    await transaction.objectStore('meta').put(cursor, 'cursor')
    await transaction.done
  }
  await db.put('meta', new Date().toISOString(), 'lastSyncedAt')
  notifyRecords()
}
