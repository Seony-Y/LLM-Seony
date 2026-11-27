import { useEffect, useRef, useState } from 'react'
import type { Scene } from '../assistant/speech'
import type { Sky } from '../online/weather'
import type { Diorama, RoomTarget } from './diorama'

interface RoomProps {
  scene: Scene
  sky: Sky
  /** 물건마다 방에 보일지. */
  gifts: boolean[]
  hops: number
  cheers: number
  /** 고른 기록. count가 바뀔 때마다 소품이 반응한다. */
  focus: { target: RoomTarget; count: number }
  onTap: (target: RoomTarget) => void
  /** 방의 물건을 눌렀을 때, 그 물건의 순서. */
  onGift: (index: number) => void
}

export function Room({ scene, sky, gifts, hops, cheers, focus, onTap, onGift }: RoomProps) {
  const container = useRef<HTMLDivElement>(null)
  const tapHandler = useRef(onTap)
  const giftHandler = useRef(onGift)
  const [diorama, setDiorama] = useState<Diorama | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    tapHandler.current = onTap
    giftHandler.current = onGift
  }, [onTap, onGift])

  useEffect(() => {
    let created: Diorama | null = null
    let cancelled = false
    import('./diorama')
      .then(({ createDiorama }) => {
        if (cancelled || !container.current) return
        created = createDiorama(
          container.current,
          (target) => tapHandler.current(target),
          (index) => giftHandler.current(index),
        )
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
    diorama?.setGifts(gifts)
  }, [diorama, gifts])

  useEffect(() => {
    if (hops) diorama?.hop()
  }, [diorama, hops])

  useEffect(() => {
    if (cheers) diorama?.celebrate()
  }, [diorama, cheers])

  useEffect(() => {
    diorama?.focus(focus.target, focus.count > 0)
  }, [diorama, focus])

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
