import { openDB, type DBSchema } from 'idb'
import type { AssistantRecord } from './types'

interface AssistantDb extends DBSchema {
  records: { key: string; value: AssistantRecord; indexes: { dirty: number } }
  meta: { key: string; value: string | number }
}

export const database = openDB<AssistantDb>('personal-assistant', 1, {
  upgrade(db) {
    db.createObjectStore('records', { keyPath: 'id' }).createIndex('dirty', 'dirty')
    db.createObjectStore('meta')
  },
})
