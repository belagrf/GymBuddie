import { describe, expect, it } from 'vitest'

import { formatDateKey, formatWeight, formatWeightInput } from '@/domain/format'
import { parseRepsInput, parseWeightInput } from '@/domain/setInput'

describe('set input parsing', () => {
  it.each([
    ['42,5', 42.5],
    ['42.5', 42.5],
    [' 60 ', 60],
    ['0', 0],
    [',5', 0.5],
    ['12,', 12],
    ['2000', 2000],
  ])('parses the weight %j', (input, expected) => {
    expect(parseWeightInput(input)).toBe(expected)
  })

  it.each(['', '  ', '-5', '1e3', '2000,5', '1,000,5', 'abc', 'NaN', 'Infinity', '12 5'])(
    'rejects the weight %j',
    (input) => {
      expect(parseWeightInput(input)).toBeNull()
    },
  )

  it.each([
    ['8', 8],
    [' 12 ', 12],
    ['1000', 1000],
  ])('parses the repetitions %j', (input, expected) => {
    expect(parseRepsInput(input)).toBe(expected)
  })

  it.each(['', '0', '1001', '8,5', '8.0', '-1', 'zehn'])('rejects the repetitions %j', (input) => {
    expect(parseRepsInput(input)).toBeNull()
  })
})

describe('German formatting', () => {
  it('formats weights with a decimal comma and thousands separator', () => {
    expect(formatWeight(62.5)).toBe('62,5')
    expect(formatWeight(60)).toBe('60')
    expect(formatWeight(1250.25)).toBe('1.250,25')
    expect(formatWeight(0.125)).toBe('0,125')
  })

  it('formats weights for inputs without a thousands separator', () => {
    expect(formatWeightInput(1250.25)).toBe('1250,25')
    expect(formatWeightInput(60)).toBe('60')
  })

  it('formats date keys as German calendar dates', () => {
    expect(formatDateKey('2026-07-03')).toBe('03.07.2026')
    // Year 99 stays year 99 instead of being mapped to 1999.
    expect(formatDateKey('0099-01-02')).toBe('02.01.99')
    expect(formatDateKey('not-a-date')).toBe('not-a-date')
  })
})
