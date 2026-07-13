export const GYM_DATA_VERSION = 2 as const

export const MAX_NAME_LENGTH = 120
export const MAX_VIDEO_URL_LENGTH = 2_048
export const MAX_WEIGHT_KG = 2_000
export const MAX_REPS = 1_000
export const MAX_CATEGORIES = 100
export const MAX_EXERCISES_PER_CATEGORY = 500
export const MAX_HISTORY_ENTRIES_PER_EXERCISE = 5_000
export const MAX_SETS_PER_SESSION = 1_000

const MAX_ID_LENGTH = 128
const MAX_RECORDED_ISSUES = 50

export interface SetEntry {
  id: string
  weight: number
  reps: number
}

export interface WorkoutSession {
  date: string
  sets: SetEntry[]
}

export interface Exercise {
  id: string
  name: string
  videoUrl?: string
  history: WorkoutSession[]
}

export interface Category {
  id: string
  name: string
  exercises: Exercise[]
}

export interface GymDataEnvelope {
  app: 'GymBuddie'
  version: typeof GYM_DATA_VERSION
  updatedAt: string
  categories: Category[]
}

export interface GymDataExport extends GymDataEnvelope {
  exportedAt: string
}

export type GymDataParseResult =
  | {
      ok: true
      categories: Category[]
      issues: string[]
      migrated: boolean
      needsRewrite: boolean
    }
  | {
      ok: false
      error: string
    }

interface SanitizeContext {
  issues: string[]
  migrated: boolean
  needsRewrite: boolean
  categoryIds: Set<string>
  exerciseIds: Set<string>
  setIds: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordIssue(context: SanitizeContext, issue: string) {
  if (context.issues.length < MAX_RECORDED_ISSUES) context.issues.push(issue)
  context.needsRewrite = true
}

function padDatePart(value: number) {
  return value.toString().padStart(2, '0')
}

/** Returns a YYYY-MM-DD key using the device's local calendar, never UTC. */
export function toLocalDateKey(date = new Date()): string {
  return `${date.getFullYear().toString().padStart(4, '0')}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`
}

export function isCalendarDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1) return false

  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, isLeapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day <= (daysInMonth[month - 1] ?? 0)
}

export function isValidSetValues(weight: unknown, reps: unknown): boolean {
  return (
    typeof weight === 'number' &&
    Number.isFinite(weight) &&
    weight >= 0 &&
    weight <= MAX_WEIGHT_KG &&
    typeof reps === 'number' &&
    Number.isFinite(reps) &&
    Number.isInteger(reps) &&
    reps >= 1 &&
    reps <= MAX_REPS
  )
}

/**
 * Normalizes optional video URLs. An empty value becomes an empty string, while
 * invalid, non-HTTP(S), or overlong values return null.
 */
export function normalizeVideoUrl(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.length > MAX_VIDEO_URL_LENGTH) return null

  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.href
  } catch {
    return null
  }
}

export function createId(): string {
  const cryptoApi = globalThis.crypto
  if (!cryptoApi) {
    throw new Error('A secure random number generator is unavailable.')
  }

  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function normalizeImportedName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, MAX_NAME_LENGTH)
}

export function normalizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null
  return trimmed
}

function uniqueId(value: unknown, usedIds: Set<string>, context: SanitizeContext): string {
  const candidate =
    typeof value === 'string' && value.trim() && value.trim().length <= MAX_ID_LENGTH
      ? value.trim()
      : null

  if (candidate && !usedIds.has(candidate)) {
    usedIds.add(candidate)
    if (candidate !== value) context.needsRewrite = true
    return candidate
  }

  let generated = createId()
  while (usedIds.has(generated)) generated = createId()
  usedIds.add(generated)
  recordIssue(context, 'Eine fehlende oder doppelte ID wurde ersetzt.')
  return generated
}

function generatedUniqueId(usedIds: Set<string>): string {
  let generated = createId()
  while (usedIds.has(generated)) generated = createId()
  usedIds.add(generated)
  return generated
}

function sanitizeSet(value: unknown, context: SanitizeContext): SetEntry | null {
  if (!isRecord(value) || !isValidSetValues(value.weight, value.reps)) {
    recordIssue(context, 'Ein ungültiger Satz wurde übersprungen.')
    return null
  }

  return {
    id: uniqueId(value.id, context.setIds, context),
    weight: value.weight as number,
    reps: value.reps as number,
  }
}

