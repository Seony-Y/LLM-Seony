import { postChat } from '../../records/serverRecords'
import type { Turn } from '../../records/types'
import type { AnswerSource } from '../answer'
import type { ParsedInput } from '../parseInput'
import { eventsFrom, formatTime, localDate, openTodos } from '../speech'
import { readSuggestion, suggestionGuide, type Suggestion } from '../suggestion'

const CONTEXT_TURNS = 2
const LIST_LIMIT = 20

/** 하던 말에서 넣어둘 것을 찾는다. 말로 답하는 일과 따로 물어야 빠뜨리지 않는다. */
export async function requestSuggestion(
  accessKey: string,
  text: string,
  turns: Pick<Turn, 'question' | 'reply'>[],
  { now, events, todos }: AnswerSource,
  parsed: ParsedInput,
): Promise<Suggestion | undefined> {
  const saved = [
    ...eventsFrom(now, events)
      .slice(0, LIST_LIMIT)
      .map(({ data }) => {
        const at = new Date(data.startsAt)
        return `일정 ${localDate(at)} ${formatTime(at)} ${data.title}`
      }),
    ...openTodos(todos)
      .slice(0, LIST_LIMIT)
      .map(({ data }) => `할일 ${data.dueDate ?? ''} ${data.title}`),
  ]
  const context = turns
    .slice(-CONTEXT_TURNS)
    .map(({ question, reply }) => `사용자: ${question}\n비서: ${reply.slice(0, 200)}`)
  const output = await postChat(
    accessKey,
    [
      { role: 'system', content: suggestionGuide(now) },
      {
        role: 'user',
        content: [
          `이미 저장된 것:\n${saved.join('\n') || '없음'}`,
          `앞 대화:\n${context.join('\n') || '없음'}`,
          `마지막 말: ${text}`,
        ].join('\n\n'),
      },
    ],
    true,
  )
  const suggestion = readSuggestion(output, now)
  if (suggestion?.type !== 'event' || parsed.type !== 'event') return suggestion
  // 말에 적힌 시각은 규칙으로 읽은 것이 더 정확하다.
  const startsAt = new Date(suggestion.startsAt)
  startsAt.setHours(parsed.startsAt.getHours(), parsed.startsAt.getMinutes(), 0, 0)
  return startsAt > now ? { ...suggestion, startsAt } : undefined
}
