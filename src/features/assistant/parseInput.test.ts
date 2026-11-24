import { expect, test } from 'vitest'
import { parseInput } from './parseInput'
import { localDate } from './speech'

// 2026-11-24는 화요일
const now = new Date(2026, 10, 24, 10, 0)

test.each([
  ['내일 3시 치과', '2026-11-25 15:00 치과'],
  ['내일 3시 병원 예약 등록해줘', '2026-11-25 15:00 병원 예약'],
  ['오늘 저녁 7시 반에 민수랑 밥', '2026-11-24 19:30 민수랑 밥'],
  ['금요일 오후 2시 검토', '2026-11-27 14:00 검토'],
  ['월요일 9시 회의', '2026-11-30 9:00 회의'],
  ['다음 주 화요일 10시 30분 회의', '2026-12-01 10:30 회의'],
  ['12월 5일 14:00 결혼식', '2026-12-05 14:00 결혼식'],
  ['1월 3일 오전 8시 출장', '2027-01-03 8:00 출장'],
  ['9시 운동', '2026-11-25 9:00 운동'],
  ['밤 12시 마감', '2026-11-25 0:00 마감'],
  ['밤 11시 약 먹기', '2026-11-24 23:00 약 먹기'],
])('일정: %s', (input, expected) => {
  const parsed = parseInput(input, now)
  if (parsed.type !== 'event') throw new Error(`event가 아님: ${parsed.type}`)
  const { startsAt, title } = parsed
  const minute = String(startsAt.getMinutes()).padStart(2, '0')
  expect(`${localDate(startsAt)} ${startsAt.getHours()}:${minute} ${title}`).toBe(expected)
})

test.each(['엄마한테 전화해줘', '엄마한테 전화 해줘', '엄마 전화 걸어줘', '엄마에게 전화 걸어줄래?'])(
  '전화: %s',
  (input) => expect(parseInput(input, now)).toEqual({ type: 'call', recipient: '엄마' }),
)

test.each([
  ['엄마한테 늦는다고 문자', '나 오늘 좀 늦을 것 같아'],
  ['엄마에게 늦는다고 문자 보내줘', '나 오늘 좀 늦을 것 같아'],
  ['엄마한테 사랑해라고 문자 보내줘', '사랑해'],
  ['엄마한테 문자 보내줘', ''],
])('문자: %s', (input, message) =>
  expect(parseInput(input, now)).toEqual({ type: 'message', recipient: '엄마', message }),
)

test.each([
  ['빨래하기', 'todo'],
  ['치과 예약', 'todo'],
  ['역 앞 국밥집 맛있었음', 'note'],
  ['3시간 걸렸음', 'note'],
  ['오늘 날씨 어때?', 'question'],
])('%s는 %s', (input, type) => expect(parseInput(input, now).type).toBe(type))
