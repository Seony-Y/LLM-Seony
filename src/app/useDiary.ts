import { useCallback, useEffect, useRef } from 'react'
import { requestDiary } from '../features/assistant/api/requestDiary'
import { lastTurnAt, pendingDiaries, type DiaryEntry } from '../features/assistant/diary'
import type { DayState } from '../features/assistant/speech'
import { saveRecord } from '../features/records/recordStore'
import type { Records } from '../features/records/useRecords'

/** 이야기할 때마다 다시 쓰지 않도록 사이를 둔다. */
const RETRY = 10 * 60_000

/** 때가 되면 일기를 쓴다. 연결이 안 되면 정해진 글로 쓰고 나중에 다시 쓴다. */
export function useDiary(state: DayState, { loaded, diaries, talk }: Records, accessKey: string) {
  const triedAt = useRef(new Map<string, number>())

  const write = useCallback(
    async (entry: DiaryEntry): Promise<string> => {
      const saved = diaries.find(({ data }) => data.date === entry.date)?.data
      const { date } = entry
      triedAt.current.set(date, Date.now())
      if (accessKey) {
        try {
          const body = await requestDiary(accessKey, entry)
          if (body) {
            const written = { until: lastTurnAt(entry), rule: entry.body }
            await saveRecord('diary', { date, body, written }, `diary-${date}`)
            return body
          }
        } catch (error) {
          console.warn(error)
        }
      }
      // 대화를 담아 쓴 일기는 정해진 글로 덮지 않는다.
      if (saved?.written) return saved.body
      if (saved?.body !== entry.body) await saveRecord('diary', { date, body: entry.body }, `diary-${date}`)
      return entry.body
    },
    [accessKey, diaries],
  )

  useEffect(() => {
    if (!loaded) return
    for (const entry of pendingDiaries(state, diaries, talk, accessKey !== '')) {
      const tried = triedAt.current.get(entry.date) ?? 0
      if (accessKey && Date.now() - tried < RETRY) continue
      void write(entry).catch(console.error)
    }
  }, [loaded, state, diaries, talk, accessKey, write])

  return write
}
