import { localDate } from '../features/assistant/speech'

export function formatDay(iso: string, now: Date) {
  const date = new Date(iso)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (localDate(date) === localDate(now)) return '오늘'
  if (localDate(date) === localDate(tomorrow)) return '내일'
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(date)
}

/** 날짜만 있는 값을 이 기기의 자정으로 읽는다. */
export function formatDue(dueDate: string, now: Date) {
  const day = formatDay(`${dueDate}T00:00`, now)
  return dueDate < localDate(now) ? `${day} 지남` : `${day}까지`
}

export function nextHour() {
  const date = new Date()
  date.setHours(date.getHours() + 1, 0, 0, 0)
  return date
}

export function formatInputTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

export function formatDiaryDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(
    new Date(year, month - 1, day),
  )
}
