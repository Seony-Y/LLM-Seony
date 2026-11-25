import { Geolocation } from '@capacitor/geolocation'
import { localDate } from '../assistant/speech'
import { findPlace } from './place'

export type Sky = 'sun' | 'moon' | 'cloud' | 'snow' | 'rain'

export interface DayForecast {
  date: string
  sky: Sky
  low: number
  high: number
  rainAt: Date | null
}

export interface TodayWeather {
  sky: Sky
  isDay: boolean
  /** 동 이름. 알 수 없으면 빈 문자열. */
  place: string
  temperature: number
  rainAt: Date | null
  /** 오늘부터 하루씩. */
  days?: DayForecast[]
}

interface OpenMeteoResponse {
  current: { temperature_2m: number; weather_code: number; is_day: number }
  hourly: { time: number[]; weather_code: number[] }
  daily: {
    time: number[]
    weather_code: number[]
    temperature_2m_min: number[]
    temperature_2m_max: number[]
  }
}

const HOUR = 3_600_000

function isRain(code: number) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
}

/** WMO 날씨 코드를 하늘 모양으로 나눈다. */
export function skyOf(code: number, isDay = true): Sky {
  if (isRain(code)) return 'rain'
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow'
  if (code > 1) return 'cloud'
  return isDay ? 'sun' : 'moon'
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
    await Geolocation.requestPermissions({ permissions: ['location'] })
  } catch {
    // 웹은 위치를 읽을 때 브라우저가 묻는다.
  }
}

export async function getTodayWeather(now = new Date()): Promise<TodayWeather> {
  const position = await currentPosition()
  const params = new URLSearchParams({
    latitude: position.coords.latitude.toFixed(2),
    longitude: position.coords.longitude.toFixed(2),
    current: 'temperature_2m,weather_code,is_day',
    hourly: 'weather_code',
    daily: 'weather_code,temperature_2m_min,temperature_2m_max',
    forecast_days: '7',
    timeformat: 'unixtime',
    timezone: 'auto',
  })
  const [response, place] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${params}`).catch(() => null),
    findPlace(position.coords),
  ])
  if (!response?.ok) throw new Error('날씨 서버에서 응답을 받지 못했습니다.')

  const data = (await response.json()) as OpenMeteoResponse
  const rainBetween = (from: number, to: number) => {
    const index = data.hourly.time.findIndex((time, hour) => {
      const at = time * 1000
      return at + HOUR > from && at < to && isRain(data.hourly.weather_code[hour])
    })
    return index < 0 ? null : new Date(data.hourly.time[index] * 1000)
  }
  return {
    sky: skyOf(data.current.weather_code, data.current.is_day === 1),
    isDay: data.current.is_day === 1,
    place,
    temperature: Math.round(data.current.temperature_2m),
    rainAt: rainBetween(now.getTime(), new Date(now).setHours(24, 0, 0, 0)),
    days: data.daily.time.map((time, index) => {
      const start = time * 1000
      return {
        date: localDate(new Date(start)),
        sky: skyOf(data.daily.weather_code[index]),
        low: Math.round(data.daily.temperature_2m_min[index]),
        high: Math.round(data.daily.temperature_2m_max[index]),
        rainAt: rainBetween(Math.max(start, now.getTime()), new Date(start).setHours(24, 0, 0, 0)),
      }
    }),
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
