export interface Env {
  DB: D1Database
  BACKUPS: KVNamespace
  ACCESS_KEY: string
  /** 카카오 개발자 REST 키. 없으면 이동 시간을 계산하지 않는다. */
  KAKAO_REST_KEY?: string
  AI: { run(model: string, input: object): Promise<unknown> }
}

interface Row {
  id: string
  kind: string
  data: unknown
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const KINDS = ['event', 'todo', 'note', 'diary', 'talk', 'setting', 'visit']
const CHAT_MODEL = '@cf/google/gemma-4-26b-a4b-it'
const CHAT_ROLES = ['system', 'user', 'assistant']
const MAX_MESSAGES = 20
const MAX_CHAT_LENGTH = 30_000
const MAX_REPLY_TOKENS = 300
const APP_ORIGIN = 'https://localhost'
const MAX_ROWS = 100
const MAX_BODY = 1_000_000
const CLOCK_SKEW = 60_000
const MIN_KEY_LENGTH = 32
const TALK_DAYS = 7
const BACKUP_DAYS = 30
const BACKUP_PAGE = 1000
const MAX_PLACE = 100
const KAKAO_TIMEOUT = 8000
/** 이만큼 가까우면 차를 탈 일이 아니다. 길찾기는 바로 앞도 한 바퀴 도는 길로 계산한다. */
const NEARBY_METERS = 500
const PLACE_RESULTS = 5

// 한 문장으로 처리해 중간에 실패해도 일부만 저장되지 않는다.
// 더 최근에 수정된 값만 받아들이고, seq는 저장할 때마다 늘어난다.
const UPSERT = `
INSERT INTO records (id, kind, data, created_at, updated_at, deleted_at, seq)
SELECT value ->> 'id', value ->> 'kind', value ->> 'data', value ->> 'created_at',
  value ->> 'updated_at', value ->> 'deleted_at',
  (SELECT coalesce(max(seq), 0) FROM records) + key + 1
FROM json_each(?1) WHERE true
ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, data = excluded.data,
  updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, seq = excluded.seq
WHERE excluded.updated_at > records.updated_at`

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'OPTIONS') return withCors(request, new Response(null, { status: 204 }))
    try {
      return withCors(request, await route(request, url, env))
    } catch (error) {
      if (error instanceof HttpError) {
        return withCors(request, Response.json({ error: error.message }, { status: error.status }))
      }
      console.error(error)
      return withCors(request, Response.json({ error: '서버 오류입니다.' }, { status: 500 }))
    }
  },

  async scheduled(controller, env) {
    const now = new Date(controller.scheduledTime)
    await expireTalk(env, now)
    await backup(env, now)
  },
} satisfies ExportedHandler<Env>

class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function route(request: Request, url: URL, env: Env): Promise<Response> {
  await authorize(request, env)
  switch (`${request.method} ${url.pathname}`) {
    case 'GET /api/server':
      return Response.json({ id: await env.DB.prepare('SELECT id FROM server_info').first('id') })
    case 'GET /api/records':
      return Response.json(await pull(url, env))
    case 'POST /api/records':
      await env.DB.prepare(UPSERT).bind(JSON.stringify(await readRows(request))).run()
      return new Response(null, { status: 204 })
    case 'POST /api/chat':
      return Response.json({ text: await chat(await readMessages(request), url.searchParams.has('precise'), env) })
    case 'POST /api/places':
      return Response.json(await places(await readJson(request), env))
    case 'POST /api/travel':
      return Response.json(await travel(await readJson(request), env))
    case 'GET /api/backups': {
      const { keys } = await env.BACKUPS.list()
      return Response.json(keys.map(({ name }) => name))
    }
  }
  const date = url.pathname.match(/^\/api\/backups\/(\d{4}-\d{2}-\d{2})$/)?.[1]
  const saved = date && request.method === 'GET' && (await env.BACKUPS.get(date))
  if (!saved) throw new HttpError(404, '없는 주소입니다.')
  return new Response(saved, { headers: { 'Content-Type': 'application/json' } })
}

async function authorize(request: Request, env: Env) {
  if ((env.ACCESS_KEY ?? '').length < MIN_KEY_LENGTH) {
    throw new HttpError(500, '서버에 비밀 키가 설정되지 않았습니다.')
  }
  const given = request.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  const [left, right] = await Promise.all([digest(given), digest(env.ACCESS_KEY)])
  if (left.reduce((difference, byte, index) => difference | (byte ^ right[index]), 0)) {
    throw new HttpError(401, '비밀 키가 맞지 않습니다.')
  }
}

