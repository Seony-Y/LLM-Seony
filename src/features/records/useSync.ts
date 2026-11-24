import { useCallback, useEffect, useRef, useState } from 'react'
import { database } from './db'
import { fetchServerId, ServerError, serverRecords } from './serverRecords'
import { linkServer, syncRecords } from './sync'

const DEBOUNCE = 1500
const INTERVAL = 60_000

export function useSync(pending: number) {
  const [accessKey, setAccessKey] = useState('')
  const [error, setError] = useState('')
  const [lastSyncedAt, setLastSyncedAt] = useState('')
  const running = useRef(false)

  useEffect(() => {
    void database
      .then(async (db) => {
        setLastSyncedAt(String((await db.get('meta', 'lastSyncedAt')) ?? ''))
        setAccessKey(String((await db.get('meta', 'accessKey')) ?? ''))
      })
      .catch(console.error)
  }, [])

  const sync = useCallback(async () => {
    if (!accessKey || running.current) return
    running.current = true
    try {
      await syncRecords(serverRecords(accessKey), await fetchServerId(accessKey))
      setLastSyncedAt(new Date().toISOString())
      setError('')
    } catch (cause) {
      if (!(cause instanceof ServerError)) console.error(cause)
      setError(cause instanceof Error ? cause.message : '동기화하지 못했습니다.')
    } finally {
      running.current = false
    }
  }, [accessKey])

  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(sync, DEBOUNCE)
    return () => clearTimeout(timer)
  }, [pending, sync])

  useEffect(() => {
    const first = setTimeout(sync)
    const onVisible = () => document.visibilityState === 'visible' && void sync()
    const timer = setInterval(onVisible, INTERVAL)
    addEventListener('online', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
      removeEventListener('online', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sync])

  async function connect(key: string) {
    await linkServer(await fetchServerId(key))
    await (await database).put('meta', key, 'accessKey')
    setError('')
    setAccessKey(key)
  }

  async function disconnect() {
    await (await database).delete('meta', 'accessKey')
    setError('')
    setAccessKey('')
  }

  return { connected: accessKey !== '', error, lastSyncedAt, sync, connect, disconnect }
}

export type Sync = ReturnType<typeof useSync>