function addSetsToSession(
  sessions: Map<string, SetEntry[]>,
  date: string,
  sets: SetEntry[],
  context: SanitizeContext,
) {
  if (sets.length === 0) return

  const existing = sessions.get(date) ?? []
  const availableSlots = MAX_SETS_PER_SESSION - existing.length
  if (availableSlots <= 0) {
    recordIssue(context, `Zusätzliche Sätze für ${date} wurden wegen des Limits übersprungen.`)
    return
  }

  if (sets.length > availableSlots) {
    recordIssue(context, `Zusätzliche Sätze für ${date} wurden wegen des Limits gekürzt.`)
  }
  sessions.set(date, existing.concat(sets.slice(0, availableSlots)))
}

function sanitizeHistory(value: unknown, context: SanitizeContext): WorkoutSession[] {
  if (!Array.isArray(value)) {
    recordIssue(context, 'Eine fehlende oder ungültige Trainingshistorie wurde ersetzt.')
    return []
  }

  if (value.length > MAX_HISTORY_ENTRIES_PER_EXERCISE) {
    recordIssue(context, 'Eine übergroße Trainingshistorie wurde gekürzt.')
  }

  const groupedSessions = new Map<string, SetEntry[]>()
  for (const sessionValue of value.slice(0, MAX_HISTORY_ENTRIES_PER_EXERCISE)) {
    if (!isRecord(sessionValue) || !isCalendarDateKey(sessionValue.date)) {
      recordIssue(context, 'Eine Trainingseinheit mit ungültigem Datum wurde übersprungen.')
      continue
    }

    if (Array.isArray(sessionValue.sets)) {
      const sanitizedSets: SetEntry[] = []
      const availableSlots =
        MAX_SETS_PER_SESSION - (groupedSessions.get(sessionValue.date)?.length ?? 0)
      if (availableSlots <= 0) {
        recordIssue(
          context,
          `Zusätzliche Sätze für ${sessionValue.date} wurden wegen des Limits übersprungen.`,
        )
        continue
      }
      if (sessionValue.sets.length > availableSlots) {
        recordIssue(
          context,
          `Eine übergroße Trainingseinheit für ${sessionValue.date} wurde gekürzt.`,
        )
      }
      for (const setValue of sessionValue.sets.slice(0, availableSlots)) {
        const sanitizedSet = sanitizeSet(setValue, context)
        if (sanitizedSet) sanitizedSets.push(sanitizedSet)
      }
      addSetsToSession(groupedSessions, sessionValue.date, sanitizedSets, context)
      continue
    }

    // Schema v1 stored one weight/repetition pair plus a numeric set count.
    if (typeof sessionValue.sets === 'number') {
      const setCount = sessionValue.sets
      context.migrated = true
      context.needsRewrite = true
      const availableSlots =
        MAX_SETS_PER_SESSION - (groupedSessions.get(sessionValue.date)?.length ?? 0)

      if (
        !Number.isInteger(setCount) ||
        setCount < 1 ||
        setCount > MAX_SETS_PER_SESSION ||
        !isValidSetValues(sessionValue.weight, sessionValue.reps)
      ) {
        recordIssue(context, 'Ein ungültiger Eintrag aus dem alten Datenformat wurde übersprungen.')
        continue
      }

      if (availableSlots <= 0) {
        recordIssue(
          context,
          `Zusätzliche Sätze für ${sessionValue.date} wurden wegen des Limits übersprungen.`,
        )
        continue
      }
      if (setCount > availableSlots) {
        recordIssue(context, `Alte Sätze für ${sessionValue.date} wurden wegen des Limits gekürzt.`)
      }

      const migratedSets = Array.from({ length: Math.min(setCount, availableSlots) }, () => ({
        id: generatedUniqueId(context.setIds),
        weight: sessionValue.weight as number,
        reps: sessionValue.reps as number,
      }))
      addSetsToSession(groupedSessions, sessionValue.date, migratedSets, context)
      continue
    }

    recordIssue(context, 'Eine Trainingseinheit mit ungültigen Sätzen wurde übersprungen.')
  }

  return Array.from(groupedSessions, ([date, sets]) => ({ date, sets })).sort((a, b) =>
    b.date.localeCompare(a.date),
  )
}

function sanitizeExercise(value: unknown, context: SanitizeContext): Exercise | null {
  if (!isRecord(value)) {
    recordIssue(context, 'Eine ungültige Übung wurde übersprungen.')
    return null
  }

  const name = normalizeImportedName(value.name)
  if (!name) {
    recordIssue(context, 'Eine Übung ohne gültigen Namen wurde übersprungen.')
    return null
  }
  if (name !== value.name) context.needsRewrite = true

  const videoUrl = normalizeVideoUrl(value.videoUrl)
  if (videoUrl === null) {
    recordIssue(context, `Ein ungültiger Video-Link bei „${name}“ wurde entfernt.`)
  } else if (videoUrl && videoUrl !== value.videoUrl) {
    context.needsRewrite = true
  }

  return {
    id: uniqueId(value.id, context.exerciseIds, context),
    name,
    ...(videoUrl ? { videoUrl } : {}),
    history: sanitizeHistory(value.history, context),
  }
}

