import { useEffect, useMemo, useState } from 'react'
import { importLegacySchedules, loadRecords, subscribeRecords } from './recordStore'
import { defaultSettings, SETTINGS_ID, type AssistantRecord, type Kind } from './types'

const TRASH_DAYS = 30

export function useRecords() {
  const [records, setRecords] = useState<AssistantRecord[] | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const refresh = () =>
      loadRecords()
        .then((loaded) => {
          if (!active) return
          setRecords(loaded)
          setLoadedAt(Date.now())
        })
        .catch(() => active && setError('기기에 저장된 기록을 열지 못했습니다.'))
    const unsubscribe = subscribeRecords(refresh)
    void navigator.storage?.persist?.().catch(() => false)
    void importLegacySchedules().catch(console.error).then(refresh)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return useMemo(() => {
    const all = records ?? []
    const ofKind = <K extends Kind>(kind: K) =>
      all.filter(
        (record): record is Extract<AssistantRecord, { kind: K }> =>
          record.kind === kind && !record.deletedAt,
      )
    const oldest = loadedAt - TRASH_DAYS * 86_400_000
    const saved = ofKind('setting').find(({ id }) => id === SETTINGS_ID)
    return {
      loaded: records !== null,
      error,
      events: ofKind('event').sort((a, b) => a.data.startsAt.localeCompare(b.data.startsAt)),
      todos: ofKind('todo').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      notes: ofKind('note').sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      diaries: ofKind('diary').sort((a, b) => b.data.date.localeCompare(a.data.date)),
      settings: { ...defaultSettings, ...saved?.data },
      trash: all.filter(({ deletedAt }) => deletedAt && Date.parse(deletedAt) > oldest),
      pending: all.filter(({ dirty }) => dirty).length,
    }
  }, [records, loadedAt, error])
}

export type Records = ReturnType<typeof useRecords>
