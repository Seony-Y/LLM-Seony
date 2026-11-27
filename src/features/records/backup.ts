import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { database } from './db'
import { loadRecords, notifyRecords } from './recordStore'
import type { AssistantRecord } from './types'

const KINDS = ['event', 'todo', 'note', 'diary', 'talk', 'setting', 'visit']

export async function exportBackup(): Promise<void> {
  const exportedAt = new Date().toISOString()
  const text = JSON.stringify({ version: 1, exportedAt, records: await loadRecords() }, null, 2)
  const name = `assistant-${exportedAt.slice(0, 10)}.json`

  if (Capacitor.isNativePlatform()) {
    const { uri } = await Filesystem.writeFile({
      path: name,
      data: text,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    })
    await Share.share({ title: name, files: [uri] })
    return
  }
  const link = document.createElement('a')
  link.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

function isRecord(record: AssistantRecord) {
  return (
    typeof record?.id === 'string' &&
    KINDS.includes(record.kind) &&
    typeof record.data === 'object' &&
    record.data !== null &&
    !Number.isNaN(Date.parse(record.createdAt)) &&
    !Number.isNaN(Date.parse(record.updatedAt))
  )
}

/** 지금 기록보다 최근인 것만 가져온다. */
export async function importBackup(text: string): Promise<number> {
  const parsed = JSON.parse(text) as { version?: number; records?: AssistantRecord[] }
  if (parsed.version !== 1 || !Array.isArray(parsed.records) || !parsed.records.every(isRecord)) {
    throw new Error('이 앱에서 내보낸 백업 파일이 아닙니다.')
  }

  const transaction = (await database).transaction('records', 'readwrite')
  let count = 0
  for (const record of parsed.records) {
    const current = await transaction.store.get(record.id)
    if (current && Date.parse(current.updatedAt) >= Date.parse(record.updatedAt)) continue
    await transaction.store.put({ ...record, dirty: 1 })
    count += 1
  }
  await transaction.done
  notifyRecords()
  return count
}
