import { useState } from 'react'
import { localDate } from '../features/assistant/speech'
import type { ParsedInput } from '../features/assistant/parseInput'

export type Draft = Exclude<ParsedInput, { type: 'question' }>

interface ConfirmCardProps {
  draft: Draft
  onConfirm: (draft: Draft) => Promise<void>
  onCancel: () => void
}

const LABEL = { event: '일정', todo: '할 일', note: '기억' }

export function ConfirmCard({ draft, onConfirm, onCancel }: ConfirmCardProps) {
  const [type, setType] = useState(draft.type)
  const [text, setText] = useState(draftText(draft))
  const [startsAt, setStartsAt] = useState(
    toInputValue(draft.type === 'event' ? draft.startsAt : nextHour()),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isRecord = type === 'event' || type === 'todo' || type === 'note'

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value && draft.type !== 'message') return setError('내용을 적어주세요.')
    const date = new Date(startsAt)
    if (type === 'event' && !(date > new Date())) return setError('앞으로 올 시간을 골라주세요.')

    setBusy(true)
    setError('')
    try {
      await onConfirm(build(draft, type, value, date))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '처리하지 못했어요.')
      setBusy(false)
    }
  }

  return (
    <form className="card" onSubmit={confirm}>
      {isRecord ? (
        <div className="kinds" role="group" aria-label="종류">
          {(['event', 'todo', 'note'] as const).map((kind) => (
            <button key={kind} type="button" aria-pressed={type === kind} onClick={() => setType(kind)}>
              {LABEL[kind]}
            </button>
          ))}
        </div>
      ) : (
        <small>{draft.type === 'message' ? `${draft.recipient}에게 보낼 문자` : '전화 걸 사람'}</small>
      )}
      <input
        aria-label="내용"
        maxLength={2000}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {type === 'event' && (
        <input
          aria-label="날짜와 시간"
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
        />
      )}
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>
          {{ message: '문자 앱 열기', call: '전화 화면 열기' }[type as string] ?? '넣기'}
        </button>
        <button type="button" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}

function draftText(draft: Draft) {
  if (draft.type === 'message') return draft.message
  if (draft.type === 'call') return draft.recipient
  return draft.type === 'note' ? draft.body : draft.title
}

function build(draft: Draft, type: Draft['type'], value: string, startsAt: Date): Draft {
  if (draft.type === 'message') return { ...draft, message: value }
  if (draft.type === 'call') return { ...draft, recipient: value }
  if (type === 'event') return { type, title: value, startsAt }
  if (type === 'todo') return { type, title: value }
  return { type: 'note', body: value }
}

function nextHour() {
  const date = new Date()
  date.setHours(date.getHours() + 1, 0, 0, 0)
  return date
}

function toInputValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${localDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
