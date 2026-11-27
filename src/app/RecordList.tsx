import { useCallback, useRef, useState, type ReactNode } from 'react'
import { anniversaries } from '../features/recall/anniversary'
import { relatedNotes } from '../features/recall/recall'
import { DIARY_HOUR, localDate, openTodos } from '../features/assistant/speech'
import { saveRecord, setDeleted } from '../features/records/recordStore'
import { nextOccurrences, REPEAT_LABEL, seriesId } from '../features/records/repeat'
import { toggleTodo } from '../features/records/todoStore'
import type { AssistantRecord, RecordData } from '../features/records/types'
import type { Records } from '../features/records/useRecords'
import type { AddKind } from './AddForm'
import { Calendar } from './Calendar'
import { ConfirmModal } from './ConfirmModal'
import { DiaryHistory } from './DiaryHistory'
import { formatDay, formatDiaryDate, formatDue } from './dates'

export type View = 'event' | 'todo' | 'diary' | 'note' | 'talk'

interface RecordListProps {
  view: Exclude<View, 'talk'>
  records: Records
  now: Date
  onDone: (title: string) => void
  /** 할 일을 밀어서 내일로 미뤘을 때. */
  onPostpone: (title: string) => void
  onEdit: (record: AssistantRecord<AddKind>) => void
  /** 달력에서 고른 날에 일정을 추가한다. */
  onAddOn: (day: string) => void
}

export function RecordList({ view, records, now, onDone, onPostpone, onEdit, onAddOn }: RecordListProps) {
  const [removing, setRemoving] = useState<AssistantRecord<'event'> | null>(null)
  const [readingPast, setReadingPast] = useState(false)
  const closePast = useCallback(() => setReadingPast(false), [])
  const [viewingCalendar, setViewingCalendar] = useState(false)
  const closeCalendar = useCallback(() => setViewingCalendar(false), [])
  if (records.error) return <p role="alert">{records.error}</p>
  if (!records.loaded) return null

  if (view === 'diary') {
    const today = localDate(now)
    const written = records.diaries.find(({ data }) => data.date === today)
    const past = records.diaries.filter(({ data }) => data.date < today)
    return (
      <>
        {/* 좁은 패널에서 일기를 한 화면에 담도록 지난 일기 버튼은 날짜 줄에 둔다. */}
        <header className="diary-head">
          <h2>{formatDiaryDate(today)}</h2>
          {past.length > 0 && (
            <button className="diary-past" type="button" onClick={() => setReadingPast(true)}>
              지난 일기 보기
            </button>
          )}
        </header>
        {written ? (
          <article className="diary">
            <p>{written.data.body}</p>
          </article>
        ) : (
          <Empty>밤 {DIARY_HOUR - 12}시가 지나면 오늘의 일기를 써둘게요.</Empty>
        )}
        {readingPast && <DiaryHistory diaries={past} onClose={closePast} />}
      </>
    )
  }

  if (view === 'todo') {
    if (!records.todos.length) return <Empty>할 일이 없어요. 아래에서 추가해 보세요.</Empty>
    const done = records.todos.filter(({ data }) => data.doneAt)
    const isToday = ({ data }: AssistantRecord<'todo'>) => localDate(new Date(data.doneAt!)) === localDate(now)
    const row = (todo: AssistantRecord<'todo'>) => (
      <TodoRow
        key={todo.id}
        todo={todo}
        now={now}
        onDone={onDone}
        onPostpone={onPostpone}
        onEdit={() => onEdit(todo)}
      />
    )
    const past = done.filter((todo) => !isToday(todo))
    return (
      <>
        <ul>{[...openTodos(records.todos), ...done.filter(isToday)].map(row)}</ul>
        {past.length > 0 && (
          <details className="past">
            <summary>지난 끝낸 일 {past.length}개</summary>
            <ul>{past.map(row)}</ul>
          </details>
        )}
      </>
    )
  }

  if (view === 'note') {
    if (!records.notes.length) return <Empty>아직 기억해 둔 게 없어요. 아래에서 추가해 보세요.</Empty>
    const coming = new Map(anniversaries(records.notes, now).map(({ note, days }) => [note.id, days]))
    return (
      <ul>
        {records.notes.map((note) => (
          <Row
            key={note.id}
            title={note.data.body}
            detail={[
              `${formatDay(note.createdAt, now)} 알려줌`,
              coming.has(note.id) && (coming.get(note.id) ? `${coming.get(note.id)}일 남음` : '오늘이에요'),
            ]
              .filter(Boolean)
              .join(' · ')}
            onEdit={() => onEdit(note)}
            onRemove={() => void setDeleted(note.id, true)}
          />
        ))}
      </ul>
    )
  }

  const layout = (
    <>
      <button className="open-calendar" type="button" onClick={() => setViewingCalendar(true)}>
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="4" y="5" width="16" height="15" rx="4" />
          <path d="M4 10h16M9 3v4M15 3v4" />
        </svg>
        달력으로 보기
      </button>
      {viewingCalendar && (
        <Calendar
          records={records}
          now={now}
          onClose={closeCalendar}
          onEdit={(event) => {
            setViewingCalendar(false)
            onEdit(event)
          }}
          onAdd={(day) => {
            setViewingCalendar(false)
            onAddOn(day)
          }}
        />
      )}
    </>
  )

  const upcoming = nextOccurrences(records.events, now).filter(
    ({ data }) => localDate(new Date(data.startsAt)) >= localDate(now),
  )
  if (!upcoming.length) {
    return (
      <>
        {layout}
        <Empty>잡힌 일정이 없어요. 아래에서 추가해 보세요.</Empty>
      </>
    )
  }
  return (
    <>
      {layout}
      <ul>
        {upcoming.map((event) => {
          const { data } = event
          const details = [
            `${formatDay(data.startsAt, now)} ${formatClock(data.startsAt)}`,
            data.place,
            data.repeat && REPEAT_LABEL[data.repeat.every],
            !data.remind && '알림 없음',
          ]
          return (
            <Row
              key={event.id}
              title={data.title}
              detail={details.filter(Boolean).join(' · ')}
              memories={relatedNotes(data.title, records.notes).map((note) => note.data.body)}
              onEdit={() => onEdit(event)}
              onRemove={() => (data.repeat ? setRemoving(event) : void setDeleted(event.id, true))}
            />
          )
        })}
      </ul>
      {removing && (
        <ConfirmModal
          title="반복되는 일정이에요"
          body={`${removing.data.title}, ${formatDay(removing.data.startsAt, now)} 것만 건너뛸까요, 앞으로도 모두 지울까요?`}
          confirmLabel="모두 지우기"
          other={{
            label: '이번만 건너뛰기',
            onClick: () => {
              const { data } = removing
              const skip = [...(data.skip ?? []), localDate(new Date(data.startsAt))]
              const master = seriesId(removing.id)
              void saveRecord('event', { ...data, startsAt: records.seriesStart(master), skip }, master)
              setRemoving(null)
            },
          }}
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            void setDeleted(seriesId(removing.id), true)
            setRemoving(null)
          }}
        />
      )}
    </>
  )
}

