import { expect, test } from 'vitest'
import { defaultSettings, type AssistantRecord } from '../records/types'
import { answer, chat, type AnswerSource } from './answer'
import { parseInput } from './parseInput'

const now = new Date(2026, 10, 24, 10)
const at = now.toISOString()
const base = { createdAt: at, updatedAt: at, deletedAt: null, dirty: 0 as const }

const source: AnswerSource = {
  now,
  settings: defaultSettings,
  events: [
    {
      ...base,
      id: 'e',
      kind: 'event',
      data: { title: '업무 회의', note: '', startsAt: new Date(2026, 10, 25, 15).toISOString(), remind: true },
    },
  ],
  todos: [],
  notes: [{ ...base, id: 'n', kind: 'note', data: { body: '주차는 B2 17번 기둥' } } as AssistantRecord<'note'>],
  diaries: [],
  weather: null,
}

test.each(['비서일기 하나 써줄 수 있어?', '일기 써줘', '오늘 일기 좀 적어줄래?'])('%s → 일기를 쓴다', (text) => {
  expect(parseInput(text, now).type).toBe('question')
  expect(answer(text, source).action).toMatchObject({ type: 'writeDiary', date: '2026-11-24' })
})

test('일기를 보여달라는 말에는 쓰지 않는다', () => {
  expect(answer('일기 보여줘', source).action).toBeUndefined()
})

test('아는 것은 기억에서 답한다', () => {
  expect(answer('주차 어디 했지?', source).items?.[0].text).toBe('주차는 B2 17번 기둥')
  expect(answer('내일 일정 뭐야?', source).items?.[0].text).toBe('업무 회의')
})

test('비어 있으면 없다고 하고, 모르면 모른다고 한다', () => {
  expect(answer('오늘 일정 뭐야?', source)).toMatchObject({ text: '거기엔 아무것도 없어요.' })
  expect(answer('블랙홀은 왜 생겨?', source).unknown).toBe(true)
})

test('날씨, 시각, 인사, 도움말', () => {
  expect(answer('오늘 날씨 어때?', source).action).toEqual({ type: 'loadWeather' })
  expect(answer('지금 몇 시야?', source).text).toContain('오전 10:00')
  expect(answer('안녕', source)).toMatchObject({ title: '안녕하세요!', text: '안녕하세요! 오늘도 잘 부탁해요.' })
  expect(answer('너 뭐 할 수 있어?', source).text).toContain('기억 찾기')
})

test.each(['안녕', '고마워', '주차 어디 했지', '국밥집 이름 뭐였더라', '내일 일정 뭐야', '내일 뭐 있어', '치과 언제야', '국밥집 찾아줘', '내일 3시 일정 뭐야'])(
  '물음표 없이도 묻는 말: %s',
  (text) => expect(parseInput(text, now).type).toBe('question'),
)

test.each(['주차는 B2 17번', '언제 봐도 좋은 영화', '안녕하세요 카페 커피 맛있음', '어디든 좋다고 함'])(
  '묻는 말이 아님: %s',
  (text) => expect(parseInput(text, now).type).toBe('note'),
)

test('그냥 하는 말에는 맞장구치고, 기억할지는 고르게 한다', () => {
  expect(chat('오늘 너무 힘들었어', source)).toMatchObject({ title: '고생했어요.', unknown: true })
  expect(chat('점심 맛있었다', source).text).toContain('기분 좋아요')
  expect(chat('회사에서 자리를 옮겼어', source)).toMatchObject({ text: '그랬군요. 더 들려줘요.', unknown: true })
  expect(chat('고마워', source).unknown).toBe(false)
})
