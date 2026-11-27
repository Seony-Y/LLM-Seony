import 'fake-indexeddb/auto'
import { beforeEach, expect, test } from 'vitest'
import { importBackup } from './backup'
import { database } from './db'
import { emptyTrash, loadRecords, resetOldDiaries, saveRecord, setDeleted } from './recordStore'
import { linkServer, syncRecords, type RemoteRecords, type RemoteRow } from './sync'
import type { AssistantRecord } from './types'

/** server/index.ts와 같은 규칙으로 동작하는 서버. */
function fakeServer() {
  const rows = new Map<string, RemoteRow>()
  let seq = 0
  const remote: RemoteRecords = {
    async push(incoming) {
      for (const row of incoming) {
        const old = rows.get(row.id)
        if (old && Date.parse(row.updated_at) <= Date.parse(old.updated_at)) continue
        rows.set(row.id, { ...structuredClone(row), seq: ++seq })
      }
    },
    async pull(after) {
      return [...rows.values()]
        .filter((row) => row.seq > after)
        .sort((left, right) => left.seq - right.seq)
        .slice(0, 100)
    },
  }
  return { rows, remote }
}

async function wipeDevice() {
  const db = await database
  await db.clear('records')
  await db.clear('meta')
  await linkServer('me')
}

async function only() {
  const records = await loadRecords()
  expect(records).toHaveLength(1)
  return records[0]
}

const row = (title: string, updated_at: string): Omit<RemoteRow, 'seq'> => ({
  id: 'a',
  kind: 'todo',
  data: { title, doneAt: null },
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at,
  deleted_at: null,
})

beforeEach(wipeDevice)

test('기기를 초기화해도 서버에서 복구한다', async () => {
  const { remote } = fakeServer()
  await saveRecord('todo', { title: '빨래', doneAt: null }, 'a')
  await syncRecords(remote, 'me')
  await wipeDevice()
  await syncRecords(remote, 'me')
  expect(await only()).toMatchObject({ dirty: 0, data: { title: '빨래' } })
})

test('서버 값이 더 최근이면 기기의 오래된 수정을 덮는다', async () => {
  const { remote } = fakeServer()
  await saveRecord('todo', { title: '기기', doneAt: null }, 'a')
  await remote.push([row('서버', '2099-01-01T00:00:00.000Z')])
  await syncRecords(remote, 'me')
  expect((await only()).data).toMatchObject({ title: '서버' })
})

test('기기 수정이 더 최근이면 서버를 덮는다', async () => {
  const { remote, rows } = fakeServer()
  await remote.push([row('서버', '2026-01-01T00:00:00.000Z')])
  await saveRecord('todo', { title: '기기', doneAt: null }, 'a')
  await syncRecords(remote, 'me')
  expect((await only()).data).toMatchObject({ title: '기기' })
  expect(rows.get('a')?.data).toMatchObject({ title: '기기' })
})

test('올리는 도중 생긴 수정을 잃지 않는다', async () => {
  const { remote, rows } = fakeServer()
  await saveRecord('todo', { title: '처음', doneAt: null }, 'a')
  const push = remote.push
  remote.push = async (incoming) => {
    await push(incoming)
    remote.push = push
    await saveRecord('todo', { title: '나중', doneAt: null }, 'a')
  }
  await syncRecords(remote, 'me')
  expect(await only()).toMatchObject({ dirty: 1, data: { title: '나중' } })
  await syncRecords(remote, 'me')
  expect(rows.get('a')?.data).toMatchObject({ title: '나중' })
})

test('전송에 실패하면 올릴 변경으로 남는다', async () => {
  const { remote } = fakeServer()
  remote.push = () => Promise.reject(new Error('offline'))
  await saveRecord('todo', { title: '빨래', doneAt: null }, 'a')
  await expect(syncRecords(remote, 'me')).rejects.toThrow('offline')
  expect((await only()).dirty).toBe(1)
})

