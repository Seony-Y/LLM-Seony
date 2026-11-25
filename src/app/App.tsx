import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { localAiAvailable, requestAssistant } from '../features/assistant/api/requestAssistant'
import { requestChat } from '../features/assistant/api/requestChat'
import { parseInput, parseShared } from '../features/assistant/parseInput'
import { diaryEntry } from '../features/assistant/diary'
import { answer, chat, type Answer, type AnswerSource } from '../features/assistant/answer'
import { greeting, pokeLine, sceneFor, weatherLine, weatherSummary, type Line } from '../features/assistant/speech'
import { composeMessage, dial, onSharedText, shareToKakao } from '../features/device/deviceActions'
import { applyNotifications, requestNotificationPermission } from '../features/notify/notifications'
import {
  getTodayWeather,
  hasWeatherPermission,
  requestWeatherPermission,
  type TodayWeather,
} from '../features/online/weather'
import { saveRecord } from '../features/records/recordStore'
import { clearTalk, removeTurn, saveTurn } from '../features/records/talkStore'
import { serverConfigured } from '../features/records/serverRecords'
import { useRecords } from '../features/records/useRecords'
import { useSync } from '../features/records/useSync'
import { Room } from '../features/room/Room'
import type { RoomTarget } from '../features/room/diorama'
import { useUpdate } from '../features/update/useUpdate'
import { onWidgetPrompt, updateWidget } from '../features/widget/roomWidget'
import { buildTimeline } from '../features/widget/timeline'
import { AddForm, type AddKind } from './AddForm'
import type { Draft } from './ConfirmCard'
import { Conversation, type Exchange } from './Conversation'
import { RecordList, type View } from './RecordList'
import { Settings } from './Settings'
import { useDiary } from './useDiary'
import { useViewport } from './useViewport'
import './app.css'

const MINUTE = 60_000
const WEATHER_MINUTES = 30
const EXCHANGE_LIMIT = 50
/** 방금 한 일에 대한 반응이 보인 뒤에 축하한다. */
const LEVEL_UP_DELAY = 1800
const SEEN_LEVEL_KEY = 'personal-assistant.bond-level'

const VIEWS: { view: View; label: string; icon: ReactNode }[] = [
  {
    view: 'event',
    label: '일정',
    icon: <><rect x="4" y="5" width="16" height="15" rx="4" /><path d="M4 10h16M9 3v4M15 3v4" /></>,
  },
  {
    view: 'todo',
    label: '할 일',
    icon: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>,
  },
  {
    view: 'diary',
    label: '비서 일기',
    icon: <path d="M6 4h11a2 2 0 012 2v14H8a3 3 0 01-3-3V5M5 17a3 3 0 013-3h11" />,
  },
  {
    view: 'note',
    label: '기억',
    icon: <path d="M12 20V10M12 12C7 12 5 9 5 5c5 0 7 3 7 7zM12 14c4 0 7-2 7-6-4 0-7 2-7 6z" />,
  },
  {
    view: 'talk',
    label: '대화',
    icon: <path d="M5 5h14a2 2 0 012 2v8a2 2 0 01-2 2h-7l-4.5 3.5V17H5a2 2 0 01-2-2V7a2 2 0 012-2z" />,
  },
]