async function digest(text: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

async function pull(url: URL, env: Env) {
  const after = Number(url.searchParams.get('after') ?? 0)
  if (!Number.isSafeInteger(after) || after < 0) throw new HttpError(400, 'after 값이 잘못됐습니다.')
  const { results } = await env.DB.prepare(
    'SELECT id, kind, data, created_at, updated_at, deleted_at, seq FROM records WHERE seq > ?1 ORDER BY seq LIMIT ?2',
  )
    .bind(after, MAX_ROWS)
    .all<Row & { data: string; seq: number }>()
  return results.map((row) => ({ ...row, data: JSON.parse(row.data) as unknown }))
}

interface Message {
  role: string
  content: string
}

async function readMessages(request: Request): Promise<Message[]> {
  const messages = await readJson(request)
  const valid =
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= MAX_MESSAGES &&
    messages.every((item) => CHAT_ROLES.includes(item?.role) && typeof item.content === 'string')
  if (!valid) throw new HttpError(400, '대화 형식이 잘못됐습니다.')
  const list = (messages as Message[]).map(({ role, content }) => ({ role, content }))
  if (list.reduce((sum, { content }) => sum + content.length, 0) > MAX_CHAT_LENGTH) {
    throw new HttpError(413, '대화가 너무 깁니다.')
  }
  return list
}

async function chat(messages: Message[], precise: boolean, env: Env): Promise<string> {
  const reply = (await env.AI.run(CHAT_MODEL, {
    messages,
    max_tokens: MAX_REPLY_TOKENS,
    temperature: precise ? 0 : 0.6,
    chat_template_kwargs: { enable_thinking: false },
  }).catch((error: unknown) => {
    console.error(error)
    return null
  })) as { choices?: { message?: { content?: string | null } }[] } | null
  const text = reply?.choices?.[0]?.message?.content?.trim()
  if (!text) throw new HttpError(502, '지금은 AI가 답하지 못합니다.')
  return text
}

interface Coords {
  latitude: number
  longitude: number
}

function readCoords(value: unknown): Coords | null {
  const { latitude, longitude } = (value ?? {}) as { latitude?: unknown; longitude?: unknown }
  const coords = { latitude: Number(latitude), longitude: Number(longitude) }
  return value && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude) ? coords : null
}

function readPlace(value: unknown) {
  const place = typeof value === 'string' ? value.trim() : ''
  return place.length <= MAX_PLACE ? place : ''
}

/** 카카오 API. 키는 서버에만 둔다. */
async function kakao<T>(env: Env, url: string): Promise<T> {
  if (!env.KAKAO_REST_KEY) throw new HttpError(503, '서버에 길찾기 키가 설정되지 않았습니다.')
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${env.KAKAO_REST_KEY}` },
    signal: AbortSignal.timeout(KAKAO_TIMEOUT),
  }).catch(() => null)
  if (!response?.ok) {
    console.error('kakao', response?.status, await response?.text().catch(() => ''))
    throw new HttpError(502, '지금은 길찾기를 하지 못합니다.')
  }
  return (await response.json()) as T
}

interface KakaoPlace {
  place_name: string
  road_address_name: string
  address_name: string
  x: string
  y: string
}

/** 장소 이름으로 찾은 후보. near가 있으면 가까운 곳이 먼저 나온다. */
async function searchPlaces(env: Env, query: string, near: Coords | null, size: number) {
  const search = new URLSearchParams({ query, size: String(size) })
  if (near) {
    search.set('x', String(near.longitude))
    search.set('y', String(near.latitude))
  }
  const { documents } = await kakao<{ documents: KakaoPlace[] }>(
    env,
    `https://dapi.kakao.com/v2/local/search/keyword.json?${search}`,
  )
  return documents.map((found) => ({
    name: found.place_name,
    address: found.road_address_name || found.address_name,
    latitude: Number(found.y),
    longitude: Number(found.x),
  }))
}

/** 일정에 넣을 장소를 고르도록 후보를 준다. */
async function places(body: unknown, env: Env) {
  const { query, near } = (body ?? {}) as { query?: unknown; near?: unknown }
  const place = readPlace(query)
  if (!place) throw new HttpError(400, '찾을 장소가 필요합니다.')
  return searchPlaces(env, place, readCoords(near), PLACE_RESULTS)
}

/** 지금 자리에서 장소까지 차로 걸리는 시간. 고른 장소면 at에 좌표가 있다. */
async function travel(body: unknown, env: Env) {
  const { from: origin, to, at } = (body ?? {}) as { from?: unknown; to?: unknown; at?: unknown }
  const from = readCoords(origin)
  const place = readPlace(to)
  if (!from || !place) throw new HttpError(400, '길찾기 형식이 잘못됐습니다.')

  // 이름만 있으면 같은 이름 가운데 가까운 곳이 맞을 가능성이 크다.
  const found = readCoords(at)
    ? { name: place, ...readCoords(at)! }
    : (await searchPlaces(env, place, from, 1))[0]
  if (!found) throw new HttpError(404, '장소를 찾지 못했습니다.')
  if (meters(from.latitude, from.longitude, found.latitude, found.longitude) < NEARBY_METERS) {
    return { place: found.name, minutes: 0 }
  }

  const route = new URLSearchParams({
    origin: `${from.longitude},${from.latitude}`,
    destination: `${found.longitude},${found.latitude}`,
  })
  const { routes } = await kakao<{ routes: { result_code: number; summary?: { duration: number } }[] }>(
    env,
    `https://apis-navi.kakaomobility.com/v1/directions?${route}`,
  )
  const [best] = routes
  // 104는 출발지와 도착지가 너무 가까울 때다.
  if (best?.result_code === 104) return { place: found.name, minutes: 0 }
  if (best?.result_code !== 0 || !best.summary) throw new HttpError(404, '길을 찾지 못했습니다.')
  return { place: found.name, minutes: Math.ceil(best.summary.duration / 60) }
}

