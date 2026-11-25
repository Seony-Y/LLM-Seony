import { useState } from 'react'
import { localDate } from '../features/assistant/speech'
import type { ParsedInput } from '../features/assistant/parseInput'
import { REPEAT_LABEL, repeatOf } from '../features/records/repeat'
import type { Repeat } from '../features/records/types'
import { formatInputTime, nextHour } from './dates'

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
  const [dueDate, setDueDate] = useState(
    (draft.type === 'todo' && draft.dueDate) || localDate(new Date()),
  )
  const [every, setEvery] = useState<Repeat['every'] | ''>(
    draft.type === 'event' || draft.type === 'todo' ? (draft.repeat?.every ?? '') : '',
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const isRecord = type === 'event' || type === 'todo' || type === 'note'

  async function confirm(event: React.FormEvent) {
    event.preventDefault()
    const value = text.trim()
    const emptyAllowed = draft.type === 'message' && draft.channel === 'sms'
    if (!value && !emptyAllowed) return setError('내용을 적어주세요.')
    const date = new Date(startsAt)
    if (type === 'event' && !(date > new Date())) return setError('앞으로 올 시간을 골라주세요.')
    if (type === 'todo' && !dueDate) return setError('날짜를 골라주세요.')

    setBusy(true)
    setError('')
    try {
      await onConfirm(build(draft, type, value, date, dueDate, every))
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
        <small>{contactLabel(draft)}</small>
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
      {type === 'todo' && (
        <input
          aria-label="언제까지"
          type="date"
          value={dueDate}
          onChange={(event) => setDueDate(event.target.value)}
        />
      )}
      {(type === 'event' || type === 'todo') && (
        <select
          aria-label="반복"
          value={every}
          onChange={(event) => setEvery(event.target.value as Repeat['every'] | '')}
        >
          <option value="">반복 안 함</option>
          {Object.entries(REPEAT_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>
          {confirmLabel(draft, isRecord)}
        </button>
        <button type="button" onClick={onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}

function contactLabel(draft: Draft) {
  if (draft.type !== 'message') return '전화 걸 사람'
  return draft.channel === 'kakao'
    ? `${draft.recipient}에게 보낼 카톡, 받는 사람은 카톡에서 골라요`
    : `${draft.recipient}에게 보낼 문자`
}

function confirmLabel(draft: Draft, isRecord: boolean) {
  if (isRecord) return '넣기'
  if (draft.type !== 'message') return '전화 화면 열기'
  return draft.channel === 'kakao' ? '카톡 열기' : '문자 앱 열기'
}

function draftText(draft: Draft) {
  if (draft.type === 'message') return draft.message
  if (draft.type === 'call') return draft.recipient
  return draft.type === 'note' ? draft.body : draft.title
}

function build(
  draft: Draft,
  type: Draft['type'],
  value: string,
  startsAt: Date,
  dueDate: string,
  every: Repeat['every'] | '',
): Draft {
  if (draft.type === 'message') return { ...draft, message: value }
  if (draft.type === 'call') return { ...draft, recipient: value }
  if (type === 'event') return { type, title: value, startsAt, repeat: repeatOf(every, startsAt) }
  if (type === 'todo') {
    return { type, title: value, dueDate, repeat: repeatOf(every, new Date(`${dueDate}T00:00`)) }
  }
  return { type: 'note', body: value }
}

function toInputValue(date: Date) {
  return `${localDate(date)}T${formatInputTime(date)}`
}
