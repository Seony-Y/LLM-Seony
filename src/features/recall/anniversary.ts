import type { AssistantRecord } from '../records/types'

/** 해마다 돌아오는 날이라고 볼 낱말. 음력은 날짜를 셀 수 없어 뺀다. */
const YEARLY_WORDS = /생일|생신|기념일|기일|제사|제삿날/
const MONTH_DAY = /(\d{1,2})\s*월\s*(\d{1,2})\s*일/

export interface Anniversary {
  note: AssistantRecord<'note'>
  /** 다음에 오는 그날 0시. 오늘이면 오늘. */
  next: Date
  /** 오늘부터 며칠 남았는지. */
  days: number
}

/** "엄마 생일은 3월 5일"처럼 해마다 챙길 날이 적힌 기억이면 그 월과 일. */
export function yearlyDate(body: string): { month: number; day: number } | null {
  if (!YEARLY_WORDS.test(body) || body.includes('음력')) return null
  const [, month, day] = body.match(MONTH_DAY) ?? []
  const value = { month: Number(month), day: Number(day) }
  // 2월 29일은 윤년이 아니어도 받는다.
  if (!(value.month >= 1 && value.month <= 12 && value.day >= 1 && value.day <= daysIn(2024, value.month))) return null
  return value
}

export function anniversaries(notes: AssistantRecord<'note'>[], now: Date): Anniversary[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return notes
    .flatMap((note) => {
      const date = yearlyDate(note.data.body)
      if (!date) return []
      let next = dateIn(today.getFullYear(), date)
      if (next < today) next = dateIn(today.getFullYear() + 1, date)
      const days = Math.round((next.getTime() - today.getTime()) / 86_400_000)
      return [{ note, next, days }]
    })
    .sort((left, right) => left.days - right.days)
}

/** 윤년이 아니면 2월 29일은 28일로 당긴다. */
function dateIn(year: number, { month, day }: { month: number; day: number }) {
  return new Date(year, month - 1, Math.min(day, daysIn(year, month)))
}

function daysIn(year: number, month: number) {
  return new Date(year, month, 0).getDate()
}
