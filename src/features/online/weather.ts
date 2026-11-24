import { Geolocation } from '@capacitor/geolocation'

export interface TodayWeather {
  temperature: number
  rainAt: Date | null
}

interface OpenMeteoResponse {
  current: { temperature_2m: number }
  hourly: { time: number[]; weather_code: number[] }
}

const HOUR = 3_600_000

function isRain(code: number) {
  return (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95
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
  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    maximumAge: HOUR / 2,
    timeout: 15_000,
  })
  const params = new URLSearchParams({
    latitude: position.coords.latitude.toFixed(2),
    longitude: position.coords.longitude.toFixed(2),
    current: 'temperature_2m',
    hourly: 'weather_code',
    forecast_days: '2',
    timeformat: 'unixtime',
    timezone: 'auto',
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!response.ok) throw new Error('날씨 서버에서 응답을 받지 못했습니다.')

  const data = (await response.json()) as OpenMeteoResponse
  const endOfDay = new Date(now).setHours(24, 0, 0, 0)
  const rainIndex = data.hourly.time.findIndex((time, index) => {
    const at = time * 1000
    return at + HOUR > now.getTime() && at < endOfDay && isRain(data.hourly.weather_code[index])
  })
  return {
    temperature: Math.round(data.current.temperature_2m),
    rainAt: rainIndex < 0 ? null : new Date(data.hourly.time[rainIndex] * 1000),
  }
}
