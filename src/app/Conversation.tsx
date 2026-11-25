import { useEffect, useRef, useState } from 'react'
import type { Turn } from '../features/records/types'
import type { Recalled } from '../features/recall/recall'
import { ConfirmCard, type Draft } from './ConfirmCard'
import { ConfirmModal } from './ConfirmModal'
import { formatDay } from './dates'

export interface Exchange extends Turn {
  items?: Recalled[]
  /** 모르는 말이라 다음에 할 일을 고를 수 있다. */
  unknown?: boolean
  /** 맡기는 말로 보여 되물은 것. */
  proposal?: Draft
  /** AI가 이야기하다 제안한 것이라 하던 말은 남긴다. */
  suggested?: boolean
}

interface ConversationProps {
  /** 최근 것이 앞. */
  exchanges: Exchange[]
  /** 서버에 연결되어 AI와 이야기할 수 있다. */
  connected: boolean
  /** 폰에 AI 모델이 들어 있다. */
  localAi: boolean
  now: Date
  thinking: boolean
  onAskAi: (exchange: Exchange) => void
  onConfirm: (exchange: Exchange, draft: Draft) => Promise<void>
  onDecline: (exchange: Exchange) => void
  onRemove: (exchange: Exchange) => void
  onClear: () => void
}

const KIND = { event: '일정', todo: '할 일', note: '기억' }

export function Conversation({
  exchanges,
  connected,
  localAi,
  now,
  thinking,
  onAskAi,
  onConfirm,
  onDecline,
  onRemove,
  onClear,
}: ConversationProps) {
  const [clearing, setClearing] = useState(false)
  const list = useRef<HTMLOListElement>(null)

  // 새 말이나 늦게 온 답이 보이도록 맨 아래로 내린다.
  useEffect(() => {
    const scroll = list.current?.closest('.scroll')
    scroll?.scrollTo({ top: scroll.scrollHeight })
  }, [exchanges])

  if (!exchanges.length) {
    return (
      <p className="empty">
        {connected
          ? '오늘 있었던 일이나 궁금한 걸 편하게 말해보세요. "내일 3시 업무 회의"처럼 말하면 넣어둘게요.'
          : '설정에서 서버와 연결하면 편하게 이야기할 수 있어요. 지금은 기록만 찾아줄게요.'}
      </p>
    )
  }
  return (
    <>
      <div className="conversation-tools">
        <small>AI의 답은 틀릴 수 있어요</small>
        <button type="button" onClick={() => setClearing(true)}>
          대화 모두 지우기
        </button>
      </div>
      <ol className="conversation" aria-live="polite" ref={list}>
        {exchanges.toReversed().map((exchange) => (
          <li key={exchange.id}>
            <div className="asked-row">
              <button
                className="remove"
                type="button"
                aria-label={`${exchange.question} 대화 지우기`}
                onClick={() => onRemove(exchange)}
              >
                ×
              </button>
              <p className="asked">{exchange.question}</p>
            </div>
            <div className="replied">
              <p>{exchange.reply}</p>
              {exchange.items && (
                <ul>
                  {exchange.items.map((item) => (
                    <li key={item.id}>
                      <div>
                        {item.text}
                        <small>
                          {KIND[item.kind]} · {formatDay(item.at, now)}
                          {item.kind === 'event' ? '' : item.due ? '까지' : ' 맡김'}
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {exchange.proposal && (
              <ConfirmCard
                draft={exchange.proposal}
                onConfirm={(draft) => onConfirm(exchange, draft)}
                onCancel={() => onDecline(exchange)}
              />
            )}
            {exchange.unknown && localAi && (
              <div className="actions">
                <button type="button" disabled={thinking} onClick={() => onAskAi(exchange)}>
                  {thinking ? '생각하는 중' : '폰 AI에게 물어보기'}
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {clearing && (
        <ConfirmModal
          title="대화를 모두 지울까요?"
          body="다른 기기에서도 지워져요. 맡긴 일정, 할 일, 기억과 일기는 남아요."
          confirmLabel="지우기"
          onCancel={() => setClearing(false)}
          onConfirm={() => {
            setClearing(false)
            onClear()
          }}
        />
      )}
    </>
  )
}
