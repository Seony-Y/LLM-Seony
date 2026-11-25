import { openTodos } from '../assistant/speech'
import { nextOccurrences } from '../records/repeat'
import type { AssistantRecord } from '../records/types'
import { askedWords, words } from './words'

export interface Recalled {
  id: string
  kind: 'event' | 'todo' | 'note'
  text: string
  /** 일정은 시작 시각, 할 일은 할 날, 나머지는 맡긴 시각. */
  at: string
  /** at이 할 날이다. */
  due?: boolean
}

export interface RecallSource {
  now: Date
  events: AssistantRecord<'event'>[]
  todos: AssistantRecord<'todo'>[]
  notes: AssistantRecord<'note'>[]
}

const LIMIT = 5
/** 물은 낱말을 이만큼은 담고 있어야 하고, 가장 잘 맞는 것과도 너무 벌어지면 뺀다. */
const MIN_SCORE = 0.34
const NEAR_BEST = 0.6
/** 무엇을 찾는지가 아니라 어느 목록인지 말하는 낱말. */
const LIST_WORDS = /^(?:일정|약속|스케줄|할|할일|일|남은|남았|남|있|오늘|어제|그제|내일|모레|이번|지난|다음|주|이번주|지난주|다음주)$/

/** 저장된 기록에서 답을 찾는다. 시킨 적 없는 말은 지어내지 않는다. */
export function recall(question: string, source: RecallSource): Recalled[] {
  const asked = askedWords(question)
  const range = rangeOf(question, source.now)
  const keywords = asked.filter((word) => !LIST_WORDS.test(word))

  if (keywords.length === 0) {
    if (/할\s*일/.test(question)) {
      return openTodos(source.todos)
        .map(fromTodo)
        .filter(({ at, due }) => !range || !due || (Date.parse(at) >= range.from && Date.parse(at) < range.to))
        .slice(0, LIMIT)
    }
    if (range || /일정|약속|스케줄/.test(question)) {
      const from = range?.from ?? source.now.getTime()
      const to = range?.to ?? Infinity
      return (range ? source.events : nextOccurrences(source.events, source.now))
        .map(fromEvent)
        .filter(({ at }) => Date.parse(at) >= from && Date.parse(at) < to)
        .slice(0, LIMIT)
    }
    return []
  }

  // "고양이 이름"을 물었는데 이름이라는 말만 겹치는 것을 답으로 보지 않는다.
  const subjects = keywords.filter((word) => !ATTRIBUTES.test(word))
  const total = keywords.reduce((sum, word) => sum + word.length, 0)
  const scored = [
    ...source.notes.map(fromNote),
    ...nextOccurrences(source.events, source.now).map(fromEvent),
    ...source.todos.map(fromTodo),
  ]
    .map((item) => {
      const matched = matchedLength(keywords, item.text)
      const at = Date.parse(item.at)
      const inRange = range !== null && at >= range.from && at < range.to
      const aboutSubject = subjects.length === 0 || matchedLength(subjects, item.text) > 0
      return { item, score: aboutSubject ? matched / total : 0, rank: matched / total + (inRange ? 0.2 : 0) }
    })
    .filter(({ score }) => score >= MIN_SCORE)
    .sort((left, right) => right.rank - left.rank || right.item.at.localeCompare(left.item.at))
  const best = scored[0]?.rank ?? 0
  return scored
    .filter(({ rank }) => rank >= best * NEAR_BEST)
    .slice(0, LIMIT)
    .map(({ item }) => item)
}

function matchedLength(keywords: string[], text: string) {
  const compact = text.toLowerCase().replace(/\s+/g, '')
  const own = words(text)
  return keywords.reduce((sum, word) => {
    // 한 글자는 "딸"이 "딸기"에 걸리지 않게 낱말이 같을 때만 본다.
    const matched = word.length === 1 ? own.includes(word) : compact.includes(word)
    return matched ? sum + word.length : sum
  }, 0)
}

const ATTRIBUTES = /^(?:이름|생일|번호|전화번호|주소|위치|사이즈|나이|취향|시간|날짜)$/
/** 여러 일정에 두루 쓰여 사람이나 장소를 가리키지 못하는 낱말. */
const COMMON_WORDS = new Set(
  '회의 업무 미팅 일정 약속 예약 저녁 점심 아침 식사 모임 준비 보고 확인 방문 참석 출발 도착 오전 오후 오늘 내일 하기 먹기 가기 만나기'.split(' '),
)

/** 일정에 나온 사람이나 장소에 대해 알고 있는 것. */
export function relatedNotes(
  title: string,
  notes: AssistantRecord<'note'>[],
): AssistantRecord<'note'>[] {
  const keywords = words(title).filter((word) => word.length >= 2 && !COMMON_WORDS.has(word))
  if (!keywords.length) return []
  return notes
    .map((note) => ({ note, matched: matchedLength(keywords, note.data.body) }))
    .filter(({ matched }) => matched > 0)
    .sort((left, right) => right.matched - left.matched || right.note.createdAt.localeCompare(left.note.createdAt))
    .slice(0, 2)
    .map(({ note }) => note)
}

function rangeOf(text: string, now: Date): { from: number; to: number } | null {
  const days = (from: number, count: number) => {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() + from)
    const end = new Date(start)
    end.setDate(end.getDate() + count)
    return { from: start.getTime(), to: end.getTime() }
  }
  const week = text.match(/(이번|지난|저번|다음)\s*주/)
  if (week) {
    const monday = -((now.getDay() + 6) % 7)
    return days(monday + { 이번: 0, 지난: -7, 저번: -7, 다음: 7 }[week[1]]!, 7)
  }
  const day = text.match(/오늘|어제|그제|그저께|내일|모레/)
  if (!day) return null
  return days({ 오늘: 0, 어제: -1, 그제: -2, 그저께: -2, 내일: 1, 모레: 2 }[day[0]]!, 1)
}

function fromNote({ id, data, createdAt }: AssistantRecord<'note'>): Recalled {
  return { id, kind: 'note', text: data.body, at: createdAt }
}

function fromEvent({ id, data }: AssistantRecord<'event'>): Recalled {
  return { id, kind: 'event', text: data.title, at: data.startsAt }
}

function fromTodo({ id, data, createdAt }: AssistantRecord<'todo'>): Recalled {
  const due = data.dueDate && new Date(`${data.dueDate}T00:00`).toISOString()
  return { id, kind: 'todo', text: data.title, at: due || createdAt, due: Boolean(due) }
}
