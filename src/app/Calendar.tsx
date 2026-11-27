import { useState } from 'react'
import { formatTime, localDate } from '../features/assistant/speech'
import { eventsBetween } from '../features/records/repeat'
import type { AssistantRecord } from '../features/records/types'
import type { Records } from '../features/records/useRecords'
import { formatDiaryDate } from './dates'

interface CalendarProps {
  records: Records
  now: Date
  /** 고른 날, YYYY-MM-DD. */
  day: string
  onDay: (day: string) => void
  onEdit: (record: AssistantRecord<'event'>) => void
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const monthName = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' })

/** 한 달의 일정, 할 일, 일기를 한눈에 보고, 고른 날의 것을 아래에 펼친다. */
export function Calendar({ records, now, day, onDay, onEdit }: CalendarProps) {
  const [month, setMonth] = useState(() => firstOf(new Date(`${day}T00:00`)))
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
  const today = localDate(now)

  const move = (offset: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + offset, 1))
  const pickedEvents = events.get(day) ?? []
  const pickedTodos = todos.get(day) ?? []
  const diary = diaries.get(day)

  return (
    <section className="calendar" aria-label="달력">
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
              onDay(today)
            }}
          >
            오늘
          </button>
        )}
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
                onDay(date)
                if (cell.getMonth() !== month.getMonth()) setMonth(firstOf(cell))
              }}
            >
              {cell.getDate()}
              <span className="marks" aria-hidden="true">
                {events.has(date) && <i className="event" />}
                {todos.has(date) && <i className="todo" />}
                {diaries.has(date) && <i className="diary-mark" />}
              </span>
            </button>
          )
        })}
      </div>

      <h3>{formatDiaryDate(day)}</h3>
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
    </section>
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
