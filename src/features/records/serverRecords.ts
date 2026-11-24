import { Capacitor } from '@capacitor/core'
import { env } from '../../shared/config/env'
import type { RemoteRecords, RemoteRow } from './sync'

const TIMEOUT = 15_000

/** 웹은 앱을 내려준 서버를 그대로 쓰고, 폰 앱은 빌드할 때 정한 주소를 쓴다. */
export const serverConfigured = !Capacitor.isNativePlatform() || env.serverUrl !== ''

export class ServerError extends Error {}

async function call(accessKey: string, path: string, body?: unknown): Promise<Response> {
  const base = Capacitor.isNativePlatform() ? env.serverUrl : ''
  let response: Response
  try {
    response = await fetch(`${base}/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${accessKey}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT),
    })
  } catch {
    throw new ServerError('서버에 연결하지 못했습니다. 연결되면 다시 보낼게요.')
  }
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: string } | null
    throw new ServerError(detail?.error ?? '서버에서 처리하지 못했습니다.')
  }
  return response
}

async function readJson<T>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T
  } catch {
    throw new ServerError('서버 응답을 읽지 못했습니다. 서버 주소를 확인해 주세요.')
  }
}

export async function fetchServerId(accessKey: string): Promise<string> {
  const { id } = await readJson<{ id?: string }>(await call(accessKey, 'server'))
  if (!id) throw new ServerError('서버 DB가 준비되지 않았습니다.')
  return id
}

export function serverRecords(accessKey: string): RemoteRecords {
  return {
    async push(rows) {
      await call(accessKey, 'records', rows)
    },
    async pull(afterSeq) {
      return readJson<RemoteRow[]>(await call(accessKey, `records?after=${afterSeq}`))
    },
  }
}
