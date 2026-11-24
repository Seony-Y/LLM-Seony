import { recall, type Recalled } from '../recall/recall'
import type { AssistantRecord } from '../records/types'
import { diaryBody, formatTime, localDate, weatherLine, type DayState } from './speech'

export interface Answer {
  /** 또리가 짧게 하는 말. */
  title: string
  text: string
  items?: Recalled[]
  /** 화면이 대신 해야 하는 일. */
  action?: { type: 'writeDiary'; date: string; body: string } | { type: 'loadWeather' }
  unknown?: boolean
}

export interface AnswerSource extends DayState {
  notes: AssistantRecord<'note'>[]
  diaries: AssistantRecord<'diary'>[]
}

const SMALL_TALK: { pattern: RegExp; warm: string; nag: string }[] = [
  { pattern: /^(?:안녕|하이|ㅎㅇ|반가워)/, warm: '안녕하세요! 오늘도 잘 부탁해요.', nag: '왔어요? 할 일부터 보죠.' },
  { pattern: /^(?:고마워|고맙|땡큐|수고)/, warm: '별말씀을요. 또 맡겨주세요.', nag: '말로만요? 농담이에요.' },
  { pattern: /^(?:사랑해|좋아해|귀여워|예쁘다)/, warm: '저도요! 잎이 막 흔들려요.', nag: '아부해도 할 일은 안 줄어요.' },
  { pattern: /^(?:잘\s*자|굿나잇)/, warm: '잘 자요. 내일 아침에 봐요.', nag: '진짜 자는 거죠? 폰 내려놔요.' },
  { pattern: /^(?:피곤|힘들|지쳤)/, warm: '고생했어요. 오늘은 조금만 해요.', nag: '그럼 10분만 눕고 하나만 끝내요.' },
  { pattern: /^(?:심심)/, warm: '저를 콕 눌러보세요. 방 안 물건도요.', nag: '심심하면 할 일이 있는데요.' },
]

/** 이보다 길면 두 줄이 되어 방을 가린다. */
const TITLE_LENGTH = 14
const HELP = [
  '이렇게 말해보세요.',
  '· 내일 3시 업무 회의 → 일정',
  '· 영양제 먹기 → 할 일',
  '· 주차는 B2 17번 → 기억',
  '· 주차 어디 했지? → 기억 찾기',
  '· 내일 일정 뭐야? → 일정 보기',
  '· 일기 써줘, 오늘 날씨 어때?',
  '· 엄마한테 늦는다고 카톡',
].join('\n')

export function isSmallTalk(text: string) {
  return SMALL_TALK.some(({ pattern }) => pattern.test(text)) && text.length <= 12
}

const FEELINGS: { pattern: RegExp; warm: string; nag: string }[] = [
  { pattern: /피곤|힘들|지쳤|졸려|졸리/, warm: '고생했어요. 오늘은 조금만 해요.', nag: '그럼 10분만 눕고 하나만 끝내요.' },
  { pattern: /아프|아파|감기|머리가/, warm: '많이 아파요? 물 마시고 좀 쉬어요.', nag: '참지 말고 병원부터 가요.' },
  { pattern: /짜증|화나|화났|열받/, warm: '속상했겠어요. 여기 다 털어놔요.', nag: '일단 숨부터 쉬어요. 그다음에 들을게요.' },
  { pattern: /슬프|슬퍼|우울|외로/, warm: '제가 옆에 있을게요.', nag: '혼자 앓지 말고 누구한테 연락해 봐요.' },
  { pattern: /좋았|기쁘|기뻐|신나|행복|재밌|재미있|맛있/, warm: '저까지 기분 좋아요!', nag: '그럴 줄 알았어요. 다행이네요.' },
  { pattern: /배고|출출/, warm: '얼른 뭐라도 먹어요.', nag: '굶지 말라고 했잖아요.' },
  { pattern: /바빠|바쁘|바빴/, warm: '바쁠수록 잠깐 쉬어 가요.', nag: '바쁘면 저한테 좀 맡겨요.' },
]

/** 묻거나 시키는 말이 아닐 때의 맞장구. 기억할지는 사용자가 고른다. */
export function chat(statement: string, { settings }: Pick<DayState, 'settings'>): Answer {
  const text = statement.trim()
  const found =
    SMALL_TALK.find(({ pattern }) => pattern.test(text)) ??
    FEELINGS.find(({ pattern }) => pattern.test(text))
  const nag = settings.tone === 'nag'
  if (found) return { ...same(nag ? found.nag : found.warm), unknown: !isSmallTalk(text) }
  return { ...same(nag ? '그래서요? 더 말해봐요.' : '그랬군요. 더 들려줘요.'), unknown: true }
}

/** 앱이 아는 것과 할 수 있는 것으로만 답한다. 지어내지 않는다. */
export function answer(question: string, source: AnswerSource): Answer {
  const { now, settings, weather, diaries } = source
  const text = question.trim()

  const talk = SMALL_TALK.find(({ pattern }) => pattern.test(text))
  if (talk && isSmallTalk(text)) {
    const reply = settings.tone === 'nag' ? talk.nag : talk.warm
    return same(reply)
  }

  if (/일기/.test(text) && /써|쓰|적어|작성/.test(text)) {
    const body = diaryBody(source)
    return {
      title: '오늘 일기 썼어요.',
      text: body,
      action: { type: 'writeDiary', date: localDate(now), body },
    }
  }
  if (/일기/.test(text)) {
    const latest = diaries[0]
    return latest
      ? { title: '여기 있어요.', text: `${latest.data.date}\n${latest.data.body}` }
      : { title: '아직 없어요.', text: '아직 쓴 일기가 없어요. "일기 써줘"라고 하면 바로 쓸게요.' }
  }

  if (/날씨|기온|몇\s*도|우산|비\s*(?:와|오|올)/.test(text)) {
    if (!weather) return { title: '잠깐만요.', text: '날씨를 확인하고 있어요.', action: { type: 'loadWeather' } }
    const line = weatherLine(weather, now)
    return { title: '날씨 봤어요.', text: `${line.title} ${line.body}` }
  }

  if (/^(?:지금\s*)?(?:몇\s*시|시간)/.test(text)) return same(`지금은 ${formatTime(now)}이에요.`)
  if (/^(?:오늘(?:은|이)?\s*)?(?:며칠|몇\s*월|무슨\s*요일|날짜)/.test(text)) {
    const date = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full' }).format(now)
    return same(`오늘은 ${date}이에요.`)
  }
  if (/도움말|사용법|기능|(?:뭐|뭘|무엇을?|무슨\s*일).*(?:할\s*수|해\s*줄)/.test(text)) {
    return { title: '이런 걸 할 수 있어요.', text: HELP }
  }

  const items = recall(text, source)
  if (items.length) {
    return {
      title: '찾아봤어요.',
      text: items.length === 1 ? '이거 말하는 거죠?' : `${items.length}개 찾았어요.`,
      items,
    }
  }
  if (/일정|약속|스케줄|할\s*일/.test(text)) return same('거기엔 아무것도 없어요.')
  return { title: '그건 잘 몰라요.', text: '제가 아는 것 중에는 없어요.', unknown: true }
}

function same(text: string): Answer {
  const [first] = text.split(/(?<=[.!?])\s/)
  return { title: first.length <= TITLE_LENGTH ? first : '여기 있어요.', text }
}