test('삭제와 되살리기가 동기화된다', async () => {
  const { remote, rows } = fakeServer()
  await saveRecord('todo', { title: '빨래', doneAt: null }, 'a')
  await setDeleted('a', true)
  await syncRecords(remote, 'me')
  expect(rows.get('a')?.deleted_at).not.toBeNull()
  await setDeleted('a', false)
  await syncRecords(remote, 'me')
  expect(rows.get('a')?.deleted_at).toBeNull()
})

test('휴지통을 비우면 내용이 서버에서도 사라진다', async () => {
  const { remote, rows } = fakeServer()
  await saveRecord('todo', { title: '비밀', doneAt: null }, 'a')
  await saveRecord('todo', { title: '남길 것', doneAt: null }, 'b')
  await syncRecords(remote, 'me')
  await setDeleted('a', true)
  await emptyTrash()
  await syncRecords(remote, 'me')
  expect(rows.get('a')?.data).toEqual({ purged: true, doneAt: null })
  expect(rows.get('b')?.data).toMatchObject({ title: '남길 것' })
})

test('연결한 적 없는 서버에는 올리지 않는다', async () => {
  const { remote, rows } = fakeServer()
  await saveRecord('todo', { title: '빨래', doneAt: null }, 'a')
  await expect(syncRecords(remote, 'other')).rejects.toThrow('다릅니다')
  expect(rows.size).toBe(0)
})

test('서버를 새로 만들어 연결하면 기기의 기록을 모두 다시 올린다', async () => {
  const first = fakeServer()
  await saveRecord('todo', { title: '빨래', doneAt: null }, 'a')
  await syncRecords(first.remote, 'me')
  const second = fakeServer()
  await linkServer('new')
  await syncRecords(second.remote, 'new')
  expect(second.rows.get('a')?.data).toMatchObject({ title: '빨래' })
})

test('여러 쪽이어도 모두 내려받는다', async () => {
  const { remote } = fakeServer()
  await remote.push(
    Array.from({ length: 1001 }, (_, index) => ({
      ...row('x', '2026-01-01T00:00:00.000Z'),
      id: `r${index}`,
    })),
  )
  await syncRecords(remote, 'me')
  expect(await loadRecords()).toHaveLength(1001)
})

test('백업은 더 최근 기록만 되살리고 잘못된 파일은 거절한다', async () => {
  await saveRecord('todo', { title: '지금', doneAt: null }, 'a')
  const old = { ...((await only()) as AssistantRecord), updatedAt: '2020-01-01T00:00:00.000Z' }
  expect(await importBackup(JSON.stringify({ version: 1, records: [old] }))).toBe(0)
  expect(await importBackup(JSON.stringify({ version: 1, records: [{ ...old, id: 'b' }] }))).toBe(1)
  await expect(importBackup('{"version":2}')).rejects.toThrow('백업 파일')
})

test('바꾸기 전에 쓴 어제와 오늘 일기만 한 번 지우고, 지난 일기는 남긴다', async () => {
  const db = await database
  const diary = (id: string, updatedAt: string) =>
    ({ id, kind: 'diary', data: { date: id, body: '일기' }, createdAt: updatedAt, updatedAt, deletedAt: null, dirty: 0 }) as AssistantRecord
  await db.put('records', diary('2026-11-20', '2026-11-20T13:00:00.000Z'))
  await db.put('records', diary('2026-11-26', '2026-11-27T05:00:00.000Z'))
  await db.put('records', diary('2026-11-27', '2026-11-27T13:00:00.000Z'))
  await resetOldDiaries(new Date(2026, 10, 27, 16))
  const [past, yesterday, today] = await db.getAll('records')
  expect(past).toMatchObject({ data: { body: '일기' }, deletedAt: null })
  expect(yesterday).toMatchObject({ data: { purged: true }, dirty: 1 })
  expect(yesterday.deletedAt).not.toBeNull()
  expect(today).toMatchObject({ data: { body: '일기' }, deletedAt: null })
  // 한 번만 지운다.
  await db.put('records', diary('2026-11-26', '2026-11-27T05:00:00.000Z'))
  await resetOldDiaries(new Date(2026, 10, 27, 16))
  expect(await db.get('records', '2026-11-26')).toMatchObject({ data: { body: '일기' } })
})
