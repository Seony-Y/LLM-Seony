import { Capacitor } from '@capacitor/core'
import type { Recalled } from '../features/recall/recall'
import type { Draft } from './ConfirmCard'
import { formatDay } from './dates'

export interface Exchange {
  id: number
  question: string
  reply: string
  items?: Recalled[]
  /** 모르는 말이라 다음에 할 일을 고를 수 있다. */
  unknown?: boolean
  fromAi?: boolean
  /** 맡기는 말로 보여 되물은 것. */
  proposal?: Draft
}

interface ConversationProps {
  exchanges: Exchange[]
  now: Date
  thinking: boolean
  onAskAi: (exchange: Exchange) => void
  onKeep: (exchange: Exchange) => void
  onAccept: (exchange: Exchange) => void
}

const KIND = { event: '일정', todo: '할 일', note: '기억' }

export function Conversation({ exchanges, now, thinking, onAskAi, onKeep, onAccept }: ConversationProps) {
  if (!exchanges.length) {
    return <p className="empty">궁금한 걸 물어보세요. "내일 일정 뭐야?", "주차 어디 했지?"</p>
  }
  return (
    <ol className="conversation" aria-live="polite">
      {exchanges.map((exchange) => (
        <li key={exchange.id}>
          <p className="asked">{exchange.question}</p>
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
                        {item.kind === 'event' ? '' : ' 맡김'}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {exchange.fromAi && <small>AI가 만든 답이라 틀릴 수 있어요.</small>}
          </div>
          {exchange.proposal && (
            <div className="actions">
              <button type="button" onClick={() => onAccept(exchange)}>
                네, 맡길게요
              </button>
            </div>
          )}
          {exchange.unknown && (
            <div className="actions">
              {Capacitor.isNativePlatform() && (
                <button type="button" disabled={thinking} onClick={() => onAskAi(exchange)}>
                  {thinking ? '생각하는 중' : 'AI에게 물어보기'}
                </button>
              )}
              <button type="button" onClick={() => onKeep(exchange)}>
                이 말 기억해 두기
              </button>
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
