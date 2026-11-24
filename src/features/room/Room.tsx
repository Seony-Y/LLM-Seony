import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../assistant/speech'
import type { Sky } from '../online/weather'
import type { Diorama, RoomTarget } from './diorama'

interface RoomProps {
  scene: Scene
  sky: Sky
  bondLevel: number
  hops: number
  cheers: number
  onTap: (target: RoomTarget) => void
}

export function Room({ scene, sky, bondLevel, hops, cheers, onTap }: RoomProps) {
  const container = useRef<HTMLDivElement>(null)
  const tapHandler = useRef(onTap)
  const [diorama, setDiorama] = useState<Diorama | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    tapHandler.current = onTap
  }, [onTap])

  useEffect(() => {
    let created: Diorama | null = null
    let cancelled = false
    import('./diorama')
      .then(({ createDiorama }) => {
        if (cancelled || !container.current) return
        created = createDiorama(container.current, (target) => tapHandler.current(target))
        setDiorama(created)
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      created?.dispose()
      setDiorama(null)
    }
  }, [])

  useEffect(() => {
    diorama?.setScene(scene)
  }, [diorama, scene])

  useEffect(() => {
    diorama?.setSky(sky)
  }, [diorama, sky])

  useEffect(() => {
    diorama?.setBond(bondLevel)
  }, [diorama, bondLevel])

  useEffect(() => {
    if (hops) diorama?.hop()
  }, [diorama, hops])

  useEffect(() => {
    if (cheers) diorama?.celebrate()
  }, [diorama, cheers])

  return (
    <>
      <div className="room" ref={container} />
      {failed && <p className="room-fallback">이 기기에서는 3D 캐릭터를 표시할 수 없어요.</p>}
      <button className="room-poke" type="button" onClick={() => onTap('assistant')}>
        비서에게 말 걸기
      </button>
    </>
  )
}
