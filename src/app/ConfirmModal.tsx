import { useEffect, useRef } from 'react'

interface ConfirmModalProps {
  title: string
  body: string
  confirmLabel: string
  /** 다른 선택지. */
  other?: { label: string; onClick: () => void }
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ title, body, confirmLabel, other, onConfirm, onCancel }: ConfirmModalProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])

  return (
    <dialog
      className="confirm-modal"
      ref={dialog}
      role="alertdialog"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-body"
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onClick={(event) => event.target === event.currentTarget && onCancel()}
    >
      <div>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-body">{body}</p>
        <div className="actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          {other && (
            <button type="button" onClick={other.onClick}>
              {other.label}
            </button>
          )}
          <button className="primary" type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  )
}
