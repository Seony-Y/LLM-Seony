import { expect, test } from 'vitest'
import { placeName } from './place'
import { skyOf } from './weather'

test.each([
  [0, 'sun'], [1, 'sun'], [2, 'cloud'], [3, 'cloud'], [45, 'cloud'],
  [51, 'rain'], [65, 'rain'], [71, 'snow'], [77, 'snow'], [80, 'rain'], [86, 'snow'], [95, 'rain'],
])('날씨 코드 %i는 %s', (code, sky) => expect(skyOf(code)).toBe(sky))

test('맑은 밤은 달', () => {
  expect(skyOf(0, false)).toBe('moon')
  expect(skyOf(3, false)).toBe('cloud')
})

test.each([
  [{ suburb: '역삼1동', borough: '강남구', city: '서울특별시' }, '역삼1동'],
  [{ quarter: '보람동', village: '신촌리' }, '보람동'],
  [{ town: '가평읍', city: '가평군' }, '가평읍'],
  [{ suburb: 'Gangnam', borough: '강남구' }, '강남구'],
  [{}, ''],
])('동 이름 %o', (address, place) => expect(placeName(address)).toBe(place))
