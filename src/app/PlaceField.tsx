import { useEffect, useState } from 'react'
import { currentPosition, hasWeatherPermission, requestWeatherPermission } from '../features/online/weather'
import { searchPlaces, type Coords, type PlaceOption } from '../features/records/serverRecords'

interface PlaceFieldProps {
  accessKey: string
  value: string
  /** 후보에서 고른 곳의 좌표. 직접 고쳐 쓰면 없어진다. */
  at?: Coords
  onChange: (value: string, at?: Coords) => void
}

const MIN_QUERY = 2
const TYPING_PAUSE = 300

/** 일정 장소. 이름만으로는 다른 곳을 찾을 수 있어 카카오 후보에서 고르게 한다. */
export function PlaceField({ accessKey, value, at, onChange }: PlaceFieldProps) {
  const [options, setOptions] = useState<PlaceOption[]>([])
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [near, setNear] = useState<Coords>()
  const query = value.trim()

  useEffect(() => {
    if (!accessKey || at || query.length < MIN_QUERY) return
    let live = true
    const timer = setTimeout(() => {
      searchPlaces(accessKey, query, near)
        .then((found) => live && setOptions(found))
        .catch((error: unknown) => console.warn(error))
    }, TYPING_PAUSE)
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [accessKey, at, query, near])

  /** 출발 알림은 지금 자리를 알아야 하므로 장소를 쓰려 할 때 묻는다. 길찾기는 서버가 하므로 연결됐을 때만. */
  async function askLocation() {
    if (allowed !== null || !accessKey) return
    await requestWeatherPermission()
    const granted = await hasWeatherPermission()
    setAllowed(granted)
    if (granted) {
      currentPosition()
        .then(({ coords }) => setNear({ latitude: coords.latitude, longitude: coords.longitude }))
        .catch(console.warn)
    }
  }

  const showing = !at && query.length >= MIN_QUERY ? options : []
  return (
    <div className="place-field">
      {showing.length > 0 && (
        <ul className="place-options" aria-label="장소 후보">
          {showing.map((option) => (
            <li key={`${option.name}-${option.latitude}-${option.longitude}`}>
              <button
                type="button"
                // 누르는 사이 입력칸을 떠나 폼이 접히지 않게 한다.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(option.name, { latitude: option.latitude, longitude: option.longitude })
                  setOptions([])
                }}
              >
                {option.name}
                <small>{option.address}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        className="place"
        aria-label="장소"
        autoComplete="off"
        enterKeyHint="done"
        maxLength={100}
        placeholder="장소 (출발 알림)"
        value={value}
        onFocus={() => void askLocation()}
        onChange={(event) => onChange(event.target.value)}
      />
      {!accessKey && query && <small className="place-hint">서버에 연결하면 출발 알림을 받을 수 있어요.</small>}
      {allowed === false && <small className="place-hint">위치 권한을 켜야 출발 알림을 받을 수 있어요.</small>}
      {allowed !== false && query && !at && accessKey && (
        <small className="place-hint">목록에서 고르면 더 정확해요.</small>
      )}
    </div>
  )
}
