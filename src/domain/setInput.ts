import { isValidSetValues } from './gymData'

/** Parses a weight typed with either a decimal comma ("42,5") or a decimal point ("42.5"). */
export function parseWeightInput(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null

  const number = Number(normalized)
  return isValidSetValues(number, 1) ? number : null
}

/** Parses a whole number of repetitions. */
export function parseRepsInput(value: string): number | null {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) return null

  const number = Number(normalized)
  return isValidSetValues(0, number) ? number : null
}
