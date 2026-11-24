import { localDate } from '../features/assistant/speech'

export function formatDay(iso: string, now: Date) {
  const date = new Date(iso)
  const tomorrow = new Date(now)
  tomorrow.setDate(now.getDate() + 1)
  if (localDate(date) === localDate(now)) return '오늘'
  if (localDate(date) === localDate(tomorrow)) return '내일'
  return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(date)
}
