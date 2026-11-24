import { Geolocation } from '@capacitor/geolocation'

export type Sky = 'sun' | 'cloud' | 'snow' | 'rain'

export interface TodayWeather {
  sky: Sky
  temperature: number
  rainAt: Date | null
}

interface OpenMeteoResponse {
  current: { temperature_2m: number; weather_code: number }
  hourly: { time: number[]; weather_code: number[] }
}

const HOUR = 3_600_000

function isRain(code: number) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
}

/** WMO 날씨 코드를 하늘 모양으로 나눈다. */
export function skyOf(code: number): Sky {
  if (isRain(code)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  return code <= 1 ? 'sun' : 'cloud'
}

export async function hasWeatherPermission(): Promise<boolean> {
  try {
    const permission = await Geolocation.checkPermissions()
    return permission.coarseLocation === 'granted' || permission.location === 'granted'
  } catch {
    return false
  }
}

/** 사용자가 날씨를 켤 때만 부른다. */
export async function requestWeatherPermission(): Promise<void> {
  try {
    await Geolocation.requestPermissions({ permissions: ['coarseLocation'] })
  } catch {
    // 웹은 위치를 읽을 때 브라우저가 묻는다.
  }
}

export async function getTodayWeather(now = new Date()): Promise<TodayWeather> {
  const position = await currentPosition()
  const params = new URLSearchParams({
    latitude: position.coords.latitude.toFixed(2),
    longitude: position.coords.longitude.toFixed(2),
    current: 'temperature_2m,weather_code',
    hourly: 'weather_code',
    forecast_days: '2',
    timeformat: 'unixtime',
    timezone: 'auto',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`).catch(() => null)
  if (!response?.ok) throw new Error('날씨 서버에서 응답을 받지 못했습니다.')

  const data = (await response.json()) as OpenMeteoResponse
  const endOfDay = new Date(now).setHours(24, 0, 0, 0)
  const rainIndex = data.hourly.time.findIndex((time, index) => {
    const at = time * 1000
    return at + HOUR > now.getTime() && at < endOfDay && isRain(data.hourly.weather_code[index])
  })
  return {
    sky: skyOf(data.current.weather_code),
    temperature: Math.round(data.current.temperature_2m),
    rainAt: rainIndex < 0 ? null : new Date(data.hourly.time[rainIndex] * 1000),
  }
}

async function currentPosition() {
  try {
    return await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      maximumAge: HOUR / 2,
      timeout: 15_000,
    })
  } catch (cause) {
    console.error(cause)
    throw new Error('위치를 확인하지 못했어요. 위치 권한과 기기의 위치 설정을 켜주세요.', { cause })
  }
}
