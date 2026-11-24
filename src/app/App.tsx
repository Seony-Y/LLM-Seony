import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { requestAssistant } from '../features/assistant/api/requestAssistant'
import { parseInput } from '../features/assistant/parseInput'
import { diaryBody, greeting, localDate, pokeLine, sceneFor, type Line } from '../features/assistant/speech'
import { composeMessage, dial } from '../features/device/deviceActions'
import { applyNotifications, requestNotificationPermission } from '../features/notify/notifications'
import {
  getTodayWeather,
  hasWeatherPermission,
  requestWeatherPermission,
  type TodayWeather,
} from '../features/online/weather'
import { saveRecord } from '../features/records/recordStore'
import { useRecords } from '../features/records/useRecords'
import { useSync } from '../features/records/useSync'
import { Room } from '../features/room/Room'
import type { RoomTarget } from '../features/room/diorama'
import { ConfirmCard, type Draft } from './ConfirmCard'
import { RecordList, type View } from './RecordList'
import { Settings } from './Settings'
import './app.css'

const MINUTE = 60_000
const WEATHER_MINUTES = 60

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
]

function App() {
  const records = useRecords()
  const sync = useSync(records.pending)
  const now = useNow()
  const [weather, setWeather] = useState<TodayWeather | null>(null)
  const [view, setView] = useState<View>('event')
  const [prompt, setPrompt] = useState('')
  const [draft, setDraft] = useState<{ id: number; value: Draft } | null>(null)
  const [line, setLine] = useState<Line | null>(null)
  const [pokes, setPokes] = useState(0)
  const [hops, setHops] = useState(0)
  const [thinking, setThinking] = useState(false)

  const { loaded, settings, events, todos, diaries } = records
  const state = useMemo(
    () => ({ now, settings, events, todos, weather }),
    [now, settings, events, todos, weather],
  )
  const scene = sceneFor(state)
  const spoken = line ?? greeting(state)

  useEffect(() => {
    document.documentElement.dataset.scene = scene
  }, [scene])

  useEffect(() => {
    const load = async () => {
      if (await hasWeatherPermission()) setWeather(await getTodayWeather())
    }
    const run = () => void load().catch(console.error)
    run()
    const timer = setInterval(run, WEATHER_MINUTES * MINUTE)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (loaded) void applyNotifications(state).catch(console.error)
    // 시간이 흐르는 것만으로는 예약을 다시 하지 않는다.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, settings, events, todos])

  useEffect(() => {
    if (!loaded || now.getHours() < 21) return
    const date = localDate(now)
    const body = diaryBody(state)
    const written = diaries.find((diary) => diary.data.date === date)
    if (written?.data.body !== body) {
      void saveRecord('diary', { date, body }, `diary-${date}`).catch(console.error)
    }
  }, [loaded, now, state, diaries])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const input = prompt.trim()
    if (!input || thinking) return
    const parsed = parseInput(input)
    setPrompt('')
    if (parsed.type !== 'question') {
      setDraft({ id: Date.now(), value: parsed })
      setLine({ title: '이렇게 이해했어요.', body: '틀린 데가 있으면 고쳐도 돼요.' })
      return
    }

    setDraft(null)
    setThinking(true)
    setLine({ title: '음, 잠깐만요.', body: '생각하고 있어요.' })
    try {
      setLine({ title: input, body: await requestAssistant(input) })
    } catch (error) {
      setLine({
        title: '잘 모르겠어요.',
        body: error instanceof Error ? error.message : '다시 물어봐 주세요.',
      })
    } finally {
      setThinking(false)
    }
  }

  async function confirm(value: Draft) {
    switch (value.type) {
      case 'message':
        await composeMessage(value.recipient, value.message)
        break
      case 'call':
        await dial(value.recipient)
        break
      case 'event': {
        const { title, startsAt } = value
        await requestNotificationPermission()
        await saveRecord('event', { title, note: '', startsAt: startsAt.toISOString(), remind: true })
        setView('event')
        break
      }
      case 'todo':
        await saveRecord('todo', { title: value.title, doneAt: null })
        setView('todo')
        break
      case 'note':
        await saveRecord('note', { body: value.body })
        setView('note')
    }
    setDraft(null)
    setHops((count) => count + 1)
    setLine(
      value.type === 'message' || value.type === 'call'
        ? { title: '여기까지예요.', body: '마지막은 직접 눌러주세요.' }
        : { title: '챙겨뒀어요.', body: `잊어버려도 괜찮아요, ${settings.userName}.` },
    )
  }

  function tapRoom(target: RoomTarget) {
    if (target !== 'assistant') return setView(target)
    setHops((count) => count + 1)
    setPokes((count) => count + 1)
    setLine(pokeLine(settings, pokes))
  }

  async function enableWeather() {
    await requestWeatherPermission()
    setWeather(await getTodayWeather())
    setLine(null)
  }

  return (
    <main className="app">
      <section className="stage">
        <div className="speech" aria-live="polite">
          <h1>{spoken.title}</h1>
          <p>{spoken.body}</p>
        </div>
        <Room scene={scene} hops={hops} onTap={tapRoom} />
      </section>

      <section className="panel">
        <form className="prompt" onSubmit={submit}>
          <input
            aria-label="비서에게 맡길 일"
            autoComplete="off"
            enterKeyHint="send"
            maxLength={2000}
            placeholder={`${settings.assistantName}에게 슬쩍 말해보세요`}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <button type="submit" aria-label="맡기기" disabled={thinking}>
            <svg width="22" height="22" viewBox="0 0 24 24">
              <path d="M12 19V5M6 11l6-6 6 6" />
            </svg>
          </button>
        </form>

        {draft && (
          <ConfirmCard
            key={draft.id}
            draft={draft.value}
            onConfirm={confirm}
            onCancel={() => {
              setDraft(null)
              setLine({ title: '알겠어요.', body: '못 들은 걸로 할게요.' })
            }}
          />
        )}

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

        <div>
          <RecordList
            view={view}
            records={records}
            now={now}
            onDone={() => {
              setHops((count) => count + 1)
              setLine({ title: '하나 끝!', body: '오늘 일기에 적어둘게요.' })
            }}
          />
        </div>

        <footer>
          <p role={sync.error ? 'alert' : undefined}>{sync.error || saveStatus(sync, records.pending)}</p>
          <Settings records={records} sync={sync} onEnableWeather={enableWeather} />
        </footer>
      </section>
    </main>
  )
}

function saveStatus(sync: ReturnType<typeof useSync>, pending: number) {
  if (!sync.connected) return '이 기기에만 저장돼요'
  if (pending) return `기기에 저장됨, 서버로 보낼 것 ${pending}개`
  if (!sync.lastSyncedAt) return '서버와 맞추는 중이에요'
  const time = new Intl.DateTimeFormat('ko-KR', { timeStyle: 'short' })
  return `서버까지 저장됨, ${time.format(new Date(sync.lastSyncedAt))}`
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
