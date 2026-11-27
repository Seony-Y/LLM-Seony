import { useEffect, useRef, useState } from 'react'
import { formatTime, localDate } from '../features/assistant/speech'
import { eventsBetween } from '../features/records/repeat'
import type { AssistantRecord } from '../features/records/types'
import type { Records } from '../features/records/useRecords'
import { formatDiaryDate } from './dates'

interface CalendarProps {
  records: Records
  now: Date
  onEdit: (record: AssistantRecord<'event'>) => void
  /** 고른 날에 일정을 추가한다. day는 YYYY-MM-DD. */
  onAdd: (day: string) => void
  onClose: () => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const monthName = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' })

/** 한 달의 일정, 할 일, 일기를 한눈에 보고, 고른 날의 것을 아래에 펼친다. 패널은 좁아 창으로 띄운다. */
export function Calendar({ records, now, onEdit, onAdd, onClose }: CalendarProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const today = localDate(now)
  const [day, setDay] = useState(today)
  const [month, setMonth] = useState(() => firstOf(now))

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    element.showModal()
    // 안드로이드의 뒤로 가기로 달력만 닫히게 한다.
    const opened = () => (history.state as { calendar?: boolean } | null)?.calendar
    if (!opened()) history.pushState({ calendar: true }, '')
    addEventListener('popstate', onClose)
    return () => {
      removeEventListener('popstate', onClose)
      element.close()
      // 개발 모드처럼 바로 다시 열리면 기록을 되돌리지 않는다. 그 사이 다시 붙었는지 보려고 나중 값을 읽는다.
      // oxlint-disable-next-line react-hooks/exhaustive-deps
      setTimeout(() => !dialog.current && opened() && history.back())
    }
  }, [onClose])

  const start = new Date(month)
  start.setDate(1 - month.getDay())
  const end = new Date(month.getFullYear(), month.getMonth() + 1, 1)
  end.setDate(end.getDate() + ((7 - end.getDay()) % 7))
  const cells: Date[] = []
  for (const at = new Date(start); at < end; at.setDate(at.getDate() + 1)) cells.push(new Date(at))

  const events = group(eventsBetween(records.storedEvents, start, end), ({ data }) => localDate(new Date(data.startsAt)))
  const todos = group(
    records.todos.filter(({ data }) => data.dueDate),
    ({ data }) => data.dueDate!,
  )
  const diaries = new Map(records.diaries.map((diary) => [diary.data.date, diary]))

  const move = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1))
  const pickedEvents = events.get(day) ?? []
  const pickedTodos = todos.get(day) ?? []
  const diary = diaries.get(day)

  return (
    <dialog
      className="calendar"
      ref={dialog}
      aria-label="달력"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div>
        <header>
          <button type="button" aria-label="지난달" onClick={() => move(-1)}>
            ‹
          </button>
          <h2>{monthName.format(month)}</h2>
          <button type="button" aria-label="다음 달" onClick={() => move(1)}>
            ›
          </button>
          {(month.getMonth() !== now.getMonth() || month.getFullYear() !== now.getFullYear() || day !== today) && (
            <button
              className="today"
              type="button"
              onClick={() => {
                setMonth(firstOf(now))
                setDay(today)
              }}
            >
              오늘
            </button>
          )}
          <button className="close" type="button" aria-label="달력 닫기" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="calendar-grid">
          {WEEKDAYS.map((name) => (
            <span key={name} className="weekday" aria-hidden="true">
              {name}
            </span>
          ))}
          {cells.map((cell) => {
            const date = localDate(cell)
            const counts = [
              events.get(date)?.length && `일정 ${events.get(date)!.length}개`,
              todos.get(date)?.length && `할 일 ${todos.get(date)!.length}개`,
              diaries.has(date) && '일기',
            ].filter(Boolean)
            return (
              <button
                key={date}
                type="button"
                className={[
                  cell.getMonth() !== month.getMonth() && 'outside',
                  date === today && 'is-today',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-label={[`${cell.getMonth() + 1}월 ${cell.getDate()}일`, ...counts].join(', ')}
                aria-pressed={date === day}
                onClick={() => {
                  setDay(date)
                  if (cell.getMonth() !== month.getMonth()) setMonth(firstOf(cell))
                }}
              >
                <span className="day-number">{cell.getDate()}</span>
                <span className="marks" aria-hidden="true">
                  {events.has(date) && <i className="event" />}
                  {todos.has(date) && <i className="todo" />}
                  {diaries.has(date) && <i className="diary-mark" />}
                </span>
              </button>
            )
          })}
      </div>

      <h3>
        {formatDiaryDate(day)}
        {day >= today && (
          <button type="button" onClick={() => onAdd(day)}>
            이날 일정 추가
          </button>
        )}
      </h3>
      {!pickedEvents.length && !pickedTodos.length && !diary && <p className="empty">이날은 비어 있어요.</p>}
      {(pickedEvents.length > 0 || pickedTodos.length > 0) && (
        <ul className="calendar-day">
          {pickedEvents.map((event) => (
            <li key={event.id}>
              <button type="button" aria-label={`${event.data.title} 고치기`} onClick={() => onEdit(event)}>
                <time>{formatTime(new Date(event.data.startsAt))}</time>
                {event.data.title}
              </button>
            </li>
          ))}
          {pickedTodos.map((todo) => (
            <li key={todo.id} className={todo.data.doneAt ? 'done' : undefined}>
              <span>
                <time>할 일</time>
                {todo.data.title}
              </span>
            </li>
          ))}
        </ul>
      )}
      {diary && (
        <article className="diary">
          <p>{diary.data.body}</p>
        </article>
      )}
      </div>
    </dialog>
  )
}

function firstOf(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function group<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item])
  return groups
}
