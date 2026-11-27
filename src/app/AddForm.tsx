import { useState } from 'react'
import { localDate } from '../features/assistant/speech'
import { requestWeatherPermission } from '../features/online/weather'
import { saveRecord } from '../features/records/recordStore'
import { REPEAT_LABEL, repeatOf, seriesId } from '../features/records/repeat'
import type { AssistantRecord, Repeat } from '../features/records/types'
import { formatInputTime, nextHour } from './dates'

export type AddKind = 'event' | 'todo' | 'note'

interface AddFormProps {
  kind: AddKind
  /** 고치는 기록. 없으면 새로 추가한다. */
  editing?: AssistantRecord<AddKind>
  onSaved: (kind: AddKind) => void
  onCancel: () => void
}

const LABEL = { event: '일정', todo: '할 일', note: '기억할 것' }

/** 보고 있는 탭의 기록만 추가하거나 고친다. */
export function AddForm({ kind, editing, onSaved, onCancel }: AddFormProps) {
  const first = initial(kind, editing)
  const [text, setText] = useState(first.text)
  const [date, setDate] = useState(first.date)
  const [time, setTime] = useState(first.time)
  const [every, setEvery] = useState<Repeat['every'] | ''>(first.every)
  const [place, setPlace] = useState(first.place)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(submit: React.FormEvent) {
    submit.preventDefault()
    const value = text.trim()
    if (!value) return setError('내용을 적어주세요.')
    if (kind !== 'note' && !date) return setError('날짜를 골라주세요.')
    const startsAt = new Date(`${date}T${time}`)
    const moved = date !== first.date || time !== first.time || !editing
    if (kind === 'event' && moved && !(startsAt > new Date())) return setError('앞으로 올 시간을 골라주세요.')

    setBusy(true)
    try {
      const repeat = repeatOf(every, startsAt)
      if (kind === 'event') {
        const base = editing?.kind === 'event' ? editing.data : { note: '', remind: true }
        const where = place.trim() || undefined
        const data = { ...base, title: value, startsAt: startsAt.toISOString(), repeat, place: where }
        await saveRecord('event', data, editing && seriesId(editing.id))
        // 출발 알림은 지금 자리를 알아야 한다.
        if (where) void requestWeatherPermission()
      } else if (kind === 'todo') {
        const base = editing?.kind === 'todo' ? editing.data : { doneAt: null }
        const due = repeatOf(every, new Date(`${date}T00:00`))
        await saveRecord('todo', { ...base, title: value, dueDate: date, repeat: due }, editing?.id)
      } else {
        await saveRecord('note', { body: value }, editing?.id)
      }
      setText('')
      setEvery('')
      setPlace('')
      setError('')
      onSaved(kind)
    } catch (cause) {
      console.error(cause)
      setError('저장하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="add" onSubmit={save}>
      {editing && (
        <p className="editing">
          {LABEL[kind]} 고치는 중{kind === 'event' && first.every && ' · 반복 전체가 바뀌어요'}
          <button type="button" onClick={onCancel}>
            취소
          </button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="prompt">
        <input
          aria-label={editing ? `${LABEL[kind]} 내용` : `${LABEL[kind]} 추가`}
          autoComplete="off"
          enterKeyHint="done"
          maxLength={2000}
          placeholder={`${LABEL[kind]} 추가`}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        {kind !== 'note' && (
          <label className="repeat">
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path d="M5 12V9a3 3 0 013-3h9M14 3l3 3-3 3M19 12v3a3 3 0 01-3 3H7M10 21l-3-3 3-3" />
            </svg>
            {every && REPEAT_LABEL[every]}
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
          </label>
        )}
        <button type="submit" aria-label={editing ? '저장' : '추가'} disabled={busy}>
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path d={editing ? 'M6 12.5l4 4 8-9' : 'M12 5v14M5 12h14'} />
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
          {kind === 'event' && (
            <input
              className="place"
              aria-label="장소"
              autoComplete="off"
              enterKeyHint="done"
              maxLength={100}
              placeholder="장소 (출발 알림)"
              value={place}
              onChange={(event) => setPlace(event.target.value)}
            />
          )}
        </div>
      )}
    </form>
  )
}

interface Fields {
  text: string
  date: string
  time: string
  every: Repeat['every'] | ''
  place: string
}

function initial(kind: AddKind, editing?: AssistantRecord<AddKind>): Fields {
  const base: Fields = {
    text: '',
    date: localDate(kind === 'event' ? nextHour() : new Date()),
    time: formatInputTime(nextHour()),
    every: '',
    place: '',
  }
  if (!editing) return base
  if (editing.kind === 'note') return { ...base, text: editing.data.body }
  const every = editing.data.repeat?.every ?? ''
  if (editing.kind === 'todo') {
    return { ...base, text: editing.data.title, date: editing.data.dueDate ?? base.date, every }
  }
  const at = new Date(editing.data.startsAt)
  return { text: editing.data.title, date: localDate(at), time: formatInputTime(at), every, place: editing.data.place ?? '' }
}
