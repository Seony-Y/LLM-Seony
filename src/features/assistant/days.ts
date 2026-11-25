import { localDate } from './speech'

export const WEEKDAYS = '월화수목금토일'
export const DAY_OFFSET: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }

/** "내일", "금요일까지", "12월 5일"을 앞으로 올 날로 읽는다. */
export function findDay(text: string, now: Date): { matched: string; date: Date } | null {
  const date = text.match(/(\d{1,2})월\s*(\d{1,2})일(?:까지|에)?/)
  const relative = text.match(/(?<![가-힣])(오늘|내일|모레|글피)(?:까지|에|은|엔|도|의)?(?![가-힣])/)
  const weekday = text.match(/(?:(이번|다음)\s*주\s*)?([월화수목금토일])요일(?:까지|에)?/)
  const day = new Date(now)
  if (date) {
    day.setMonth(Number(date[1]) - 1, Number(date[2]))
    if (day.getMonth() !== Number(date[1]) - 1) return null
    if (localDate(day) < localDate(now)) day.setFullYear(day.getFullYear() + 1)
  } else if (relative) {
    day.setDate(now.getDate() + DAY_OFFSET[relative[1]])
  } else if (weekday) {
    let offset = WEEKDAYS.indexOf(weekday[2]) - ((now.getDay() + 6) % 7)
    if (weekday[1] === '다음' || offset < 0) offset += 7
    day.setDate(now.getDate() + offset)
  }
  const found = date ?? relative ?? weekday
  return found && { matched: found[0], date: day }
}
