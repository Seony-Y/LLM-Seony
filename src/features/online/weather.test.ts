import { expect, test } from 'vitest'
import { skyOf } from './weather'

test.each([
  [0, 'sun'], [1, 'sun'], [2, 'cloud'], [3, 'cloud'], [45, 'cloud'],
  [51, 'rain'], [65, 'rain'], [71, 'snow'], [77, 'snow'], [80, 'rain'], [86, 'snow'], [95, 'rain'],
])('날씨 코드 %i는 %s', (code, sky) => expect(skyOf(code)).toBe(sky))
