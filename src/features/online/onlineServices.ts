import { Browser } from '@capacitor/browser'
import { Geolocation } from '@capacitor/geolocation'

export interface CurrentWeather {
  temperature: number
  apparentTemperature: number
  humidity: number
  windSpeed: number
  description: string
  observedAt: string
}

interface OpenMeteoResponse {
  current: {
    apparent_temperature: number
    interval: number
    relative_humidity_2m: number
    temperature_2m: number
    time: string
    weather_code: number
    wind_speed_10m: number
  }
}

export async function openWebSearch(query: string): Promise<void> {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) throw new Error('검색어를 입력해 주세요.')

  await Browser.open({
    url: `https://duckduckgo.com/?q=${encodeURIComponent(normalizedQuery)}`,
  })
}

export async function getCurrentWeather(): Promise<CurrentWeather> {
  let permission = await Geolocation.checkPermissions()
  if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
    permission = await Geolocation.requestPermissions({ permissions: ['coarseLocation'] })
  }
  if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
    throw new Error('현재 날씨를 확인하려면 위치 권한이 필요합니다.')
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: false,
    maximumAge: 5 * 60 * 1000,
    timeout: 15_000,
  })
  const params = new URLSearchParams({
    latitude: String(position.coords.latitude),
    longitude: String(position.coords.longitude),
    current: [
      'temperature_2m',
      'relative_humidity_2m',
      'apparent_temperature',
      'weather_code',
      'wind_speed_10m',
    ].join(','),
    timezone: 'auto',
  })

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  if (!response.ok) throw new Error('날씨 서버에서 응답을 받지 못했습니다.')

  const data = (await response.json()) as OpenMeteoResponse
  return {
    temperature: data.current.temperature_2m,
    apparentTemperature: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    windSpeed: data.current.wind_speed_10m,
    description: weatherDescription(data.current.weather_code),
    observedAt: data.current.time,
  }
}

function weatherDescription(code: number) {
  if (code === 0) return '맑음'
  if (code <= 3) return '구름 많음'
  if (code === 45 || code === 48) return '안개'
  if (code <= 57) return '이슬비'
  if (code <= 67) return '비'
  if (code <= 77) return '눈'
  if (code <= 82) return '소나기'
  if (code <= 86) return '눈 소나기'
  return '뇌우'
}