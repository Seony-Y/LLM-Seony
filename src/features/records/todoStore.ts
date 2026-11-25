import { localDate } from '../assistant/speech'
import { database } from './db'
import { isPurged, nextTimestamp, notifyRecords } from './recordStore'
import { nextDate, occurrenceId } from './repeat'
import type { AssistantRecord } from './types'

type TodoRecord = AssistantRecord<'todo'>

/** 끝내거나 되돌린다. 반복되는 일은 끝낼 때 다음 차례를 만들고, 되돌리면 그것을 거둔다. */
export async function toggleTodo(id: string, now = new Date()): Promise<void> {
  const transaction = (await database).transaction('records', 'readwrite')
  const { store } = transaction
  const todo = (await store.get(id)) as TodoRecord | undefined
  if (!todo || isPurged(todo)) return
  const { repeat, dueDate, doneAt } = todo.data
  const finished = doneAt === null

  let nextId = todo.data.nextId
  if (repeat && finished) {
    // 밀린 만큼 쌓지 않고 오늘 다음 차례로 넘어간다.
    const due = dueDate ?? localDate(now)
    const today = localDate(now)
    let next = nextDate(repeat, new Date(`${due}T00:00`))
    while (localDate(next) <= today) next = nextDate(repeat, next)
    const nextDue = localDate(next)
    nextId = occurrenceId(id, nextDue)
    const previous = (await store.get(nextId)) as TodoRecord | undefined
    // 다른 기기에서 이미 만들었다면 그대로 둔다.
    if (!previous || previous.deletedAt) {
      const updatedAt = nextTimestamp(previous?.updatedAt)
      await store.put({
        id: nextId,
        kind: 'todo',
        data: { title: todo.data.title, doneAt: null, dueDate: nextDue, repeat },
        createdAt: previous?.createdAt ?? updatedAt,
        updatedAt,
        deletedAt: null,
        dirty: 1,
      })
    }
  } else if (nextId && !finished) {
    const next = (await store.get(nextId)) as TodoRecord | undefined
    if (next && !next.deletedAt && !next.data.doneAt) {
      const updatedAt = nextTimestamp(next.updatedAt)
      await store.put({
        ...next,
        data: { purged: true, doneAt: null } as unknown as TodoRecord['data'],
        updatedAt,
        deletedAt: updatedAt,
        dirty: 1,
      })
    }
    nextId = undefined
  }

  await store.put({
    ...todo,
    data: { ...todo.data, doneAt: finished ? now.toISOString() : null, nextId },
    updatedAt: nextTimestamp(todo.updatedAt),
    dirty: 1,
  })
  await transaction.done
  notifyRecords()
}
