const dateFormatter = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const weightFormatter = new Intl.NumberFormat('de-DE', {
  maximumFractionDigits: 3,
})

/** Formats a YYYY-MM-DD key as a German calendar date (24.10.2026). */
export function formatDateKey(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined) return dateKey

  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return dateKey
  // Years 0–99 would otherwise be mapped to 1900–1999.
  date.setFullYear(year)

  return dateFormatter.format(date)
}

/** Formats a weight with a decimal comma, matching how weights are typed. */
export function formatWeight(weight: number): string {
  return weightFormatter.format(weight)
}

/** Formats a weight for an input field: decimal comma, no thousands separator. */
export function formatWeightInput(weight: number): string {
  return String(weight).replace('.', ',')
}
