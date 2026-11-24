import { expect, test } from 'vitest'
import { parseInput, parseShared } from './parseInput'
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
  ['9시 운동', '2026-11-24 21:00 운동'],
  ['오늘 9시 운동', '2026-11-24 21:00 운동'],
  ['3시 커피', '2026-11-24 15:00 커피'],
  ['10시 40분 회의', '2026-11-24 10:40 회의'],
  ['5분 뒤 약 먹기', '2026-11-24 10:05 약 먹기'],
  ['5분후 회의', '2026-11-24 10:05 회의'],
  ['10분 뒤에 일정 추가', '2026-11-24 10:10 일정'],
  ['10분 뒤 회의 일정 추가해줘', '2026-11-24 10:10 회의'],
  ['일정 추가 10분 뒤 회의', '2026-11-24 10:10 회의'],
  ['한 시간 뒤 전화하기', '2026-11-24 11:00 전화하기'],
  ['1시간 30분 후 빨래 널기', '2026-11-24 11:30 빨래 널기'],
  ['두 시간 반 있다가 출발', '2026-11-24 12:30 출발'],
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
  expect(parseInput(input, now)).toEqual({ type: 'message', channel: 'sms', recipient: '엄마', message }),
)

test.each([
  ['빨래하기', 'todo'],
  ['치과 예약', 'todo'],
  ['역 앞 국밥집 맛있었음', 'note'],
  ['3시간 걸렸음', 'note'],
  ['30분 전에 먹음', 'note'],
  ['퇴근 후 운동', 'note'],
  ['오늘 날씨 어때?', 'question'],
])('%s는 %s', (input, type) => expect(parseInput(input, now).type).toBe(type))

test('초가 남아 있으면 말한 시간보다 일찍 울리지 않는다', () => {
  const parsed = parseInput('1분 뒤 물', new Date(2026, 10, 24, 10, 0, 50))
  expect(parsed).toMatchObject({ startsAt: new Date(2026, 10, 24, 10, 2) })
})

test.each([
  ['엄마한테 늦는다고 카톡', '나 오늘 좀 늦을 것 같아'],
  ['엄마한테 늦는다고 카톡 보내줘', '나 오늘 좀 늦을 것 같아'],
  ['엄마에게 사랑해라고 카카오톡 해줘', '사랑해'],
  ['엄마한테 잘 도착했다고 톡해줘', '잘 도착했다'],
  ['엄마한테 카톡', ''],
])('카톡: %s', (input, message) =>
  expect(parseInput(input, now)).toEqual({ type: 'message', channel: 'kakao', recipient: '엄마', message }),
)

test('공유받은 글은 명령이나 질문으로 보지 않는다', () => {
  expect(parseShared('내일 3시에\n강남역에서 볼까?', now)).toEqual({
    type: 'event',
    title: '강남역에서 볼까',
    startsAt: new Date(2026, 10, 25, 15),
  })
  expect(parseShared('엄마한테 전화해줘', now).type).toBe('note')
  expect(parseShared('밥 먹었어?', now)).toEqual({ type: 'note', body: '밥 먹었어?' })
})