/** 두 좌표 사이의 직선거리. */
function meters(fromLatitude: number, fromLongitude: number, toLatitude: number, toLongitude: number) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const a =
    Math.sin(radians(toLatitude - fromLatitude) / 2) ** 2 +
    Math.cos(radians(fromLatitude)) * Math.cos(radians(toLatitude)) * Math.sin(radians(toLongitude - fromLongitude) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a))
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (text.length > MAX_BODY) throw new HttpError(413, '한 번에 보낼 수 있는 양을 넘었습니다.')
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readRows(request: Request): Promise<Row[]> {
  const rows = await readJson(request)
  if (!Array.isArray(rows) || rows.length > MAX_ROWS) throw new HttpError(400, '기록 형식이 잘못됐습니다.')
  return rows.map(normalize)
}

function normalize(row: Partial<Row> | null): Row {
  const valid =
    typeof row?.id === 'string' &&
    row.id.length > 0 &&
    row.id.length <= 100 &&
    KINDS.includes(row.kind ?? '') &&
    typeof row.data === 'object' &&
    row.data !== null
  if (!valid) throw new HttpError(400, '기록 형식이 잘못됐습니다.')

  const latest = new Date(Date.now() + CLOCK_SKEW).toISOString()
  const updatedAt = timestamp(row.updated_at)
  return {
    id: row.id!,
    kind: row.kind!,
    data: row.data,
    created_at: timestamp(row.created_at),
    // 시계가 앞선 기기가 계속 이기지 않게 한다.
    updated_at: updatedAt < latest ? updatedAt : latest,
    deleted_at: row.deleted_at ? timestamp(row.deleted_at) : null,
  }
}

/** 문자열로 비교할 수 있게 같은 형식으로 맞춘다. */
function timestamp(value: unknown) {
  const time = typeof value === 'string' ? Date.parse(value) : NaN
  if (!(time >= 0 && time < Date.UTC(9999, 0))) throw new HttpError(400, '시각 형식이 잘못됐습니다.')
  return new Date(time).toISOString()
}

/** 오래된 대화의 내용을 지운다. 빈 행은 다른 기기에 알리기 위해 둔다. */
async function expireTalk(env: Env, now: Date) {
  const oldest = new Date(now.getTime() - TALK_DAYS * 86_400_000).toISOString()
  const { results } = await env.DB.prepare(
    "SELECT id, kind, created_at FROM records WHERE kind = 'talk' AND deleted_at IS NULL AND created_at < ?1",
  )
    .bind(oldest)
    .all<Pick<Row, 'id' | 'kind' | 'created_at'>>()
  if (!results.length) return
  const at = now.toISOString()
  const rows = results.map((row) => ({ ...row, data: { purged: true }, updated_at: at, deleted_at: at }))
  await env.DB.prepare(UPSERT).bind(JSON.stringify(rows)).run()
}

/** 앱의 "백업 가져오기"로 바로 읽을 수 있는 형식으로 저장한다. */
async function backup(env: Env, now: Date) {
  const records: unknown[] = []
  for (let after = 0; ; ) {
    const { results } = await env.DB.prepare('SELECT * FROM records WHERE seq > ?1 ORDER BY seq LIMIT ?2')
      .bind(after, BACKUP_PAGE)
      .all<Row & { data: string; seq: number }>()
    for (const row of results) {
      records.push({
        id: row.id,
        kind: row.kind,
        data: JSON.parse(row.data),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at,
      })
      after = row.seq
    }
    if (results.length < BACKUP_PAGE) break
  }
  const exportedAt = now.toISOString()
  await env.BACKUPS.put(
    exportedAt.slice(0, 10),
    JSON.stringify({ version: 1, exportedAt, records }),
    { expirationTtl: BACKUP_DAYS * 86_400 },
  )
}

function withCors(request: Request, response: Response) {
  const headers = new Headers(response.headers)
  headers.set('Cache-Control', 'no-store')
  headers.set('Vary', 'Origin')
  if (request.headers.get('Origin') === APP_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', APP_ORIGIN)
    headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    headers.set('Access-Control-Allow-Methods', 'GET, POST')
    headers.set('Access-Control-Max-Age', '86400')
  }
  return new Response(response.body, { status: response.status, headers })
}