interface TodoRowProps {
  todo: AssistantRecord<'todo'>
  now: Date
  onDone: (title: string) => void
  onPostpone: (title: string) => void
  onEdit: () => void
}

function TodoRow({ todo: { id, data }, now, onDone, onPostpone, onEdit }: TodoRowProps) {
  async function toggle() {
    await toggleTodo(id)
    if (!data.doneAt) onDone(data.title)
  }

  async function postpone() {
    const tomorrow = new Date(now)
    tomorrow.setDate(now.getDate() + 1)
    await saveRecord('todo', { ...data, dueDate: localDate(tomorrow) }, id)
    onPostpone(data.title)
  }

  return (
    <Row
      swipe={{
        right: { label: data.doneAt ? '되돌리기' : '끝냄', run: toggle },
        left: data.doneAt ? undefined : { label: '내일로', run: postpone },
      }}
      title={data.title}
      detail={
        <>
          <label className={isLate(data, now) ? 'due late' : 'due'}>
            {data.dueDate ? formatDue(data.dueDate, now) : '날짜 정하기'}
            <input
              type="date"
              aria-label={`${data.title} 언제까지`}
              value={data.dueDate ?? ''}
              onClick={(event) => event.currentTarget.showPicker()}
              onChange={(event) => {
                const dueDate = event.target.value
                if (dueDate) void saveRecord('todo', { ...data, dueDate }, id)
              }}
            />
          </label>
          {data.repeat && !data.doneAt && ` · ${REPEAT_LABEL[data.repeat.every]}`}
        </>
      }
      done={Boolean(data.doneAt)}
      onEdit={onEdit}
      onRemove={() => void setDeleted(id, true)}
    >
      <button
        className="check"
        type="button"
        aria-label={`${data.title} ${data.doneAt ? '되돌리기' : '끝냄'}`}
        onClick={() => void toggle()}
      >
        <i>
          {data.doneAt && (
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M2.5 7.5l3 3 6-6.5" />
            </svg>
          )}
        </i>
      </button>
    </Row>
  )
}

