import { useState } from 'react'
import { requestAssistant } from '../features/assistant/api/requestAssistant'
import {
  executeDeviceCommand,
  parseDeviceCommand,
} from '../features/device/deviceActions'
import {
  getCurrentWeather,
  openWebSearch,
  type CurrentWeather,
} from '../features/online/onlineServices'
import {
  createSchedule,
  deleteSchedule,
  loadSchedules,
  type ScheduleItem,
} from '../features/schedule/scheduleService'
import './app.css'

const features = [
  ['Notes', 'Local-first'],
  ['Camera', 'Device'],
  ['Messages', 'Device'],
  ['Calls', 'Device'],
  ['Reminders', 'Ready'],
  ['Calendar', 'Local'],
  ['Weather', 'Live'],
  ['Search', 'Web'],
  ['Assistant', 'On-device'],
] as const

function App() {
  const [prompt, setPrompt] = useState('')
  const [answer, setAnswer] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [schedules, setSchedules] = useState(loadSchedules)
  const [scheduleMessage, setScheduleMessage] = useState('')
  const [isSavingSchedule, setIsSavingSchedule] = useState(false)
  const [weather, setWeather] = useState<CurrentWeather | null>(null)
  const [weatherMessage, setWeatherMessage] = useState('')
  const [isLoadingWeather, setIsLoadingWeather] = useState(false)
  const [searchMessage, setSearchMessage] = useState('')

  async function submitPrompt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!prompt.trim() || isLoading) return

    const input = prompt.trim()
    setIsLoading(true)
    setAnswer('')
    try {
      const deviceCommand = parseDeviceCommand(input)
      setAnswer(
        deviceCommand
          ? await executeDeviceCommand(deviceCommand)
          : await requestAssistant(input),
      )
    } catch (error) {
      setAnswer(error instanceof Error ? error.message : 'Request failed')
    } finally {
      setIsLoading(false)
    }
  }

  async function submitSchedule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)

    setIsSavingSchedule(true)
    setScheduleMessage('')
    try {
      await createSchedule({
        title: String(data.get('title') ?? ''),
        note: String(data.get('note') ?? ''),
        startsAt: String(data.get('startsAt') ?? ''),
        withNotification: data.get('withNotification') === 'on',
      })
      setSchedules(loadSchedules())
      setScheduleMessage('일정이 등록되었습니다.')
      form.reset()
    } catch (error) {
      setScheduleMessage(error instanceof Error ? error.message : '일정을 등록하지 못했습니다.')
    } finally {
      setIsSavingSchedule(false)
    }
  }

  async function removeSchedule(item: ScheduleItem) {
    try {
      await deleteSchedule(item)
      setSchedules(loadSchedules())
      setScheduleMessage('일정이 삭제되었습니다.')
    } catch (error) {
      setScheduleMessage(error instanceof Error ? error.message : '일정을 삭제하지 못했습니다.')
    }
  }

  async function loadWeather() {
    setIsLoadingWeather(true)
    setWeatherMessage('')
    try {
      setWeather(await getCurrentWeather())
    } catch (error) {
      setWeather(null)
      setWeatherMessage(error instanceof Error ? error.message : '날씨를 불러오지 못했습니다.')
    } finally {
      setIsLoadingWeather(false)
    }
  }

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const query = String(new FormData(event.currentTarget).get('query') ?? '')
    setSearchMessage('')
    try {
      await openWebSearch(query)
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : '검색을 열지 못했습니다.')
    }
  }

  return (
    <main className="shell">
      <header>
        <p className="eyebrow">PERSONAL ASSISTANT</p>
        <h1>Today</h1>
        <p className="date">Your private, local-first command center.</p>
      </header>

      <section className="feature-grid" aria-label="Feature status">
        {features.map(([name, status]) => (
          <article className="feature" key={name}>
            <strong>{name}</strong>
            <span>{status}</span>
          </article>
        ))}
      </section>

      <section className="schedule-section" aria-labelledby="schedule-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">SCHEDULE</p>
            <h2 id="schedule-heading">일정과 알림</h2>
          </div>
          <span className="schedule-count">{schedules.length}개</span>
        </div>

        <form className="schedule-form" onSubmit={submitSchedule}>
          <label>
            일정 제목
            <input name="title" placeholder="예: 병원 예약" required />
          </label>
          <label>
            날짜와 시간
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label className="schedule-note">
            메모
            <input name="note" placeholder="장소나 준비할 내용" />
          </label>
          <label className="notification-toggle">
            <input name="withNotification" type="checkbox" defaultChecked />
            해당 시간에 휴대폰 알림 받기
          </label>
          <button type="submit" disabled={isSavingSchedule}>
            {isSavingSchedule ? '등록 중...' : '일정 등록'}
          </button>
        </form>

        {scheduleMessage && (
          <p className="schedule-message" role="status">{scheduleMessage}</p>
        )}

        <div className="schedule-list">
          {schedules.length === 0 ? (
            <p className="empty-state">등록된 일정이 없습니다.</p>
          ) : (
            schedules.map((item) => (
              <article className="schedule-item" key={item.id}>
                <time dateTime={item.startsAt}>{formatScheduleDate(item.startsAt)}</time>
                <div>
                  <strong>{item.title}</strong>
                  {item.note && <p>{item.note}</p>}
                  <span>{item.notificationId ? '알림 예약됨' : '알림 없음'}</span>
                </div>
                <button className="delete-button" type="button" onClick={() => removeSchedule(item)}>
                  삭제
                </button>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="live-section" aria-labelledby="live-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">LIVE</p>
            <h2 id="live-heading">날씨와 웹 검색</h2>
          </div>
          <span className="online-badge">인터넷 필요</span>
        </div>

        <div className="live-tools">
          <div className="weather-tool">
            <div className="tool-heading">
              <strong>현재 위치 날씨</strong>
              <button type="button" onClick={loadWeather} disabled={isLoadingWeather}>
                {isLoadingWeather ? '확인 중...' : '날씨 확인'}
              </button>
            </div>
            {weather && (
              <div className="weather-result">
                <p><strong>{weather.temperature}°</strong> {weather.description}</p>
                <dl>
                  <div><dt>체감</dt><dd>{weather.apparentTemperature}°</dd></div>
                  <div><dt>습도</dt><dd>{weather.humidity}%</dd></div>
                  <div><dt>바람</dt><dd>{weather.windSpeed} km/h</dd></div>
                </dl>
              </div>
            )}
            {weatherMessage && <p className="tool-message" role="status">{weatherMessage}</p>}
          </div>

          <form className="search-tool" onSubmit={submitSearch}>
            <label htmlFor="web-query">실시간 웹 검색</label>
            <div className="prompt-row">
              <input id="web-query" name="query" placeholder="검색할 내용을 입력하세요" />
              <button type="submit">검색</button>
            </div>
            {searchMessage && <p className="tool-message" role="status">{searchMessage}</p>}
          </form>
        </div>
      </section>

      <form className="assistant" onSubmit={submitPrompt}>
        <label htmlFor="prompt">Ask your assistant</label>
        <div className="prompt-row">
          <input
            id="prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="카메라 켜줘, 엄마한테 전화 걸어줘"
          />
          <button type="submit" disabled={isLoading}>
            {isLoading ? 'Thinking...' : 'Send'}
          </button>
        </div>
        {answer && <output>{answer}</output>}
      </form>
    </main>
  )
}

function formatScheduleDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default App