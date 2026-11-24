import type { ReactNode } from 'react'
import { relatedNotes } from '../features/recall/recall'
import { DIARY_HOUR, localDate } from '../features/assistant/speech'
import { saveRecord, setDeleted } from '../features/records/recordStore'
import type { Records } from '../features/records/useRecords'
import { formatDay } from './dates'

export type View = 'event' | 'todo' | 'diary' | 'note' | 'talk'

interface RecordListProps {
  view: Exclude<View, 'talk'>
  records: Records
  now: Date
  onDone: (title: string) => void
}

export function RecordList({ view, records, now, onDone }: RecordListProps) {
  if (records.error) return <p role="alert">{records.error}</p>
  if (!records.loaded) return null

  if (view === 'diary') {
    if (!records.diaries.length) return <Empty>밤 {DIARY_HOUR - 12}시가 지나면 그날의 일기를 써둘게요.</Empty>
    return records.diaries.slice(0, 30).map(({ id, data }) => (
      <article className="diary" key={id}>
        <h2>{data.date}</h2>
        <p>{data.body}</p>
      </article>
    ))
  }

  if (view === 'todo') {
    if (!records.todos.length) return <Empty>할 일이 없어요. "영양제 먹기"처럼 적어보세요.</Empty>
    const todos = [...records.todos].sort(
      (left, right) => Number(Boolean(left.data.doneAt)) - Number(Boolean(right.data.doneAt)),
    )
    return (
      <ul>
        {todos.map(({ id, data, createdAt }) => (
          <Row
            key={id}
            id={id}
            title={data.title}
            detail={`${formatDay(createdAt, now)} 맡김`}
            done={Boolean(data.doneAt)}
          >
            <button
              className="check"
              type="button"
              aria-label={`${data.title} ${data.doneAt ? '되돌리기' : '끝냄'}`}
              onClick={async () => {
                const doneAt = data.doneAt ? null : new Date().toISOString()
                await saveRecord('todo', { ...data, doneAt }, id)
                if (doneAt) onDone(data.title)
              }}
            >
              <i />
            </button>
          </Row>
        ))}
      </ul>
    )
  }

  if (view === 'note') {
    if (!records.notes.length) return <Empty>아직 기억해 둔 게 없어요. 아무거나 알려주세요.</Empty>
    return (
      <ul>
        {records.notes.map(({ id, data, createdAt }) => (
          <Row key={id} id={id} title={data.body} detail={`${formatDay(createdAt, now)} 알려줌`} />
        ))}
      </ul>
    )
  }

  const upcoming = records.events.filter(({ data }) => localDate(new Date(data.startsAt)) >= localDate(now))
  if (!upcoming.length) return <Empty>잡힌 일정이 없어요. "내일 3시 업무 회의"처럼 적어보세요.</Empty>
  return (
    <ul>
      {upcoming.map(({ id, data }) => (
        <Row
          key={id}
          id={id}
          title={data.title}
          detail={`${formatDay(data.startsAt, now)} ${formatClock(data.startsAt)}${data.remind ? '' : ' · 알림 없음'}`}
          memories={relatedNotes(data.title, records.notes).map((note) => note.data.body)}
        />
      ))}
    </ul>
  )
}

interface RowProps {
  id: string
  title: string
  detail: string
  memories?: string[]
  done?: boolean
  children?: ReactNode
}

function Row({ id, title, detail, memories, done, children }: RowProps) {
  return (
    <li className={done ? 'done' : undefined}>
      {children}
      <div>
        {title}
        <small>{detail}</small>
        {memories?.map((memory) => (
          <small className="memory" key={memory}>
            {memory}
          </small>
        ))}
      </div>
      <button
        className="remove"
        type="button"
        aria-label={`${title} 휴지통으로`}
        onClick={() => setDeleted(id, true)}
      >
        ×
      </button>
    </li>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

function formatClock(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
