import { useEffect } from 'react'

/** 이보다 낮으면(키보드가 올라온 때 등) 방을 접고 글을 쓸 자리를 남긴다. */
const COMPACT_HEIGHT = 560

/** 키보드를 뺀 실제 보이는 높이에 화면을 맞춘다. */
export function useViewport() {
  useEffect(() => {
    const viewport = window.visualViewport
    const root = document.documentElement
    const fit = () => {
      const height = viewport?.height ?? innerHeight
      root.style.setProperty('--viewport', `${height}px`)
      root.toggleAttribute('data-compact', height < COMPACT_HEIGHT)
      // 입력칸을 보이려고 브라우저가 밀어 올린 화면을 되돌린다.
      scrollTo(0, 0)
    }
    fit()
    viewport?.addEventListener('resize', fit)
    addEventListener('resize', fit)
    return () => {
      viewport?.removeEventListener('resize', fit)
      removeEventListener('resize', fit)
    }
  }, [])
}
