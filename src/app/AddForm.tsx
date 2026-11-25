import { useState } from 'react'
import { localDate } from '../features/assistant/speech'
import { saveRecord } from '../features/records/recordStore'
import { formatInputTime, nextHour } from './dates'

export type AddKind = 'event' | 'todo' | 'note'

interface AddFormProps {
  kind: AddKind
  onAdded: (kind: AddKind) => void
}

const PLACEHOLDER = { event: '일정 추가', todo: '할 일 추가', note: '기억할 것 추가' }

/** 보고 있는 탭의 기록만 추가한다. */
export function AddForm({ kind, onAdded }: AddFormProps) {
  const [text, setText] = useState('')
  const [date, setDate] = useState(() => localDate(kind === 'event' ? nextHour() : new Date()))
  const [time, setTime] = useState(() => formatInputTime(nextHour()))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function add(submit: React.FormEvent) {
    submit.preventDefault()
    const value = text.trim()
    if (!value) return setError('내용을 적어주세요.')
    if (kind !== 'note' && !date) return setError('날짜를 골라주세요.')
    const startsAt = new Date(`${date}T${time}`)
    if (kind === 'event' && !(startsAt > new Date())) return setError('앞으로 올 시간을 골라주세요.')

    setBusy(true)
    try {
      if (kind === 'event') {
        await saveRecord('event', { title: value, note: '', startsAt: startsAt.toISOString(), remind: true })
      } else if (kind === 'todo') {
        await saveRecord('todo', { title: value, doneAt: null, dueDate: date })
      } else {
        await saveRecord('note', { body: value })
      }
      setText('')
      setError('')
      onAdded(kind)
    } catch (cause) {
      console.error(cause)
      setError('저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add" onSubmit={add}>
      {error && <p role="alert">{error}</p>}
      <div className="prompt">
        <input
          aria-label={PLACEHOLDER[kind]}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={2000}
          placeholder={PLACEHOLDER[kind]}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" aria-label="추가" disabled={busy}>
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
      {kind !== 'note' && (
        <div className="when">
          <input
            aria-label={kind === 'event' ? '날짜' : '언제까지'}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          {kind === 'event' && (
            <input aria-label="시간" type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          )}
        </div>
      )}
    </form>
  )
}