function sanitizeCategory(value: unknown, context: SanitizeContext): Category | null {
  if (!isRecord(value)) {
    recordIssue(context, 'Eine ungültige Kategorie wurde übersprungen.')
    return null
  }

  const name = normalizeImportedName(value.name)
  if (!name) {
    recordIssue(context, 'Eine Kategorie ohne gültigen Namen wurde übersprungen.')
    return null
  }
  if (name !== value.name) context.needsRewrite = true

  const exercisesValue = Array.isArray(value.exercises) ? value.exercises : []
  if (!Array.isArray(value.exercises)) {
    recordIssue(context, `Die Übungen der Kategorie „${name}“ fehlten oder waren ungültig.`)
  }
  if (exercisesValue.length > MAX_EXERCISES_PER_CATEGORY) {
    recordIssue(context, `Die Kategorie „${name}“ wurde wegen des Übungslimits gekürzt.`)
  }

  const exercises: Exercise[] = []
  for (const exerciseValue of exercisesValue.slice(0, MAX_EXERCISES_PER_CATEGORY)) {
    const exercise = sanitizeExercise(exerciseValue, context)
    if (exercise) exercises.push(exercise)
  }

  return {
    id: uniqueId(value.id, context.categoryIds, context),
    name,
    exercises,
  }
}

export function sanitizeCategories(value: unknown): {
  categories: Category[]
  issues: string[]
  migrated: boolean
  needsRewrite: boolean
} {
  const context: SanitizeContext = {
    issues: [],
    migrated: false,
    needsRewrite: false,
    categoryIds: new Set(),
    exerciseIds: new Set(),
    setIds: new Set(),
  }

  if (!Array.isArray(value)) {
    return {
      categories: [],
      issues: ['Die gespeicherten Kategorien waren ungültig.'],
      migrated: false,
      needsRewrite: true,
    }
  }

  if (value.length > MAX_CATEGORIES) {
    recordIssue(context, 'Die Kategorien wurden wegen des Limits gekürzt.')
  }

  const categories: Category[] = []
  for (const categoryValue of value.slice(0, MAX_CATEGORIES)) {
    const category = sanitizeCategory(categoryValue, context)
    if (category) categories.push(category)
  }

  return {
    categories,
    issues: context.issues,
    migrated: context.migrated,
    needsRewrite: context.needsRewrite,
  }
}

export function parseGymData(serialized: string): GymDataParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return { ok: false, error: 'Die Datei enthält kein gültiges JSON.' }
  }

  let categoryValue: unknown
  let envelopeNeedsRewrite = false
  let unwrappedLegacyData = false

  if (Array.isArray(parsed)) {
    categoryValue = parsed
    envelopeNeedsRewrite = true
    unwrappedLegacyData = true
  } else if (isRecord(parsed)) {
    if ('version' in parsed && parsed.version !== GYM_DATA_VERSION) {
      return { ok: false, error: `Datenversion ${String(parsed.version)} wird nicht unterstützt.` }
    }
    if (!('categories' in parsed) || !Array.isArray(parsed.categories)) {
      return { ok: false, error: 'Die Datei enthält keine gültige Kategorienliste.' }
    }
    categoryValue = parsed.categories
    envelopeNeedsRewrite = parsed.version !== GYM_DATA_VERSION
  } else {
    return { ok: false, error: 'Das Datenformat wird nicht unterstützt.' }
  }

  try {
    const sanitized = sanitizeCategories(categoryValue)
    return {
      ok: true,
      categories: sanitized.categories,
      issues: sanitized.issues,
      migrated: unwrappedLegacyData || sanitized.migrated,
      needsRewrite: envelopeNeedsRewrite || sanitized.needsRewrite || sanitized.migrated,
    }
  } catch {
    return { ok: false, error: 'Die Daten konnten nicht sicher verarbeitet werden.' }
  }
}

export function createGymDataEnvelope(
  categories: Category[],
  updatedAt = new Date().toISOString(),
): GymDataEnvelope {
  return {
    app: 'GymBuddie',
    version: GYM_DATA_VERSION,
    updatedAt,
    categories,
  }
}

export function serializeGymData(categories: Category[]): string {
  return JSON.stringify(createGymDataEnvelope(categories))
}

export function createGymDataExport(
  categories: Category[],
  exportedAt = new Date().toISOString(),
): GymDataExport {
  return {
    ...createGymDataEnvelope(categories, exportedAt),
    exportedAt,
  }
}
