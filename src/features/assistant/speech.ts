import type { TodayWeather } from '../online/weather'
import type { AssistantRecord, RecordData } from '../records/types'

export type Scene = 'morning' | 'rain' | 'busy' | 'night'

export interface Line {
  title: string
  body: string
}

export interface DayState {
  /** 친밀도 단계. 가까워지면 말이 편해진다. */
  bondLevel?: number
  now: Date
  settings: RecordData['setting']
  events: AssistantRecord<'event'>[]
  todos: AssistantRecord<'todo'>[]
  weather: TodayWeather | null
}

export function localDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`
}

function isSameDay(iso: string, date: Date) {
  return localDate(new Date(iso)) === localDate(date)
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit' }).format(date)
}

function eventsOn(day: Date, events: AssistantRecord<'event'>[]) {
  return events
    .filter((event) => isSameDay(event.data.startsAt, day))
    .sort((left, right) => left.data.startsAt.localeCompare(right.data.startsAt))
}

function openTodos(todos: AssistantRecord<'todo'>[]) {
  return todos.filter((todo) => !todo.data.doneAt)
}

function doneOn(day: Date, todos: AssistantRecord<'todo'>[]) {
  return todos.filter((todo) => todo.data.doneAt && isSameDay(todo.data.doneAt, day))
}

export function sceneFor({ now, events, weather }: DayState): Scene {
  const hour = now.getHours()
  if (hour >= 21 || hour < 5) return 'night'
  if (weather?.rainAt && isSameDay(weather.rainAt.toISOString(), now)) return 'rain'
  return eventsOn(now, events).length >= 4 ? 'busy' : 'morning'
}

export function greeting(state: DayState): Line {
  const { now, settings, weather } = state
  const nag = settings.tone === 'nag'
  const name = settings.userName
  const today = eventsOn(now, state.events)
  const next = today.find((event) => new Date(event.data.startsAt) > now)
  const open = openTodos(state.todos).length
  const done = doneOn(now, state.todos).length
  const diaryWritten = now.getHours() >= DIARY_HOUR

  switch (sceneFor(state)) {
    case 'night':
      if (nag) {
        return {
          title: done ? '오늘은 봐줄게요.' : '오늘은 쉬었네요.',
          body: open ? `할 일 ${open}개는 내일로 넘겼어요.` : '남은 일이 없어요. 이제 자요.',
        }
      }
      return {
        title: `수고했어요, ${name}.`,
        body: done
          ? `오늘 ${done}개나 해냈어요. ${diaryWritten ? '일기 써뒀으니 보고 자요.' : '이제 좀 쉬어요.'}`
          : '푹 쉬는 것도 일이에요. 잘 자요.',
      }
    case 'rain': {
      const at = weather!.rainAt!
      const when = at <= now ? '지금 비 소식이 있어요' : `${formatTime(at)}부터 비 온대요`
      return nag
        ? { title: '우산요, 우산.', body: `${when}. 이번엔 꼭 챙겨요.` }
        : { title: `우산 챙겨요, ${name}.`, body: `${when}. 저는 벌써 펼쳤지요.` }
    }
    case 'busy':
      return nag
        ? { title: '밥은 먹고 하는 거죠?', body: `오늘 일정이 ${today.length}개나 돼요.` }
        : { title: '오늘 좀 빡빡하네요.', body: `일정이 ${today.length}개예요. 잠깐씩 쉬어요.` }
    default: {
      let title = nag ? '딴짓하고 있었죠?' : `${name}, 잘 지내고 있어요?`
      if (now.getHours() < 11) title = nag ? '이제 일어났어요?' : `${name}, 잘 잤어요?`
      if ((state.bondLevel ?? 0) >= CLOSE_LEVEL) {
        title = nag ? `${name}, 또 딴짓했지?` : `${name}, 왔어?`
        if (now.getHours() < 11) title = nag ? '이제 일어났어?' : `${name}, 잘 잤어?`
      }
      if (next) {
        const time = formatTime(new Date(next.data.startsAt))
        return { title, body: `다음은 ${time} ${next.data.title}. ${nag ? '늦지 마요.' : '천천히 가요.'}` }
      }
      if (open) {
        return {
          title,
          body: nag
            ? `할 일이 ${open}개 남았어요. 하나만 해요.`
            : `남은 일정은 없고, 할 일이 ${open}개 있어요.`,
        }
      }
      return {
        title,
        body: nag ? '할 일이 없다고요? 수상한데요.' : '오늘은 한가해요. 떠오르는 게 있으면 맡겨요.',
      }
    }
  }
}

export const DIARY_HOUR = 22
/** 이 단계부터 인사말이 반말이 된다. */
const CLOSE_LEVEL = 3
const BOND_LINES: { level: number; line: Line }[] = [
  { level: 1, line: { title: '컵 생겼어요!', body: '차 한 잔 하고 갈래요?' } },
  { level: 2, line: { title: '{u} 목소리 들으니 좋네요.', body: '풍선 잘 어울리죠?' } },
  { level: 3, line: { title: '{u}, 나 친구 생겼어.', body: '버섯 위에 앉아 있는 애 보여?' } },
  { level: 4, line: { title: '{u}, 우리 꽤 오래 봤다.', body: '이 화관, {u} 생각하면서 썼어.' } },
]
const SKY_WORDS = { sun: '맑아요', moon: '맑아요', cloud: '구름이 꼈어요', snow: '눈이 와요', rain: '비가 와요' }
const SKY_NAMES = { sun: '맑음', moon: '맑음', cloud: '흐림', snow: '눈', rain: '비' }

export function weatherSummary({ place, sky, temperature }: TodayWeather, now: Date): string {
  return [place, formatTime(now), `${SKY_NAMES[sky]} ${temperature}°`].filter(Boolean).join(' · ')
}

export function weatherLine({ place, sky, temperature, rainAt }: TodayWeather, now: Date): Line {
  const later = rainAt && rainAt > now && sky !== 'rain'
  return {
    title: `${place ? `${place}, ` : ''}지금 ${temperature}°. ${SKY_WORDS[sky]}.`,
    body: later ? `${formatTime(rainAt)}부터 비 온대요. 우산 챙겨요.` : '나갈 때 참고해요.',
  }
}

export function pokeLine(settings: RecordData['setting'], turn: number, bondLevel = 0): Line {
  const lines: Line[] =
    settings.tone === 'nag'
      ? [
          { title: '간지러워요.', body: '누르지만 말고 하나라도 맡겨봐요.' },
          { title: '저도 바빠요.', body: '농담이에요. 물은 마셨어요?' },
        ]
      : [
          { title: '저 부르셨어요?', body: '오늘 뭐 먹었는지 알려줘요. 기억해 둘게요.' },
          { title: '여기 있어요.', body: '심심하면 제가 기억하는 것들 볼래요?' },
        ]
  for (const { level, line } of BOND_LINES) {
    if (bondLevel >= level) {
      const fill = (text: string) => text.replace('{u}', settings.userName)
      lines.push({ title: fill(line.title), body: fill(line.body) })
    }
  }
  return lines[turn % lines.length]
}

export function diaryBody({ now, settings, events, todos }: DayState): string {
  const nag = settings.tone === 'nag'
  const count = eventsOn(now, events).length
  const done = doneOn(now, todos)
  const oldest = openTodos(todos).sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  )[0]

  let doneLine = nag ? '끝낸 일은 없다. 나만 바빴다.' : '끝낸 일은 없지만 그런 날도 있다.'
  if (done.length) {
    const others = done.length > 1 ? ` 말고도 ${done.length - 1}개 더` : ''
    doneLine = `"${done[0].data.title}"${others} 끝냈다. ${nag ? '조금 장하다.' : '장하다.'}`
  }
  let openLine = '남은 일이 없다. 내일은 같이 놀자고 해야지.'
  if (oldest) {
    openLine = `"${oldest.data.title}", ${nag ? '또 내일로 갔다.' : '미뤘지만 모른 척해줬다.'}`
  }
  return [
    count ? `${settings.userName}의 오늘 일정은 ${count}개.` : `${settings.userName}의 조용한 하루.`,
    doneLine,
    openLine,
  ].join('\n')
}

export function briefing(
  day: Date,
  { settings, events, todos }: Pick<DayState, 'settings' | 'events' | 'todos'>,
): Line {
  const [first, ...others] = eventsOn(day, events)
  const open = openTodos(todos).length
  const parts = ['잡힌 일정은 없어요']
  if (first) {
    const time = formatTime(new Date(first.data.startsAt))
    parts[0] = `일정 ${others.length + 1}개, 첫 일정은 ${time} ${first.data.title}`
  }
  if (open) parts.push(`할 일 ${open}개`)
  return {
    title: settings.tone === 'nag' ? '일어났죠?' : `${settings.userName}, 잘 잤어요?`,
    body: parts.join(' · '),
  }
}
