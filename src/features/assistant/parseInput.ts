export type ParsedInput =
  | { type: 'event'; title: string; startsAt: Date }
  | { type: 'todo'; title: string }
  | { type: 'note'; body: string }
  | { type: 'message'; recipient: string; message: string }
  | { type: 'call'; recipient: string }
  | { type: 'question'; text: string }

const WEEKDAYS = '월화수목금토일'
const HANGUL_HOURS: Record<string, number> = { 한: 1, 두: 2, 세: 3, 네: 4 }
const MAX_DELAY = 7 * 24 * 60
const DAY_OFFSET: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 }

export function parseInput(input: string, now = new Date()): ParsedInput {
  const text = input.trim().replace(/[.!~]+$/, '').trim()

  const message = text.match(
    /^(.+?)(?:한테|에게|께)\s*(?:(.+?)\s*)?(?:문자|메시지|메세지)(?:를|을)?\s*(?:좀\s*)?(?:(?:보내|써|작성해)\s*(?:줘|줄래)?)?\??$/,
  )
  if (message) {
    return { type: 'message', recipient: message[1].trim(), message: toMessage(message[2] ?? '') }
  }

  const call = text.match(
    /^(.+?)(?:한테|에게|께)?\s*전화(?:를)?\s*(?:좀\s*)?(?:걸어|해)\s*(?:줘|줄래)\??$/,
  )
  if (call) return { type: 'call', recipient: call[1].trim() }

  const event = parseEvent(text, now)
  if (event) return event
  if (text.endsWith('?')) return { type: 'question', text }
  if (/(하기|사기|가기|내기|찾기|들르기|보내기|예약|해야|해야지|할 것)$/.test(text)) {
    return { type: 'todo', title: text }
  }
  return { type: 'note', body: text }
}

function toMessage(quoted: string) {
  const body = quoted.trim()
  if (body === '늦는다고') return '나 오늘 좀 늦을 것 같아'
  if (/라고$/.test(body)) return body.replace(/(?:이라고|라고)$/, '')
  return body.replace(/다고$/, '다')
}

function parseEvent(text: string, now: Date): ParsedInput | null {
  if (text.endsWith('?')) return null
  return parseDelay(text, now) ?? parseClock(text, now)
}

/** "10분 뒤", "한 시간 반 후", "1시간 30분 이따가" */
function parseDelay(text: string, now: Date): ParsedInput | null {
  const delay = text.match(
    /(?:(\d+|[한두세네])\s*시간(?:\s*(반))?)?\s*(?:(\d+)\s*분)?\s*(?:뒤|후|있다가|이따가?)(?:에)?(?![가-힣])/,
  )
  if (!delay) return null
  const [matched, hourText, half, minuteText] = delay
  if (!hourText && !minuteText) return null
  const hours = hourText ? (HANGUL_HOURS[hourText] ?? Number(hourText)) : 0
  const minutes = hours * 60 + (half ? 30 : 0) + Number(minuteText ?? 0)
  if (minutes < 1 || minutes > MAX_DELAY) return null

  const startsAt = new Date(now.getTime() + minutes * 60_000)
  // 분 단위로 저장하므로 말한 시간보다 일찍 울리지 않게 올린다.
  if (startsAt.getSeconds() || startsAt.getMilliseconds()) {
    startsAt.setMinutes(startsAt.getMinutes() + 1, 0, 0)
  }
  return { type: 'event', title: toTitle(text.replace(matched, ' ')), startsAt }
}

function parseClock(text: string, now: Date): ParsedInput | null {
  const time = text.match(
    /(?:(새벽|아침|오전|점심|낮|오후|저녁|밤)\s*)?(?<!\d)(\d{1,2})(?:시(?!간)(?:\s*(반)|\s*(\d{1,2})분)?|:(\d{2}))(?:에)?/,
  )
  if (!time) return null

  const [matched, period, hourText, half, minuteText, clockMinute] = time
  let hour = Number(hourText)
  const minute = half ? 30 : Number(minuteText ?? clockMinute ?? 0)
  if (hour > 23 || minute > 59) return null
  if (/오후|저녁/.test(period) && hour < 12) hour += 12
  else if (period === '밤') hour = hour === 12 ? 0 : hour >= 5 && hour < 12 ? hour + 12 : hour
  else if (/점심|낮/.test(period) && hour < 6) hour += 12
  else if (/새벽|오전|아침/.test(period) && hour === 12) hour = 0
  else if (!period && !clockMinute && hour >= 1 && hour <= 6) hour += 12

  let rest = text.replace(matched, ' ')
  const startsAt = new Date(now)
  const date = rest.match(/(\d{1,2})월\s*(\d{1,2})일/)
  const relative = rest.match(/(?<![가-힣])(오늘|내일|모레|글피)(?![가-힣])/)
  const weekday = rest.match(/(?:(이번|다음)\s*주\s*)?([월화수목금토일])요일/)
  const day = date ?? relative ?? weekday
  if (date) {
    startsAt.setMonth(Number(date[1]) - 1, Number(date[2]))
    if (startsAt.getMonth() !== Number(date[1]) - 1) return null
  } else if (relative) {
    startsAt.setDate(now.getDate() + DAY_OFFSET[relative[1]])
  } else if (weekday) {
    let offset = WEEKDAYS.indexOf(weekday[2]) - ((now.getDay() + 6) % 7)
    if (weekday[1] === '다음' || (!weekday[1] && offset < 0)) offset += 7
    startsAt.setDate(now.getDate() + offset)
  }
  if (day) rest = rest.replace(day[0], ' ')
  // 밤 12시~4시는 다음 날 새벽을 뜻한다.
  if (period === '밤' && hour < 5) startsAt.setDate(startsAt.getDate() + 1)
  startsAt.setHours(hour, minute, 0, 0)

  // "8시"가 지났으면 같은 날 저녁 8시로 본다.
  const evening = new Date(startsAt)
  evening.setHours(hour + 12)
  if (startsAt <= now && evening > now && !period && hour < 12 && !date && !weekday) {
    startsAt.setTime(evening.getTime())
  }
  if (startsAt <= now) {
    if (!day) startsAt.setDate(startsAt.getDate() + 1)
    else if (date) startsAt.setFullYear(startsAt.getFullYear() + 1)
    else if (weekday && !weekday[1]) startsAt.setDate(startsAt.getDate() + 7)
  }

  return { type: 'event', title: toTitle(rest), startsAt }
}

function toTitle(rest: string) {
  const title = rest
    .replace(/일정(?:을|으로)?\s*(?:등록|추가|기록|잡기|넣기)?\s*(?:(?:해|잡아|넣어)\s*(?:줘|줄래))?\s*$/, '')
    .replace(/(?:등록|추가|기록)해\s*(?:줘|줄래)\s*$|알려\s*줘\s*$/, '')
    .replace(/^\s*일정\s*(?:등록|추가)\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^에\s+/, '')
  return title || '일정'
}