function App() {
  useViewport()
  const records = useRecords()
  const sync = useSync(records.pending)
  const now = useNow()
  const [weather, setWeather] = useState<TodayWeather | null>(null)
  const [view, changeView] = useState<View>('event')
  const [prompt, setPrompt] = useState('')
  const [line, setLine] = useState<Line | null>(null)
  const [pokes, setPokes] = useState(0)
  const [hops, setHops] = useState(0)
  const [cheers, setCheers] = useState(0)
  const [thinking, setThinking] = useState(false)
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [raised, setRaised] = useState(false)
  const [localAi, setLocalAi] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  const { loaded, settings, events, todos, notes, diaries, talk, bond } = records
  const updateStatus = useUpdate(loaded)
  const state = useMemo(
    () => ({ now, settings, events, todos, notes, weather, bondLevel: bond.level }),
    [now, settings, events, todos, notes, weather, bond.level],
  )
  const writeDiary = useDiary(state, records, sync.accessKey)
  // 이번에 나눈 말은 고르는 카드까지 담고 있어 저장된 것보다 먼저 쓴다.
  const conversation = useMemo(() => {
    const current = new Set(exchanges.map(({ id }) => id))
    const saved: Exchange[] = talk.filter(({ id }) => !current.has(id))
    return [...saved, ...exchanges]
      .sort((left, right) => right.at.localeCompare(left.at))
      .slice(0, EXCHANGE_LIMIT)
  }, [talk, exchanges])
  /** 지운 뒤에 늦게 온 답을 다시 저장하지 않는다. */
  const removed = useRef(new Set<string>())
  const latestState = useRef(state)
  const promptInput = useRef<HTMLInputElement>(null)
  const scene = sceneFor(state)
  const spoken = line ?? greeting(state)
  const needsAttention =
    sync.error !== '' || updateStatus !== 'latest' || (serverConfigured && !sync.connected)

  useEffect(
    () =>
      onSharedText((text) => {
        const parsed = parseShared(text)
        if (parsed.type === 'question') return
        changeView('talk')
        setRaised(true)
        addExchange({ question: text, reply: '공유받은 글이에요. 고쳐서 넣어도 돼요.', proposal: parsed })
        setLine({ title: '이거 맡길까요?', body: '아래에서 골라주세요.' })
      }),
    [],
  )

  useEffect(() => {
    void localAiAvailable().then(setLocalAi)
  }, [])

  useEffect(() => {
    latestState.current = state
  }, [state])

  useEffect(() => {
    document.documentElement.dataset.scene = scene
  }, [scene])

  useEffect(() => {
    let loadedAt = 0
    const load = async () => {
      if (Date.now() - loadedAt < WEATHER_MINUTES * MINUTE || !(await hasWeatherPermission())) return
      loadedAt = Date.now()
      setWeather(await getTodayWeather())
    }
    const run = () => {
      if (document.visibilityState === 'visible') void load().catch(console.error)
    }
    run()
    const timer = setInterval(run, WEATHER_MINUTES * MINUTE)
    document.addEventListener('visibilitychange', run)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', run)
    }
  }, [])

  useEffect(() => {
    if (loaded) void applyNotifications(state).catch(console.error)
    // 시간이 흐르는 것만으로는 예약을 다시 하지 않는다.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, settings, events, todos, notes])

  useEffect(() => {
    if (loaded) void updateWidget(buildTimeline(latestState.current)).catch(console.error)
  }, [loaded, settings, events, todos, notes, weather])

  useEffect(() => {
    if (!loaded || bond.level <= readSeenLevel()) return
    writeSeenLevel(bond.level)
    const timer = setTimeout(() => {
      setCheers((count) => count + 1)
      setHops((count) => count + 1)
      setLine({ title: `이제 ${bond.name}예요!`, body: `방에 ${bond.gift}${objectParticle(bond.gift)} 들여놨어요.` })
    }, LEVEL_UP_DELAY)
    return () => clearTimeout(timer)
  }, [loaded, bond.level, bond.name, bond.gift])

  useEffect(
    () =>
      onWidgetPrompt(() => {
        flushSync(() => {
          changeView('talk')
          setRaised(true)
        })
        promptInput.current?.focus()
      }),
    [],
  )

  /** 대화를 시작하면 시트를 올리고, 다른 기록으로 가면 내린다. */
  function setView(next: View) {
    if (next !== view) setRaised(next === 'talk')
    changeView(next)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const input = prompt.trim()
    if (!input || thinking) return
    const parsed = parseInput(input)
    setPrompt('')
    if (parsed.type !== 'question' && (parsed.type !== 'note' || parsed.explicit)) {
      addExchange({ question: input, reply: proposalText(parsed), proposal: parsed })
      setLine({ title: '맡기는 거예요?', body: '아래에서 골라주세요.' })
      return
    }

    const source = { ...state, diaries }
    const known = parsed.type === 'question' ? answer(input, source) : chat(input, state)
    if (!known.direct && sync.connected) return converse(input, known, source)

    const exchange = addExchange({ question: input, ...toReply(known) })
    setLine({ title: known.title, body: known.title === known.text ? '' : '아래에 적어뒀어요.' })
    setHops((count) => count + 1)
    if (known.action?.type === 'writeDiary') {
      updateExchange(exchange, { reply: '쓰고 있어요…' })
      const reply = await writeDiary(diaryEntry(state, talk))
      settle(exchange, { reply })
    } else if (known.action?.type === 'loadWeather') {
      const reply = await enableWeather().then(
        (today) => answer(input, { ...source, weather: today }).text,
        (error: Error) => error.message,
      )
      settle(exchange, { reply })
    } else {
      settle(exchange)
    }
  }

  /** 연결이 안 되면 앱이 아는 것으로 답한다. */
  async function converse(input: string, known: Answer, source: AnswerSource) {
    const exchange = addExchange({ question: input, reply: '…' })
    setThinking(true)
    setLine({ title: '음, 잠깐만요.', body: '생각하고 있어요.' })
    try {
      const reply = await requestChat(sync.accessKey, input, conversation.toReversed(), source)
      settle(exchange, { reply })
      setLine({ title: '듣고 있어요.', body: '' })
      setHops((count) => count + 1)
    } catch (error) {
      console.warn(error)
      settle(exchange, toReply(known))
      setLine({ title: known.title, body: '지금은 연결이 잘 안 돼요.' })
    } finally {
      setThinking(false)
    }
  }

  function addExchange(fields: Omit<Exchange, 'id' | 'at'>): Exchange {
    const exchange = { ...fields, id: crypto.randomUUID(), at: new Date().toISOString() }
    setExchanges((list) => [exchange, ...list].slice(0, EXCHANGE_LIMIT))
    return exchange
  }

  function updateExchange({ id }: Exchange, change: Partial<Exchange>) {
    setExchanges((list) => list.map((item) => (item.id === id ? { ...item, ...change } : item)))
  }

  /** 다 주고받은 말을 저장한다. */
  function settle(exchange: Exchange, change: Partial<Exchange> = {}) {
    if (removed.current.has(exchange.id)) return
    updateExchange(exchange, change)
    const { id, at, question, reply, items = [] } = { ...exchange, ...change }
    const text = [reply, ...items.map((item) => `· ${item.text}`)].join('\n')
    void saveTurn({ id, at, question, reply: text }).catch(console.error)
  }

  async function confirmProposal(exchange: Exchange, value: Draft) {
    await confirm(value)
    settle(exchange, { reply: confirmedText(value), proposal: undefined })
  }

  function forget(list: Exchange[]) {
    for (const { id } of list) removed.current.add(id)
    setExchanges((current) => current.filter(({ id }) => !removed.current.has(id)))
  }

  async function askAi(exchange: Exchange) {
    setThinking(true)
    setLine({ title: '음, 잠깐만요.', body: '생각하고 있어요.' })
    try {
      const reply = await requestAssistant(exchange.question, settings)
      settle(exchange, { reply, unknown: false })
      setLine({ title: '생각해봤어요.', body: '아래에 적어뒀어요.' })
    } catch (error) {
      updateExchange(exchange, { reply: error instanceof Error ? error.message : '다시 물어봐 주세요.' })
      setLine({ title: '잘 모르겠어요.', body: '아래에 이유를 적어뒀어요.' })
    } finally {
      setThinking(false)
    }
  }

  async function scheduleReminders() {
    if (await requestNotificationPermission()) await applyNotifications(latestState.current)
  }

  async function confirm(value: Draft) {
    switch (value.type) {
      case 'message':
        if (value.channel === 'kakao') await shareToKakao(value.message)
        else await composeMessage(value.recipient, value.message)
        break
      case 'call':
        await dial(value.recipient)
        break
      case 'event': {
        const { title, startsAt } = value
        await saveRecord('event', { title, note: '', startsAt: startsAt.toISOString(), remind: true })
        // 저장은 알림 권한과 상관없이 끝낸다.
        void scheduleReminders().catch(console.error)
        break
      }
      case 'todo':
        await saveRecord('todo', { title: value.title, doneAt: null, dueDate: value.dueDate })
        break
      case 'note':
        await saveRecord('note', { body: value.body })
    }
    setHops((count) => count + 1)
    setLine(
      value.type === 'message' || value.type === 'call'
        ? { title: '여기까지예요.', body: '마지막은 직접 눌러주세요.' }
        : { title: '챙겨뒀어요.', body: `잊어버려도 괜찮아요, ${settings.userName}.` },
    )
  }

  function celebrateAdd(kind: AddKind) {
    setHops((count) => count + 1)
    setLine(
      kind === 'note'
        ? { title: '기억해 뒀어요.', body: '나중에 물어보면 찾아줄게요.' }
        : { title: '챙겨뒀어요.', body: `잊어버려도 괜찮아요, ${settings.userName}.` },
    )
    if (kind === 'event') void scheduleReminders().catch(console.error)
  }

  function tapRoom(target: RoomTarget) {
    if (target === 'weather') {
      speakWeather()
      return
    }
    if (target !== 'assistant') return setView(target)
    setHops((count) => count + 1)
    setPokes((count) => count + 1)
    setLine(pokeLine(settings, pokes, bond.level))
  }

  function speakWeather() {
    void enableWeather().catch((error: Error) =>
      setLine({ title: '날씨를 못 봤어요.', body: error.message }),
    )
  }

  async function enableWeather() {
    await requestWeatherPermission()
    const today = await getTodayWeather()
    setWeather(today)
    setLine(weatherLine(today, new Date()))
    return today
  }

  return (
    <main className="app">
      <section className="stage">
        <div className="speech">
          <button className="weather" type="button" onClick={speakWeather}>
            {weather ? weatherSummary(weather, now) : '날씨 켜기'}
          </button>
          <div aria-live="polite">
            <h1>{spoken.title}</h1>
            <p>{spoken.body}</p>
          </div>
        </div>
        <button
          className="gear"
          type="button"
          aria-label={needsAttention ? '설정, 확인할 것이 있음' : '설정'}
          aria-haspopup="dialog"
          onClick={() => setSettingsOpen(true)}
        >
          <svg width="24" height="24" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 13.5a7.6 7.6 0 000-3l2-1.6-2-3.4-2.4 1a7.6 7.6 0 00-2.6-1.5L14 2.5h-4L9.6 5a7.6 7.6 0 00-2.6 1.500l-2.4-1-2 3.4 2 1.600a7.6 7.6 0 000 3l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 002.6 1.500l.4 2.500h4l.4-2.500a7.6 7.6 0 002.6-1.500l2.4 1 2-3.400z" />
          </svg>
          {needsAttention && <i className="dot" />}
        </button>
        <Room scene={scene} sky={weather?.sky ?? 'cloud'} bondLevel={bond.level} hops={hops} cheers={cheers} onTap={tapRoom} />
      </section>

      <section className={raised ? 'panel raised' : 'panel'}>
        <button
          className="sheet-handle"
          type="button"
          aria-expanded={raised}
          aria-label={raised ? '내리기' : '올리기'}
          onClick={() => setRaised(!raised)}
        >
          <svg width="28" height="14" viewBox="0 0 28 14">
            <path d={raised ? 'M6 4l8 6 8-6' : 'M6 10l8-6 8 6'} />
          </svg>
        </button>
        <nav aria-label="기록">
          {VIEWS.map((item) => (
            <button
              key={item.view}
              type="button"
              aria-pressed={view === item.view}
              onClick={() => setView(item.view)}
            >
              <svg width="24" height="24" viewBox="0 0 24 24">
                {item.icon}
              </svg>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="scroll" key={view}>
          {view === 'talk' ? (
            <Conversation
              exchanges={conversation}
              connected={sync.connected}
              localAi={localAi}
              now={now}
              thinking={thinking}
              onAskAi={(exchange) => void askAi(exchange)}
              onConfirm={confirmProposal}
              onDecline={(exchange) => {
                settle(exchange, { reply: '알겠어요. 안 넣을게요.', proposal: undefined })
                setLine({ title: '알겠어요.', body: '못 들은 걸로 할게요.' })
              }}
              onRemove={(exchange) => {
                forget([exchange])
                void removeTurn(exchange.id).catch(console.error)
              }}
              onClear={() => {
                forget(conversation)
                void clearTalk().catch(console.error)
                setLine({ title: '싹 잊었어요.', body: '새로 이야기해요.' })
              }}
            />
          ) : (
            <RecordList
              view={view}
              records={records}
              now={now}
              onDone={() => {
                setCheers((count) => count + 1)
                setHops((count) => count + 1)
                setLine({ title: '하나 끝!', body: '오늘 일기에 적어둘게요.' })
              }}
            />
          )}
        </div>

        {view === 'talk' ? (
          <form className="prompt" onSubmit={submit}>
            <input
              ref={promptInput}
              aria-label="비서에게 할 말"
              autoComplete="off"
              enterKeyHint="send"
              maxLength={2000}
              placeholder={`${settings.assistantName}와 이야기해요`}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button type="submit" aria-label="보내기" disabled={thinking}>
              <svg width="22" height="22" viewBox="0 0 24 24">
                <path d="M12 19V5M6 11l6-6 6 6" />
              </svg>
            </button>
          </form>
        ) : (
          view !== 'diary' && <AddForm key={`add-${view}`} kind={view} onAdded={celebrateAdd} />
        )}
      </section>
      <Settings
        records={records}
        sync={sync}
        open={settingsOpen}
        updateStatus={updateStatus}
        onClose={closeSettings}
      />
    </main>
  )
}

/** 이 기기에서 축하한 단계. 저장할 수 없으면 다시 축하할 뿐이다. */
function readSeenLevel() {
  try {
    return Number(localStorage.getItem(SEEN_LEVEL_KEY) ?? 0)
  } catch {
    return 0
  }
}

function writeSeenLevel(level: number) {
  try {
    localStorage.setItem(SEEN_LEVEL_KEY, String(level))
  } catch {
    // 다음에 다시 축하한다.
  }
}

function objectParticle(word: string) {
  return (word.charCodeAt(word.length - 1) - 0xac00) % 28 ? '을' : '를'
}

function toReply({ text, items, unknown }: Answer) {
  return { reply: text, items, unknown }
}

function confirmedText(draft: Draft) {
  switch (draft.type) {
    case 'event':
      return '일정에 넣어뒀어요.'
    case 'todo':
      return '할 일에 넣어뒀어요.'
    case 'note':
      return '기억해 뒀어요.'
    default:
      return '열어뒀어요. 마지막은 직접 눌러주세요.'
  }
}

function proposalText(draft: Draft) {
  switch (draft.type) {
    case 'event':
      return '일정으로 넣을까요?'
    case 'todo':
      return '할 일에 넣을까요?'
    case 'message':
      return `${draft.recipient}에게 보낼 글을 써볼까요?`
    case 'call':
      return `${draft.recipient}에게 전화할까요?`
    case 'note':
      return '기억해 둘까요?'
  }
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const tick = () => setNow(new Date())
    const timer = setInterval(tick, MINUTE)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  return now
}

export default App
