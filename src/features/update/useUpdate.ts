import { useEffect, useState } from 'react'
import { applyUpdate, checkUpdate, reportReady, updateSupported, type UpdateStatus } from './appUpdate'

const CHECK_INTERVAL = 60 * 60_000
/** 이만큼 자리를 비웠다 돌아오면 쓰던 글이 없다고 보고 바로 적용한다. */
const AWAY = 10 * 60_000

/** @param ready 기록까지 읽어 화면이 정상으로 열렸는지 */
export function useUpdate(ready: boolean) {
  const [status, setStatus] = useState<UpdateStatus>('latest')

  useEffect(() => {
    if (ready) void reportReady().catch(console.error)
  }, [ready])

  useEffect(() => {
    if (!ready || !updateSupported) return
    let checkedAt = 0
    let hiddenAt = 0
    let downloaded = false

    const check = async () => {
      if (Date.now() - checkedAt < CHECK_INTERVAL) return
      checkedAt = Date.now()
      const next = await checkUpdate()
      downloaded = next === 'downloaded'
      setStatus(next)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (downloaded && hiddenAt && Date.now() - hiddenAt > AWAY) void applyUpdate().catch(console.error)
      else void check().catch(console.error)
    }
    void check().catch(console.error)
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [ready])

  return status
}
