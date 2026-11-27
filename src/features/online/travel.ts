import type { AssistantRecord } from '../records/types'
import { postTravel, type Travel } from '../records/serverRecords'
import { currentPosition, hasWeatherPermission } from './weather'

const MINUTE = 60_000
/** 이 안에 시작하는 일정만 길을 찾는다. 길 사정은 그때그때 바뀐다. */
export const TRAVEL_WINDOW = 24 * 60 * MINUTE
/** 자리를 크게 옮기지 않았으면 이 동안은 다시 묻지 않는다. */
const FRESH = 30 * MINUTE

const cache = new Map<string, { at: number; travel: Travel }>()

export function upcomingPlaces(events: AssistantRecord<'event'>[], now: Date): string[] {
  const until = now.getTime() + TRAVEL_WINDOW
  const places = events
    .filter(({ data }) => {
      const at = Date.parse(data.startsAt)
      return data.remind && data.place?.trim() && at > now.getTime() && at <= until
    })
    .map(({ data }) => data.place!.trim())
  return [...new Set(places)]
}

/** 지금 자리에서 곧 갈 장소들까지 걸리는 시간. 위치 권한이 없거나 못 찾은 곳은 뺀다. */
export async function findTravel(
  accessKey: string,
  events: AssistantRecord<'event'>[],
  now = new Date(),
): Promise<Map<string, Travel>> {
  const found = new Map<string, Travel>()
  const places = upcomingPlaces(events, now)
  if (!accessKey || !places.length || !(await hasWeatherPermission())) return found
  const { coords } = await currentPosition()
  // 약 1km 단위로 묶는다.
  const origin = `${coords.latitude.toFixed(2)},${coords.longitude.toFixed(2)}`
  for (const place of places) {
    const key = `${origin}|${place}`
    const saved = cache.get(key)
    if (saved && now.getTime() - saved.at < FRESH) {
      found.set(place, saved.travel)
      continue
    }
    try {
      const travel = await postTravel(accessKey, coords, place)
      cache.set(key, { at: now.getTime(), travel })
      found.set(place, travel)
    } catch (error) {
      console.warn(place, error)
    }
  }
  return found
}
