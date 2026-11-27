import { Capacitor } from '@capacitor/core'
import { useEffect, useRef, useState } from 'react'
import {
  exactAlarmAllowed,
  notificationsAllowed,
  openExactAlarmSetting,
  requestNotificationPermission,
} from '../features/notify/notifications'
import { hasWeatherPermission } from '../features/online/weather'
import { saveRecord } from '../features/records/recordStore'
import { serverConfigured } from '../features/records/serverRecords'
import { SETTINGS_ID } from '../features/records/types'
import type { Records } from '../features/records/useRecords'
import type { Sync } from '../features/records/useSync'

interface OnboardingProps {
  records: Records
  sync: Sync
  /** 위치를 허용받고 날씨를 불러온다. */
  onLocation: () => Promise<unknown>
  onClose: () => void
}

type Step = 'server' | 'names' | 'alerts' | 'location' | 'done'

/** 처음 켰을 때 흩어진 설정을 한 화면씩 차례로 맞춘다. 모두 건너뛸 수 있다. */
export function Onboarding({ records, sync, onLocation, onClose }: OnboardingProps) {
  const dialog = useRef<HTMLDialogElement>(null)
  const isNative = Capacitor.isNativePlatform()
  // 다른 기기의 기록을 먼저 받아야 이름에 그 값이 채워진다.
  const steps: Step[] = [
    ...(serverConfigured ? ['server' as const] : []),
    'names',
    ...(isNative ? ['alerts' as const] : []),
    'location',
    'done',
  ]
  const [at, setAt] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [names, setNames] = useState<{ assistantName: string; userName: string } | null>(null)
  const [alerts, setAlerts] = useState<{ granted: boolean; exact: boolean } | null>(null)
  const [located, setLocated] = useState<boolean | null>(null)
  const step = steps[at]
  const { settings } = records
  // 손대기 전에는 지금 설정을 보여주고, 서버에서 받은 값이 오면 따라간다.
  const shown = names ?? { assistantName: settings.assistantName, userName: settings.userName }

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  useEffect(() => {
    void hasWeatherPermission().then((granted) => granted && setLocated(true))
  }, [])

  // 마지막에는 건너뛴 것도 실제로 켜졌는지 다시 본다.
  useEffect(() => {
    if (step !== 'done') return
    void Promise.all([notificationsAllowed(), exactAlarmAllowed(), hasWeatherPermission()]).then(
      ([granted, exact, location]) => {
        setAlerts({ granted, exact })
        setLocated(location)
      },
    )
  }, [step])

  function next() {
    setMessage('')
    setAt((index) => Math.min(index + 1, steps.length - 1))
  }

  async function run(action: () => Promise<boolean | void>) {
    setBusy(true)
    setMessage('')
    try {
      if ((await action()) !== false) next()
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '처리하지 못했어요.')
    } finally {
      setBusy(false)
    }
  }

  function connect(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const key = String(new FormData(event.currentTarget).get('key')).trim()
    void run(() => sync.connect(key))
  }

  function saveNames(event: React.FormEvent) {
    event.preventDefault()
    const assistantName = shown.assistantName.trim()
    const userName = shown.userName.trim()
    if (!assistantName || !userName) return setMessage('이름을 적어주세요.')
    // 고치지 않았으면 저장하지 않아 다른 기기에서 받은 설정을 덮지 않는다.
    if (!names) return next()
    void run(() => saveRecord('setting', { ...settings, assistantName, userName }, SETTINGS_ID).then(() => {}))
  }

  async function allowAlerts() {
    const granted = await requestNotificationPermission()
    const exact = await exactAlarmAllowed()
    setAlerts({ granted, exact })
    // 정확한 알람까지 허용해야 넘어간다. 못 하면 안내를 남긴다.
    if (!granted) throw new Error('알림 권한을 허용하지 않았어요. 나중에 폰 설정에서 켤 수 있어요.')
    return exact
  }

  async function allowLocation() {
    try {
      await onLocation()
      setLocated(true)
    } catch (cause) {
      setLocated(await hasWeatherPermission())
      throw cause
    }
  }

  const skip = (
    <button className="later" type="button" onClick={next} disabled={busy}>
      나중에
    </button>
  )

  return (
    <dialog
      className="onboarding"
      ref={dialog}
      aria-label="처음 안내"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div>
        <ol className="steps" aria-label={`${steps.length}단계 중 ${at + 1}단계`}>
          {steps.map((name, index) => (
            <li key={name} className={index <= at ? 'reached' : undefined} />
          ))}
        </ol>

        {step === 'server' && (
          <form onSubmit={connect}>
            <h2>쓰던 기록이 있나요?</h2>
            <p>
              다른 기기에서 쓰던 서버 비밀 키를 넣으면 기록을 이어서 쓸 수 있어요. 출발 알림과{' '}
              {settings.assistantName}와의 대화도 서버가 있어야 돼요.
            </p>
            {sync.connected ? (
              <p className="status">이미 서버에 연결돼 있어요.</p>
            ) : (
              <input
                name="key"
                type="password"
                autoCapitalize="off"
                autoComplete="current-password"
                autoCorrect="off"
                spellCheck={false}
                placeholder="서버 비밀 키"
                aria-label="서버 비밀 키"
                required
              />
            )}
            {message && <p role="alert">{message}</p>}
            <div className="actions">
              {sync.connected ? (
                <button className="primary" type="button" onClick={next}>
                  다음
                </button>
              ) : (
                <button className="primary" disabled={busy}>
                  연결하기
                </button>
              )}
              {!sync.connected && skip}
            </div>
          </form>
        )}

        {step === 'names' && (
          <form onSubmit={saveNames}>
            <h2>반가워요!</h2>
            <p>서로 뭐라고 부를지 정해요.</p>
            <label>
              비서 이름
              <input
                maxLength={8}
                value={shown.assistantName}
                onChange={(event) => setNames({ ...shown, assistantName: event.target.value })}
              />
            </label>
            <label>
              나를 부를 때
              <input
                maxLength={8}
                value={shown.userName}
                onChange={(event) => setNames({ ...shown, userName: event.target.value })}
              />
            </label>
            {message && <p role="alert">{message}</p>}
            <div className="actions">
              <button className="primary" disabled={busy}>
                다음
              </button>
            </div>
          </form>
        )}

        {step === 'alerts' && (
          <section>
            <h2>알림을 켤까요?</h2>
            <p>일정 시간, 나설 시간, 할 일, 생일 같은 챙길 날을 알려드려요. 알림에서 바로 "끝냄"이나 "10분 뒤 다시"를 누를 수 있어요.</p>
            {alerts?.granted && !alerts.exact && (
              <p className="status">알림은 켜졌어요. 정확한 시각에 울리도록 "정확한 알람"도 허용해 주세요. 허용하지 않으면 몇 분 늦을 수 있어요.</p>
            )}
            {message && <p role="alert">{message}</p>}
            <div className="actions">
              {alerts?.granted && !alerts.exact ? (
                <button
                  className="primary"
                  type="button"
                  onClick={() => void run(async () => openExactAlarmSetting())}
                  disabled={busy}
                >
                  정확한 알람 허용
                </button>
              ) : (
                <button className="primary" type="button" onClick={() => void run(allowAlerts)} disabled={busy}>
                  알림 켜기
                </button>
              )}
              {skip}
            </div>
          </section>
        )}

        {step === 'location' && (
          <section>
            <h2>위치를 알려줄래요?</h2>
            <p>오늘 날씨를 보고 우산이나 옷차림을 챙겨드리고, 장소가 있는 일정은 지금 자리에서 걸리는 시간을 보고 나설 때를 알려드려요.</p>
            {message && <p role="alert">{message}</p>}
            <div className="actions">
              <button className="primary" type="button" onClick={() => void run(allowLocation)} disabled={busy}>
                {located ? '날씨 불러오기' : '위치 허용'}
              </button>
              {skip}
            </div>
          </section>
        )}

        {step === 'done' && (
          <section>
            <h2>준비됐어요!</h2>
            <ul className="summary">
              {serverConfigured && (
                <li className={sync.connected ? 'on' : undefined}>서버 {sync.connected ? '연결됨' : '연결 안 함'}</li>
              )}
              {isNative && <li className={alerts?.granted ? 'on' : undefined}>알림 {alerts?.granted ? '켜짐' : '꺼짐'}</li>}
              <li className={located ? 'on' : undefined}>위치 {located ? '허용됨' : '허용 안 함'}</li>
            </ul>
            <p>안 한 것은 오른쪽 위 톱니바퀴의 설정에서 언제든 다시 할 수 있어요.</p>
            <div className="actions">
              <button className="primary" type="button" onClick={onClose}>
                시작하기
              </button>
            </div>
          </section>
        )}
      </div>
    </dialog>
  )
}
