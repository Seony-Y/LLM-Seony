import { Capacitor } from '@capacitor/core'
import { useEffect, useState } from 'react'
import {
  exactAlarmAllowed,
  openExactAlarmSetting,
  requestNotificationPermission,
} from '../features/notify/notifications'
import { exportBackup, importBackup } from '../features/records/backup'
import { emptyTrash, saveRecord, setDeleted } from '../features/records/recordStore'
import { SETTINGS_ID, type AssistantRecord, type RecordData, type Tone } from '../features/records/types'
import { serverConfigured } from '../features/records/serverRecords'
import type { Records } from '../features/records/useRecords'
import type { Sync } from '../features/records/useSync'

interface SettingsProps {
  records: Records
  sync: Sync
  open: boolean
  onToggle: (open: boolean) => void
  weatherOn: boolean
  onEnableWeather: () => Promise<string>
}

export function Settings({ records, sync, open, onToggle, weatherOn, onEnableWeather }: SettingsProps) {
  const { settings } = records
  const [message, setMessage] = useState('')
  const [exact, setExact] = useState(true)
  const [emptying, setEmptying] = useState(false)
  const isNative = Capacitor.isNativePlatform()

  useEffect(() => {
    const check = () => void exactAlarmAllowed().then(setExact).catch(console.error)
    check()
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])

  function update(change: Partial<RecordData['setting']>) {
    return saveRecord('setting', { ...settings, ...change }, SETTINGS_ID)
  }

  async function attempt(action: () => Promise<string | void>) {
    try {
      setMessage((await action()) ?? '')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '처리하지 못했습니다.')
    }
  }

  async function toggleBriefing(on: boolean) {
    if (on && !(await requestNotificationPermission())) {
      throw new Error('알림 권한을 허용해야 아침 보고를 보낼 수 있어요.')
    }
    await update({ briefing: on })
  }

  async function restore(file: File | undefined) {
    if (file) return `${await importBackup(await file.text())}개를 되살렸습니다.`
  }

  return (
    <details className="settings" open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
      <summary>설정과 저장</summary>
      <div className="fields">
        <TextField
          label="비서 이름"
          value={settings.assistantName}
          onSave={(assistantName) => update({ assistantName })}
        />
        <TextField label="나를 부를 때" value={settings.userName} onSave={(userName) => update({ userName })} />
        <label>
          말투
          <select value={settings.tone} onChange={(event) => update({ tone: event.target.value as Tone })}>
            <option value="warm">다정한</option>
            <option value="nag">잔소리꾼</option>
          </select>
        </label>
      </div>

      {isNative && (
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.briefing}
            onChange={(event) => attempt(() => toggleBriefing(event.target.checked))}
          />
          매일 아침 8시에 보고 받기
        </label>
      )}
      {!exact && (
        <button type="button" onClick={() => attempt(openExactAlarmSetting)}>
          알림이 늦지 않게 정확한 알람 허용
        </button>
      )}
      <button type="button" onClick={() => attempt(onEnableWeather)}>
        {weatherOn ? '날씨 새로고침' : '현재 위치 날씨 켜기'}
      </button>

      <Server sync={sync} attempt={attempt} />

      <div className="actions">
        <button type="button" onClick={() => attempt(exportBackup)}>
          백업 내보내기
        </button>
        <label className="file">
          백업 가져오기
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              const { files } = event.target
              void attempt(() => restore(files?.[0]))
            }}
          />
        </label>
      </div>
      {message && <p role="status">{message}</p>}

      {records.trash.length > 0 && (
        <>
          <div className="trash-title">
            <h2>휴지통, 30일 동안 보여요</h2>
            <button type="button" onClick={() => setEmptying(true)}>
              비우기
            </button>
          </div>
          {emptying && (
            <div className="confirm" role="alert">
              <p>휴지통을 모두 지울까요? 되살릴 수 없어요.</p>
              <div className="actions">
                <button
                  className="primary"
                  type="button"
                  onClick={() =>
                    attempt(async () => {
                      await emptyTrash()
                      setEmptying(false)
                      return '휴지통을 비웠습니다.'
                    })
                  }
                >
                  모두 지우기
                </button>
                <button type="button" onClick={() => setEmptying(false)}>
                  취소
                </button>
              </div>
            </div>
          )}
          <ul>
            {records.trash.map((record) => (
              <li key={record.id}>
                <div>{recordTitle(record)}</div>
                <button type="button" onClick={() => setDeleted(record.id, false)}>
                  되살리기
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  )
}

function recordTitle(record: AssistantRecord) {
  if (record.kind === 'event' || record.kind === 'todo') return record.data.title
  return record.kind === 'setting' ? '설정' : record.data.body
}

interface TextFieldProps {
  label: string
  value: string
  onSave: (value: string) => Promise<void>
}

function TextField({ label, value, onSave }: TextFieldProps) {
  return (
    <label>
      {label}
      <input
        key={value}
        defaultValue={value}
        maxLength={8}
        onBlur={(event) => {
          const next = event.target.value.trim()
          if (next && next !== value) void onSave(next)
          else event.target.value = value
        }}
      />
    </label>
  )
}

interface ServerProps {
  sync: Sync
  attempt: (action: () => Promise<string | void>) => Promise<void>
}

function Server({ sync, attempt }: ServerProps) {
  const [visible, setVisible] = useState(false)
  if (!serverConfigured) return <p>서버가 아직 연결되지 않아 이 기기에만 저장됩니다.</p>

  if (sync.connected) {
    return (
      <div className="account">
        <button type="button" onClick={() => sync.sync()}>
          지금 동기화
        </button>
        <button
          type="button"
          onClick={() =>
            attempt(async () => {
              await sync.disconnect()
              return '연결을 끊었습니다. 기록은 이 기기에 남아 있습니다.'
            })
          }
        >
          서버 연결 끊기
        </button>
      </div>
    )
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const key = String(new FormData(event.currentTarget).get('key')).trim()
    void attempt(async () => {
      await sync.connect(key)
      return '서버에 연결했습니다.'
    })
  }

  return (
    <form className="login" onSubmit={submit}>
      <input
        name="key"
        type={visible ? 'text' : 'password'}
        autoCapitalize="off"
        autoComplete="current-password"
        autoCorrect="off"
        spellCheck={false}
        placeholder="서버 비밀 키"
        aria-label="서버 비밀 키"
        required
      />
      <div className="actions">
        <button className="primary">서버 연결</button>
        <button type="button" onClick={() => setVisible(!visible)}>
          {visible ? '키 가리기' : '키 보기'}
        </button>
      </div>
    </form>
  )
}
