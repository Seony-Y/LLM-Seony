import { Capacitor } from '@capacitor/core'
import { useState } from 'react'
import { BRIEFING_HOUR, requestNotificationPermission } from '../features/notify/notifications'
import { saveRecord } from '../features/records/recordStore'
import { SETTINGS_ID, type RecordData, type Tone } from '../features/records/types'

interface PreferencesProps {
  settings: RecordData['setting']
  onSaved: () => void
}

/** 저장을 눌러야 반영된다. 설정 창을 열 때마다 저장된 값으로 시작한다. */
export function Preferences({ settings, onSaved }: PreferencesProps) {
  const [draft, setDraft] = useState(settings)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function edit(change: Partial<RecordData['setting']>) {
    setDraft({ ...draft, ...change })
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const next = {
      ...draft,
      assistantName: draft.assistantName.trim(),
      userName: draft.userName.trim(),
    }
    if (!next.assistantName || !next.userName) return setError('이름을 적어주세요.')

    setBusy(true)
    setError('')
    try {
      if (next.briefing && !settings.briefing && !(await requestNotificationPermission())) {
        throw new Error('알림 권한을 허용해야 아침 보고를 보낼 수 있어요.')
      }
      await saveRecord('setting', next, SETTINGS_ID)
      onSaved()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '저장하지 못했습니다.')
      setBusy(false)
    }
  }

  return (
    <form className="preferences" onSubmit={save}>
      <div className="fields">
        <label>
          비서 이름
          <input
            maxLength={8}
            value={draft.assistantName}
            onChange={(event) => edit({ assistantName: event.target.value })}
          />
        </label>
        <label>
          나를 부를 때
          <input
            maxLength={8}
            value={draft.userName}
            onChange={(event) => edit({ userName: event.target.value })}
          />
        </label>
        <label>
          말투
          <select value={draft.tone} onChange={(event) => edit({ tone: event.target.value as Tone })}>
            <option value="warm">다정한</option>
            <option value="nag">잔소리꾼</option>
          </select>
        </label>
      </div>
      {Capacitor.isNativePlatform() && (
        <label className="toggle">
          <input
            type="checkbox"
            checked={draft.briefing}
            onChange={(event) => edit({ briefing: event.target.checked })}
          />
          매일 아침 {BRIEFING_HOUR}시에 보고 받기
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="actions">
        <button className="primary" type="submit" disabled={busy}>
          저장
        </button>
      </div>
    </form>
  )
}
