import { localDate } from '../assistant/speech'
import { database } from './db'
import { isPurged, nextTimestamp, notifyRecords } from './recordStore'
import type { AssistantRecord, Turn } from './types'

export const TALK_DAYS = 7
/** 하루치를 한 기록에 담으므로 너무 커지지 않게 한다. */
const DAY_LIMIT = 60
const TEXT_LENGTH = 2000

type TalkRecord = AssistantRecord<'talk'>

/** 기기마다 하루에 기록 하나를 쓴다. 여러 기기가 같은 기록을 덮어쓰지 않는다. */
export async function saveTurn(turn: Turn): Promise<void> {
  const transaction = (await database).transaction(['records', 'meta'], 'readwrite')
  const meta = transaction.objectStore('meta')
  const store = transaction.objectStore('records')
  let device = await meta.get('deviceId')
  if (!device) {
    device = crypto.randomUUID()
    await meta.put(device, 'deviceId')
  }
  const id = `talk-${localDate(new Date(turn.at))}-${device}`
  const previous = (await store.get(id)) as TalkRecord | undefined
  const kept = previous && !isPurged(previous) ? previous.data.turns : []
  const saved = {
    ...turn,
    question: turn.question.slice(0, TEXT_LENGTH),
    reply: turn.reply.slice(0, TEXT_LENGTH),
  }
  const updatedAt = nextTimestamp(previous?.updatedAt)
  await store.put({
    id,
    kind: 'talk',
    data: { turns: [...kept.filter((item) => item.id !== turn.id), saved].slice(-DAY_LIMIT) },
    createdAt: previous?.createdAt ?? updatedAt,
    updatedAt,
    deletedAt: null,
    dirty: 1,
  })
  await transaction.done
  notifyRecords()
}

export function removeTurn(id: string): Promise<void> {
  return keepTurns((turn) => turn.id !== id)
}

export function clearTalk(): Promise<void> {
  return keepTurns(() => false)
}

export function expireTalk(now: Date): Promise<void> {
  const oldest = new Date(now.getTime() - TALK_DAYS * 86_400_000).toISOString()
  return keepTurns((turn) => turn.at >= oldest)
}

/** 남길 것이 없으면 내용을 지우고, 지웠다는 사실만 남겨 다른 기기와 서버에서도 지워지게 한다. */
async function keepTurns(keep: (turn: Turn) => boolean): Promise<void> {
  const transaction = (await database).transaction('records', 'readwrite')
  let changed = false
  for (const record of await transaction.store.getAll()) {
    if (record.kind !== 'talk' || isPurged(record)) continue
    const turns = record.data.turns.filter(keep)
    if (turns.length === record.data.turns.length) continue
    const updatedAt = nextTimestamp(record.updatedAt)
    await transaction.store.put({
      ...record,
      data: turns.length ? { turns } : { purged: true },
      updatedAt,
      deletedAt: turns.length ? null : updatedAt,
      dirty: 1,
    } as TalkRecord)
    changed = true
  }
  await transaction.done
  if (changed) notifyRecords()
}