interface SwipeAction {
  label: string
  run: () => Promise<void>
}

interface RowProps {
  title: string
  detail: ReactNode
  memories?: string[]
  done?: boolean
  children?: ReactNode
  /** 밀어서 하는 일. right는 오른쪽으로 밀 때. */
  swipe?: { right?: SwipeAction; left?: SwipeAction }
  onEdit: () => void
  onRemove: () => void
}

/** 이만큼 밀면 실행한다. */
const SWIPE_DISTANCE = 80

function Row({ title, detail, memories, done, children, swipe, onEdit, onRemove }: RowProps) {
  const [offset, setOffset] = useState(0)
  const [sliding, setSliding] = useState(false)
  // 놓는 순간에는 다시 그리기 전일 수 있어 마지막으로 민 거리를 따로 둔다.
  const start = useRef<{ x: number; y: number; sliding: boolean; offset: number } | null>(null)
  const swiped = useRef(false)

  function move(event: React.PointerEvent) {
    const from = start.current
    if (!from) return
    const x = event.clientX - from.x
    const y = event.clientY - from.y
    if (!from.sliding) {
      // 옆으로 확실히 밀 때만 잡고, 위아래로 움직이면 목록 스크롤에 맡긴다.
      if (Math.abs(y) > 10 && Math.abs(y) > Math.abs(x)) start.current = null
      if (Math.abs(x) < 10 || Math.abs(x) < Math.abs(y) * 1.5) return
      from.sliding = true
      setSliding(true)
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    const limit = SWIPE_DISTANCE * 1.4
    from.offset = Math.max(swipe?.left ? -limit : 0, Math.min(swipe?.right ? limit : 0, x))
    setOffset(from.offset)
  }

  function release() {
    const wasSliding = start.current?.sliding
    const moved = start.current?.offset ?? 0
    start.current = null
    setOffset(0)
    setSliding(false)
    if (!wasSliding) return
    // 밀고 놓을 때 생기는 클릭으로 고치기가 열리지 않게 한다.
    swiped.current = true
    setTimeout(() => (swiped.current = false))
    const action = moved >= SWIPE_DISTANCE ? swipe?.right : moved <= -SWIPE_DISTANCE ? swipe?.left : undefined
    if (action) void action.run().catch(console.error)
  }

  const content = (
    <>
      {children}
      <div>
        <button className="row-title" type="button" aria-label={`${title} 고치기`} onClick={onEdit}>
          {title}
        </button>
        <small>{detail}</small>
        {memories?.map((memory) => (
          <small className="memory" key={memory}>
            {memory}
          </small>
        ))}
      </div>
      <button className="remove" type="button" aria-label={`${title} 휴지통으로`} onClick={onRemove}>
        ×
      </button>
    </>
  )
  if (!swipe) return <li className={done ? 'done' : undefined}>{content}</li>

  const reach = Math.min(1, Math.abs(offset) / SWIPE_DISTANCE)
  return (
    <li className={['swipeable', done && 'done'].filter(Boolean).join(' ')}>
      {swipe.right && (
        <span className="swipe-hint right" aria-hidden="true" style={{ opacity: offset > 0 ? reach : 0 }}>
          {swipe.right.label}
        </span>
      )}
      {swipe.left && (
        <span className="swipe-hint left" aria-hidden="true" style={{ opacity: offset < 0 ? reach : 0 }}>
          {swipe.left.label}
        </span>
      )}
      <div
        className={sliding ? 'swipe-track sliding' : 'swipe-track'}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          start.current = { x: event.clientX, y: event.clientY, sliding: false, offset: 0 }
        }}
        onPointerMove={move}
        onPointerUp={release}
        onPointerCancel={release}
        onClickCapture={(event) => {
          if (swiped.current) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      >
        {content}
      </div>
    </li>
  )
}

function isLate({ doneAt, dueDate }: RecordData['todo'], now: Date) {
  return !doneAt && dueDate !== undefined && dueDate < localDate(now)
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

function formatClock(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
