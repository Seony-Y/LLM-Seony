import { Capacitor } from '@capacitor/core'
import { useEffect, useRef, useState } from 'react'
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
import { requestWidgetPin } from '../features/widget/roomWidget'
import type { Sync } from '../features/records/useSync'

interface SettingsProps {
  records: Records
  sync: Sync
  open: boolean
  onClose: () => void
}

export function Settings({ records, sync, open, onClose }: SettingsProps) {
  const { settings } = records
  const dialog = useRef<HTMLDialogElement>(null)
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

  useEffect(() => {
    const element = dialog.current
    if (!open || !element) return
    element.showModal()
    // 안드로이드의 뒤로 가기로 설정만 닫히게 한다.
    history.pushState({ settings: true }, '')
    addEventListener('popstate', onClose)
    return () => {
      removeEventListener('popstate', onClose)
      element.close()
      if ((history.state as { settings?: boolean } | null)?.settings) history.back()
    }
  }, [open, onClose])

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
    <dialog
      className="settings-dialog"
      ref={dialog}
      aria-label="설정"
      onClose={onClose}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="settings">
        <header>
          <h2>설정</h2>
          <button type="button" aria-label="설정 닫기" onClick={onClose}>
            ×
          </button>
        </header>
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
        {isNative && (
          <button type="button" onClick={() => attempt(requestWidgetPin)}>
            홈 화면에 위젯 추가
          </button>
        )}
        {!exact && (
          <button type="button" onClick={() => attempt(openExactAlarmSetting)}>
            알림이 늦지 않게 정확한 알람 허용
          </button>
        )}

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
        <p>날씨 Open-Meteo, 동네 이름 © OpenStreetMap</p>
      </div>
    </dialog>
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
