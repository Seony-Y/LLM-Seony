type Address = Partial<
  Record<'quarter' | 'suburb' | 'town' | 'village' | 'neighbourhood' | 'borough' | 'city', string>
>

/** 이보다 오차가 크면 동을 단정하지 않는다. */
const ROUGH_METERS = 1500

let cached: { key: string; place: string } | null = null

/** 좌표의 동 이름. 실패해도 날씨는 보여야 하므로 빈 문자열을 준다. */
export async function findPlace(coords: {
  latitude: number
  longitude: number
  accuracy: number
}): Promise<string> {
  // 약 100m 단위. 자리를 옮기지 않았으면 다시 묻지 않는다.
  const key = `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}`
  if (cached?.key !== key) {
    const [lat, lon] = key.split(',')
    const params = new URLSearchParams({ format: 'jsonv2', zoom: '16', 'accept-language': 'ko', lat, lon })
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`, {
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) return ''
      const { address } = (await response.json()) as { address?: Address }
      cached = { key, place: placeName(address ?? {}) }
    } catch {
      return ''
    }
  }
  const { place } = cached!
  return place && coords.accuracy > ROUGH_METERS ? `${place} 근처` : place
}

export function placeName(address: Address): string {
  const { quarter, suburb, town, village, neighbourhood, borough, city } = address
  const local = [quarter, suburb, town, village, neighbourhood].find((name) =>
    /[동읍면리가]$/.test(name ?? ''),
  )
  return local ?? borough ?? city ?? ''
}
