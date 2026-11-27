import { Capacitor } from '@capacitor/core'
import { useEffect, useRef, useState } from 'react'
import { exactAlarmAllowed, openExactAlarmSetting } from '../features/notify/notifications'
import { GIFTS } from '../features/bond/bond'
import { exportBackup, importBackup } from '../features/records/backup'
import { emptyTrash, saveRecord, setDeleted } from '../features/records/recordStore'
import { applyUpdate, type UpdateStatus } from '../features/update/appUpdate'
import { SETTINGS_ID, type AssistantRecord } from '../features/records/types'
import { serverConfigured } from '../features/records/serverRecords'
import type { Records } from '../features/records/useRecords'
import { requestWidgetPin } from '../features/widget/roomWidget'
import type { Sync } from '../features/records/useSync'
import { ConfirmModal } from './ConfirmModal'
import { Preferences } from './Preferences'

interface SettingsProps {
  records: Records
  sync: Sync
  open: boolean
  updateStatus: UpdateStatus
  onClose: () => void
}

export function Settings({ records, sync, open, updateStatus, onClose }: SettingsProps) {
  const { settings, bond } = records
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
      setEmptying(false)
      setMessage('')
      if ((history.state as { settings?: boolean } | null)?.settings) history.back()
    }
  }, [open, onClose])

  async function attempt(action: () => Promise<string | void>) {
    try {
      setMessage((await action()) ?? '')
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : '처리하지 못했습니다.')
    }
  }

  /** 얻은 물건을 방에 두거나 뺀다. 바로 저장한다. */
  async function toggleGift(id: string) {
    const hidden = settings.hiddenGifts ?? []
    const next = hidden.includes(id) ? hidden.filter((other) => other !== id) : [...hidden, id]
    await saveRecord('setting', { ...settings, hiddenGifts: next }, SETTINGS_ID)
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
        <div className="bond">
          <p>
            {settings.assistantName}와 {bond.name}
            <small>
              출석 {settings.visits?.length ?? 0}일 · {bond.remaining ? `다음까지 ${bond.remaining}` : '더 가까워질 수 없어요'}
            </small>
          </p>
          <progress value={bond.progress} max={1} aria-label="친밀도" />
          <ul className="gifts" aria-label="방에 둘 물건">
            {GIFTS.map((gift, index) => {
              const owned = bond.level > index
              const shown = owned && !settings.hiddenGifts?.includes(gift.id)
              return (
                <li key={gift.id}>
                  <button
                    type="button"
                    disabled={!owned}
                    aria-pressed={owned ? shown : undefined}
                    aria-label={owned ? `${gift.name}, 방에 두기` : `${gift.name}, ${gift.levelName}가 되면 생겨요`}
                    onClick={() => attempt(() => toggleGift(gift.id))}
                  >
                    <span className="icon" aria-hidden="true">
                      {gift.icon}
                    </span>
                    {gift.name}
                    <small>{owned ? (shown ? '방에 있어요' : '넣어뒀어요') : gift.levelName}</small>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        {open && <Preferences settings={settings} onSaved={onClose} />}
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

        {updateStatus === 'installNeeded' && <p role="alert">새 앱 설치가 필요해요.</p>}
        {updateStatus === 'downloaded' && (
          <button type="button" onClick={() => attempt(applyUpdate)}>
            새 화면 적용
          </button>
        )}

        <p role={sync.error ? 'alert' : 'status'}>{sync.error || saveStatus(sync, records.pending)}</p>
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
      </div>
      {emptying && (
        <ConfirmModal
          title="휴지통을 정말 비울까요?"
          body="다른 기기와 서버에서도 지워지고 되살릴 수 없어요."
          confirmLabel="비우기"
          onCancel={() => setEmptying(false)}
          onConfirm={() => {
            setEmptying(false)
            void attempt(async () => {
              await emptyTrash()
              return '휴지통을 비웠습니다.'
            })
          }}
        />
      )}
    </dialog>
  )
}

function saveStatus(sync: Sync, pending: number) {
  if (!sync.connected) return '이 기기에만 저장돼요'
  if (pending) return `기기에 저장됨, 서버로 보낼 것 ${pending}개`
  if (!sync.lastSyncedAt) return '서버와 맞추는 중이에요'
  const time = new Intl.DateTimeFormat('ko-KR', { timeStyle: 'short' })
  return `서버까지 저장됨, ${time.format(new Date(sync.lastSyncedAt))}`
}

function recordTitle(record: AssistantRecord) {
  if (record.kind === 'event' || record.kind === 'todo') return record.data.title
  if (record.kind === 'note' || record.kind === 'diary') return record.data.body
  return record.kind === 'setting' ? '설정' : '대화'
}

interface ServerProps {
  sync: Sync
  attempt: (action: () => Promise<string | void>) => Promise<void>
}

function Server({ sync, attempt }: ServerProps) {
  const [visible, setVisible] = useState(false)
  if (!serverConfigured) return null

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
