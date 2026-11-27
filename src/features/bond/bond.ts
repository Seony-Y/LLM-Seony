import type { AssistantRecord } from '../records/types'

/** giftId는 방의 물건 순서와 같고, 설정에 숨긴 물건으로 저장된다. */
const LEVELS = [
  { from: 0, name: '처음 만난 사이', gift: '', giftId: '', icon: '' },
  { from: 15, name: '알아가는 사이', gift: '머그컵', giftId: 'mug', icon: '☕' },
  { from: 50, name: '편한 사이', gift: '풍선', giftId: 'balloon', icon: '🎈' },
  { from: 120, name: '단짝', gift: '작은 새', giftId: 'bird', icon: '🐦' },
  { from: 250, name: '가족 같은 사이', gift: '꽃 화관', giftId: 'crown', icon: '🌸' },
]

/** 단계마다 하나씩 생기는 방의 물건. */
export const GIFTS = LEVELS.slice(1).map(({ from, name, gift, giftId, icon }) => ({
  id: giftId,
  name: gift,
  icon,
  from,
  levelName: name,
}))

/** 방에 보일 물건. 얻었고 숨기지 않은 것만. */
export function shownGifts(level: number, hidden: string[] = []): boolean[] {
  return GIFTS.map(({ id }, index) => level > index && !hidden.includes(id))
}
const DAILY_LIMIT = 12
const DONE_POINTS = 2
/** 하루에 한 번 앱을 열면 받는 출석 점수. */
const VISIT_POINTS = 1

export interface Bond {
  level: number
  name: string
  gift: string
  points: number
  /** 다음 단계까지 남은 점수. 마지막 단계면 0. */
  remaining: number
  /** 이번 단계에서 나아간 정도. 0~1. */
  progress: number
  /** 출석한 날 수. */
  visits: number
}

function dayOf(iso: string) {
  return new Date(iso).toDateString()
}

/** 맡긴 일, 끝낸 일, 출석으로 쌓인다. 지운 기록도 함께한 일이라 줄어들지 않는다. */
export function bondOf(records: AssistantRecord[]): Bond {
  const daily = new Map<string, number>()
  const add = (iso: string, points: number) => {
    const day = dayOf(iso)
    daily.set(day, (daily.get(day) ?? 0) + points)
  }
  const visits = new Set<string>()
  for (const record of records) {
    if (record.kind === 'visit') visits.add(record.data.date)
    if (record.kind === 'setting') for (const date of record.data.visits ?? []) visits.add(date)
    if (record.kind === 'setting' || record.kind === 'talk' || record.kind === 'visit') continue
    add(record.createdAt, 1)
    const doneAt = record.kind === 'todo' ? record.data.doneAt : null
    if (doneAt) add(doneAt, DONE_POINTS)
  }
  for (const date of visits) add(`${date}T12:00`, VISIT_POINTS)
  const points = [...daily.values()].reduce((sum, value) => sum + Math.min(value, DAILY_LIMIT), 0)

  const level = LEVELS.findLastIndex(({ from }) => points >= from)
  const { from, name, gift } = LEVELS[level]
  const next = LEVELS.at(level + 1)
  return {
    level,
    name,
    gift,
    points,
    remaining: next ? next.from - points : 0,
    progress: next ? (points - from) / (next.from - from) : 1,
    visits: visits.size,
  }
}
