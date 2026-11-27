import { useEffect, useRef, useState } from 'react'
import type { AssistantRecord } from '../features/records/types'
import { formatDiaryDate } from './dates'

interface DiaryHistoryProps {
  /** 지난 일기, 최근 것부터. */
  diaries: AssistantRecord<'diary'>[]
  onClose: () => void
}

/** 지난 일기를 하루씩 넘겨 본다. */
export function DiaryHistory({ diaries, onClose }: DiaryHistoryProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [index, setIndex] = useState(0)
  const { data } = diaries[Math.min(index, diaries.length - 1)]

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    // 안드로이드의 뒤로 가기로 일기장만 닫히게 한다.
    history.pushState({ diary: true }, '')
    addEventListener('popstate', onClose)
    return () => {
      removeEventListener('popstate', onClose)
      element.close()
      if ((history.state as { diary?: boolean } | null)?.diary) history.back()
    }
  }, [onClose])

  return (
    <dialog
      className="diary-history"
      ref={dialog}
      aria-label="지난 일기"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div>
        <header>
          <button
            type="button"
            aria-label="전날 일기"
            disabled={index >= diaries.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            ‹
          </button>
          <select aria-label="날짜 고르기" value={index} onChange={(event) => setIndex(Number(event.target.value))}>
            {diaries.map(({ id, data: { date } }, at) => (
              <option key={id} value={at}>
                {formatDiaryDate(date)}
              </option>
            ))}
          </select>
          <button type="button" aria-label="다음 날 일기" disabled={index === 0} onClick={() => setIndex(index - 1)}>
            ›
          </button>
          <button className="close" type="button" aria-label="일기장 닫기" onClick={onClose}>
            ×
          </button>
        </header>
        <article className="diary">
          <p>{data.body}</p>
        </article>
      </div>
    </dialog>
  )
}
