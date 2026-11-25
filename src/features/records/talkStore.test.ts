import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { database } from './db'
import { loadRecords } from './recordStore'
import { clearTalk, expireTalk, removeTurn, saveTurn } from './talkStore'

const turn = (id: string, at: string, reply = '응') => ({ id, at, question: `${id}?`, reply })

beforeEach(async () => {
  await (await database).clear('records')
})

test('같은 날 대화는 한 기록에 모이고, 고치면 바뀐다', async () => {
  await saveTurn(turn('a', '2026-11-25T03:00:00.000Z'))
  await saveTurn(turn('b', '2026-11-25T03:01:00.000Z'))
  await saveTurn(turn('a', '2026-11-25T03:00:00.000Z', '고침'))
  const records = await loadRecords()
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({ kind: 'talk', dirty: 1 })
  expect(records[0].data).toMatchObject({ turns: [{ id: 'b' }, { id: 'a', reply: '고침' }] })
})

test('하나만 지우거나 모두 지우면 내용이 남지 않는다', async () => {
  await saveTurn(turn('a', '2026-11-25T03:00:00.000Z'))
  await saveTurn(turn('b', '2026-11-25T03:01:00.000Z'))
  await removeTurn('a')
  expect((await loadRecords())[0].data).toMatchObject({ turns: [{ id: 'b' }] })
  await clearTalk()
  const [record] = await loadRecords()
  expect(record.data).toEqual({ purged: true })
  expect(record.deletedAt).not.toBeNull()

  await saveTurn(turn('c', '2026-11-25T03:02:00.000Z'))
  expect((await loadRecords())[0]).toMatchObject({ deletedAt: null, data: { turns: [{ id: 'c' }] } })
})

test('7일이 지난 대화만 지운다', async () => {
  await saveTurn(turn('old', '2026-11-17T03:00:00.000Z'))
  await saveTurn(turn('new', '2026-11-19T03:00:00.000Z'))
  await expireTalk(new Date('2026-11-25T03:00:00.000Z'))
  const text = JSON.stringify(await loadRecords())
  expect(text).not.toContain('old?')
  expect(text).toContain('new?')
})
