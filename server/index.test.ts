import { readdirSync, readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { getPlatformProxy } from 'wrangler'
import worker, { type Env } from './index'

const KEY = 'k'.repeat(40)
let env: Env
let dispose: () => Promise<void>

beforeAll(async () => {
  const proxy = await getPlatformProxy<Env>({ persist: false, remoteBindings: false })
  env = { ...proxy.env, ACCESS_KEY: KEY }
  dispose = proxy.dispose
  const files = readdirSync('server/migrations').sort()
  const source = files.map((name) => readFileSync(`server/migrations/${name}`, 'utf8')).join('\n')
  const sql = source.replace(/^--.*$/gm, '')
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

test('휴지통에서 비운 기록은 이력까지 지운다', async () => {
  await push(row('a', '비밀', '2026-01-01T00:00:00Z'), row('b', 'x', '2026-01-01T00:00:00Z'))
  await push(row('a', '비밀2', '2026-01-02T00:00:00Z'), row('b', 'y', '2026-01-02T00:00:00Z'))
  await push({ ...row('a', '', '2026-01-03T00:00:00Z'), data: { purged: true } })
  const { results } = await env.DB.prepare('SELECT id FROM record_history').all()
  expect(results).toEqual([{ id: 'b' }])
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

test('대화는 비밀 키가 있을 때만 AI에게 넘긴다', async () => {
  const asked: unknown[] = []
  const AI = {
    run: async (_model: string, input: object) => {
      asked.push((input as { messages: unknown }).messages)
      return { choices: [{ message: { content: ' 안녕하세요. ' } }] }
    },
  }
  const send = (body: unknown, key = KEY) =>
    call('chat', { method: 'POST', body: JSON.stringify(body) }, key, { ...env, AI })
  const messages = [{ role: 'user', content: '안녕' }]

  expect(await (await send(messages)).json()).toEqual({ text: '안녕하세요.' })
  expect(asked).toEqual([messages])
  expect((await send(messages, 'x'.repeat(40))).status).toBe(401)
  expect((await send([{ role: 'tool', content: '' }])).status).toBe(400)
  expect((await send([])).status).toBe(400)
  expect((await send([{ role: 'user', content: 'a'.repeat(30_001) }])).status).toBe(413)
  expect(asked).toHaveLength(1)
})

test('AI가 실패하면 502로 알린다', async () => {
  const AI = { run: () => Promise.reject(new Error('한도 초과')) }
  const body = JSON.stringify([{ role: 'user', content: '안녕' }])
  expect((await call('chat', { method: 'POST', body }, KEY, { ...env, AI })).status).toBe(502)
})

test('대화는 고친 이력을 남기지 않고 7일 뒤에 지운다', async () => {
  const talk = (text: string, at: string) => ({ ...row('t', text, at), kind: 'talk', created_at: '2026-11-10T00:00:00Z' })
  await push(talk('첫 말', '2026-11-10T00:00:00Z'))
  await push(talk('다음 말', '2026-11-10T00:01:00Z'))
  const history = () => env.DB.prepare('SELECT count(*) AS n FROM record_history').first('n')
  expect(await history()).toBe(0)

  const run = (day: number) => worker.scheduled({ scheduledTime: Date.UTC(2026, 10, day) } as never, env)
  await run(16)
  expect((await pull())[0].data).toEqual({ t: '다음 말' })
  await run(18)
  expect((await pull())[0].data).toEqual({ purged: true })
  expect(await history()).toBe(0)
})

test('이동 시간은 카카오에서 장소를 찾고 차로 걸리는 분을 준다', async () => {
  const asked: string[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    asked.push(`${new Headers(init.headers).get('Authorization')} ${url}`)
    if (url.includes('dapi.kakao.com')) {
      return Response.json({ documents: [{ place_name: '강남역 2호선', x: '127.02', y: '37.49' }] })
    }
    return Response.json({ routes: [{ result_code: 0, summary: { duration: 1830 } }] })
  })
  const send = (body: unknown, current: Env = { ...env, KAKAO_REST_KEY: 'kakao' }) =>
    call('travel', { method: 'POST', body: JSON.stringify(body) }, KEY, current)
  const from = { latitude: 37.5, longitude: 127 }
  try {
    expect(await (await send({ from, to: '강남역' })).json()).toEqual({ place: '강남역 2호선', minutes: 31 })
    expect(asked[0]).toMatch(/^KakaoAK kakao .*query=%EA%B0%95%EB%82%A8%EC%97%AD/)
    expect(asked[1]).toContain('destination=127.02%2C37.49')
    // 바로 앞이면 길을 찾지 않는다.
    const nearby = await send({ from: { latitude: 37.4905, longitude: 127.0205 }, to: '강남역' })
    expect(await nearby.json()).toEqual({ place: '강남역 2호선', minutes: 0 })
    expect(asked).toHaveLength(3)
    expect((await send({ from, to: '' })).status).toBe(400)
    expect((await send({ from, to: '강남역' }, env)).status).toBe(503)
  } finally {
    vi.unstubAllGlobals()
  }
})

test('장소 후보를 주고, 고른 좌표가 있으면 다시 찾지 않고 길을 찾는다', async () => {
  const asked: string[] = []
  vi.stubGlobal('fetch', async (url: string) => {
    asked.push(url)
    if (url.includes('dapi.kakao.com')) {
      return Response.json({
        documents: [
          { place_name: '스타벅스 강남역점', road_address_name: '서울 강남구 강남대로 390', address_name: '', x: '127.03', y: '37.5' },
        ],
      })
    }
    return Response.json({ routes: [{ result_code: 0, summary: { duration: 600 } }] })
  })
  const current = { ...env, KAKAO_REST_KEY: 'kakao' }
  const post = (path: string, body: unknown) => call(path, { method: 'POST', body: JSON.stringify(body) }, KEY, current)
  try {
    expect(await (await post('places', { query: '스타벅스', near: { latitude: 37.4, longitude: 127 } })).json()).toEqual([
      { name: '스타벅스 강남역점', address: '서울 강남구 강남대로 390', latitude: 37.5, longitude: 127.03 },
    ])
    expect(asked[0]).toContain('x=127&y=37.4')
    expect((await post('places', { query: ' ' })).status).toBe(400)

    asked.length = 0
    const from = { latitude: 37.4, longitude: 127 }
    const chosen = await post('travel', { from, to: '스타벅스 강남역점', at: { latitude: 37.5, longitude: 127.03 } })
    expect(await chosen.json()).toEqual({ place: '스타벅스 강남역점', minutes: 10 })
    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('destination=127.03%2C37.5')
  } finally {
    vi.unstubAllGlobals()
  }
})
