import type { AssistantRecord } from '../records/types'

const LEVELS = [
  { from: 0, name: '처음 만난 사이', gift: '' },
  { from: 15, name: '알아가는 사이', gift: '머그컵' },
  { from: 50, name: '편한 사이', gift: '풍선' },
  { from: 120, name: '단짝', gift: '작은 새' },
  { from: 250, name: '가족 같은 사이', gift: '꽃 화관' },
]
const DAILY_LIMIT = 12
const DONE_POINTS = 2

export interface Bond {
  level: number
  name: string
  gift: string
  points: number
  /** 다음 단계까지 남은 점수. 마지막 단계면 0. */
  remaining: number
  /** 이번 단계에서 나아간 정도. 0~1. */
  progress: number
}

function dayOf(iso: string) {
  return new Date(iso).toDateString()
}

/** 맡긴 일과 끝낸 일로 쌓인다. 지운 기록도 함께한 일이라 줄어들지 않는다. */
export function bondOf(records: AssistantRecord[]): Bond {
  const daily = new Map<string, number>()
  const add = (iso: string, points: number) => {
    const day = dayOf(iso)
    daily.set(day, (daily.get(day) ?? 0) + points)
  }
  for (const record of records) {
    if (record.kind === 'setting' || record.kind === 'talk') continue
    add(record.createdAt, 1)
    const doneAt = record.kind === 'todo' ? record.data.doneAt : null
    if (doneAt) add(doneAt, DONE_POINTS)
  }
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
  }
}
