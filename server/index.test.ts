import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import worker, { type Env } from './index'

const KEY = 'k'.repeat(40)
let env: Env
let dispose: () => Promise<void>

beforeAll(async () => {
  const proxy = await getPlatformProxy<Env>({ persist: false })
  env = { ...proxy.env, ACCESS_KEY: KEY }
  dispose = proxy.dispose
  const sql = readFileSync('server/migrations/0001_records.sql', 'utf8').replace(/^--.*$/gm, '')
  // 트리거 본문의 세미콜론에서는 자르지 않는다.
  const statements = sql.match(/\s*CREATE TRIGGER[\s\S]*?END;|[^;]+;/g) ?? []
  for (const statement of statements.map((text) => text.trim()).filter((text) => text.length > 1)) {
    await env.DB.prepare(statement).run()
  }
}, 60_000)

afterAll(() => dispose())

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM records'),
    env.DB.prepare('DELETE FROM record_history'),
  ])
})

function call(path: string, init: RequestInit = {}, key = KEY, current = env) {
  const request = new Request(`https://server/api/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...init.headers },
  })
  return worker.fetch(request as never, current) as unknown as Promise<Response>
}

function push(...rows: object[]) {
  return call('records', { method: 'POST', body: JSON.stringify(rows) })
}

async function pull(after = 0) {
  const response = await call(`records?after=${after}`)
  return (await response.json()) as { id: string; data: { t: string }; seq: number; updated_at: string }[]
}

const row = (id: string, t: string, updated_at: string) => ({
  id,
  kind: 'todo',
  data: { t },
  created_at: '2026-01-01T00:00:00Z',
  updated_at,
  deleted_at: null,
})

test('키가 없거나 틀리면 막고, 서버 키가 약하면 열리지 않는다', async () => {
  expect((await call('records', {}, '')).status).toBe(401)
  expect((await call('records', {}, 'wrong')).status).toBe(401)
  expect((await call('backups', {}, 'wrong')).status).toBe(401)
  expect((await call('records', {}, '', { ...env, ACCESS_KEY: '' })).status).toBe(500)
})

test('나중 값이 이기고 이전 값은 이력에 남는다', async () => {
  expect((await push(row('a', '따옴표 "1"', '2026-01-01T00:00:00Z'))).status).toBe(204)
  const [first] = await pull()
  await push(row('a', 'v2', '2026-01-02T00:00:00.000Z'))
  await push(row('a', '옛값', '2025-01-01T00:00:00Z'))
  const [second] = await pull()
  expect(first.data.t).toBe('따옴표 "1"')
  expect(second).toMatchObject({ data: { t: 'v2' } })
  expect(second.seq).toBeGreaterThan(first.seq)
  expect((await env.DB.prepare('SELECT * FROM record_history').all()).results).toHaveLength(1)
})

test('미래 시각은 지금으로 당긴다', async () => {
  await push(row('a', 'x', '2999-01-01T00:00:00Z'))
  expect(Date.parse((await pull())[0].updated_at)).toBeLessThan(Date.now() + 120_000)
})

test('쪽을 넘겨도 빠지거나 겹치지 않는다', async () => {
  for (let page = 0; page < 3; page += 1) {
    await push(
      ...Array.from({ length: 90 }, (_, index) => row(`${page}-${index}`, 'x', '2026-01-01T00:00:00Z')),
    )
  }
  const ids: string[] = []
  for (let after = 0; ; ) {
    const rows = await pull(after)
    if (!rows.length) break
    ids.push(...rows.map(({ id }) => id))
    after = rows.at(-1)!.seq
  }
  expect(ids).toHaveLength(270)
  expect(new Set(ids).size).toBe(270)
})

test('잘못된 기록이 섞이면 하나도 저장하지 않는다', async () => {
  const good = row('a', 'x', '2026-01-01T00:00:00Z')
  expect((await push(good, { ...good, kind: 'other' })).status).toBe(400)
  expect((await push({ ...good, updated_at: '어제' })).status).toBe(400)
  expect((await call('records', { method: 'POST', body: '{' })).status).toBe(400)
  expect(await pull()).toHaveLength(0)
})

test('앱 출처에만 CORS를 연다', async () => {
  const preflight = (origin: string) => call('records', { method: 'OPTIONS', headers: { Origin: origin } })
  expect((await preflight('https://localhost')).headers.get('Access-Control-Allow-Origin')).toBe('https://localhost')
  expect((await preflight('https://evil.example')).headers.get('Access-Control-Allow-Origin')).toBeNull()
})

test('매일 백업을 만들고 다시 읽을 수 있다', async () => {
  await push(row('a', 'x', '2026-01-01T00:00:00Z'))
  await worker.scheduled({ scheduledTime: Date.UTC(2026, 10, 24, 18) } as never, env)
  expect(await (await call('backups')).json()).toContain('2026-11-24')
  const saved = (await (await call('backups/2026-11-24')).json()) as { version: number; records: object[] }
  expect(saved.version).toBe(1)
  expect(saved.records[0]).toMatchObject({ id: 'a', kind: 'todo', createdAt: '2026-01-01T00:00:00.000Z' })
  expect((await call('backups/2020-01-01')).status).toBe(404)
})
