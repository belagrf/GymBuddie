export const GYM_DATA_VERSION = 2 as const

export const MAX_NAME_LENGTH = 120
export const MAX_VIDEO_URL_LENGTH = 2_048
export const MAX_WEIGHT_KG = 2_000
export const MAX_REPS = 1_000
export const MAX_CATEGORIES = 100
export const MAX_EXERCISES_PER_CATEGORY = 500
export const MAX_HISTORY_ENTRIES_PER_EXERCISE = 5_000
export const MAX_SETS_PER_SESSION = 1_000
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024

const MAX_RECORDED_ISSUES = 50

// IDs end up in DOM ids, ARIA references, and lookup keys, so only a conservative charset is kept.
const SAFE_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/
const RESERVED_IDS = new Set(['__proto__', 'constructor', 'prototype'])

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

export type GymDataParseFailureReason = 'invalid-json' | 'unsupported-version' | 'invalid-format'

export type GymDataParseResult =
  | {
      ok: true
      categories: Category[]
      issues: string[]
      skipped: number
      migrated: boolean
      needsRewrite: boolean
    }
  | {
      ok: false
      reason: GymDataParseFailureReason
      error: string
    }

export interface GymDataSummary {
  categories: number
  exercises: number
  sets: number
}

export type BackupParseResult =
  | {
      ok: true
      categories: Category[]
      issues: string[]
      /** Entries dropped while reading; `issues` also lists corrections that lost nothing. */
      skipped: number
      summary: GymDataSummary
      /** When the data was exported or last saved, if the file says so. */
      savedAt: string | null
    }
  | {
      ok: false
      error: string
    }

interface SanitizeContext {
  issues: string[]
  /** Entries (categories, exercises, sessions, sets) that were dropped, not just corrected. */
  skipped: number
  migrated: boolean
  needsRewrite: boolean
  categoryIds: Set<string>
  exerciseIds: Set<string>
  setIds: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordIssue(context: SanitizeContext, issue: string, skippedEntries = 0) {
  if (context.issues.length < MAX_RECORDED_ISSUES) context.issues.push(issue)
  context.skipped += skippedEntries
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

const URL_SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i

/**
 * Normalizes optional video URLs. An empty value becomes an empty string, while
 * invalid, non-HTTP(S), or overlong values return null. Inputs without a scheme
 * whose host contains a dot (for example `youtube.com/watch?v=…`) get `https://`.
 */
export function normalizeVideoUrl(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return ''

  // "youtube.com:443/x" parses as scheme "youtube.com:", so a dotted prefix is a host, not a scheme.
  const scheme = URL_SCHEME_PATTERN.exec(trimmed)?.[1]
  const hasScheme = scheme !== undefined && !scheme.includes('.')

  try {
    const url = new URL(hasScheme ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    // Without a typed scheme, require a real host name: "42" would otherwise become 0.0.0.42.
    if (!hasScheme && (!url.hostname.includes('.') || !/[a-z]/i.test(url.hostname))) return null
    // Check the canonical form: percent-encoding can make it longer than the input.
    return url.href.length <= MAX_VIDEO_URL_LENGTH ? url.href : null
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

export function isSafeId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID_PATTERN.test(value) && !RESERVED_IDS.has(value)
}

function uniqueId(value: unknown, usedIds: Set<string>, context: SanitizeContext): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''

  if (isSafeId(trimmed) && !usedIds.has(trimmed)) {
    usedIds.add(trimmed)
    if (trimmed !== value) context.needsRewrite = true
    return trimmed
  }

  const generated = generatedUniqueId(usedIds)
  if (trimmed && !isSafeId(trimmed)) {
    // An ID with unusual characters is replaced silently; no training data is lost.
    context.needsRewrite = true
  } else {
    recordIssue(context, 'Eine fehlende oder doppelte ID wurde ersetzt.')
  }
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
    recordIssue(context, 'Ein ungültiger Satz wurde übersprungen.', 1)
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
    recordIssue(
      context,
      `Zusätzliche Sätze für ${date} wurden wegen des Limits übersprungen.`,
      sets.length,
    )
    return
  }

  if (sets.length > availableSlots) {
    recordIssue(
      context,
      `Zusätzliche Sätze für ${date} wurden wegen des Limits gekürzt.`,
      sets.length - availableSlots,
    )
  }
  sessions.set(date, existing.concat(sets.slice(0, availableSlots)))
}

function sanitizeHistory(value: unknown, context: SanitizeContext): WorkoutSession[] {
  if (!Array.isArray(value)) {
    recordIssue(context, 'Eine fehlende oder ungültige Trainingshistorie wurde ersetzt.')
    return []
  }

  if (value.length > MAX_HISTORY_ENTRIES_PER_EXERCISE) {
    recordIssue(
      context,
      'Eine übergroße Trainingshistorie wurde gekürzt.',
      value.length - MAX_HISTORY_ENTRIES_PER_EXERCISE,
    )
  }

  const groupedSessions = new Map<string, SetEntry[]>()
  for (const sessionValue of value.slice(0, MAX_HISTORY_ENTRIES_PER_EXERCISE)) {
    if (!isRecord(sessionValue) || !isCalendarDateKey(sessionValue.date)) {
      recordIssue(context, 'Eine Trainingseinheit mit ungültigem Datum wurde übersprungen.', 1)
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
          sessionValue.sets.length,
        )
        continue
      }
      if (sessionValue.sets.length > availableSlots) {
        recordIssue(
          context,
          `Eine übergroße Trainingseinheit für ${sessionValue.date} wurde gekürzt.`,
          sessionValue.sets.length - availableSlots,
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
        recordIssue(
          context,
          'Ein ungültiger Eintrag aus dem alten Datenformat wurde übersprungen.',
          1,
        )
        continue
      }

      if (availableSlots <= 0) {
        recordIssue(
          context,
          `Zusätzliche Sätze für ${sessionValue.date} wurden wegen des Limits übersprungen.`,
          setCount,
        )
        continue
      }
      if (setCount > availableSlots) {
        recordIssue(
          context,
          `Alte Sätze für ${sessionValue.date} wurden wegen des Limits gekürzt.`,
          setCount - availableSlots,
        )
      }

      const migratedSets = Array.from({ length: Math.min(setCount, availableSlots) }, () => ({
        id: generatedUniqueId(context.setIds),
        weight: sessionValue.weight as number,
        reps: sessionValue.reps as number,
      }))
      addSetsToSession(groupedSessions, sessionValue.date, migratedSets, context)
      continue
    }

    recordIssue(context, 'Eine Trainingseinheit mit ungültigen Sätzen wurde übersprungen.', 1)
  }

  return Array.from(groupedSessions, ([date, sets]) => ({ date, sets })).sort((a, b) =>
    b.date.localeCompare(a.date),
  )
}

function sanitizeExercise(value: unknown, context: SanitizeContext): Exercise | null {
  if (!isRecord(value)) {
    recordIssue(context, 'Eine ungültige Übung wurde übersprungen.', 1)
    return null
  }

  const name = normalizeImportedName(value.name)
  if (!name) {
    recordIssue(context, 'Eine Übung ohne gültigen Namen wurde übersprungen.', 1)
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
    recordIssue(context, 'Eine ungültige Kategorie wurde übersprungen.', 1)
    return null
  }

  const name = normalizeImportedName(value.name)
  if (!name) {
    recordIssue(context, 'Eine Kategorie ohne gültigen Namen wurde übersprungen.', 1)
    return null
  }
  if (name !== value.name) context.needsRewrite = true

  const exercisesValue = Array.isArray(value.exercises) ? value.exercises : []
  if (!Array.isArray(value.exercises)) {
    recordIssue(context, `Die Übungen der Kategorie „${name}“ fehlten oder waren ungültig.`)
  }
  if (exercisesValue.length > MAX_EXERCISES_PER_CATEGORY) {
    recordIssue(
      context,
      `Die Kategorie „${name}“ wurde wegen des Übungslimits gekürzt.`,
      exercisesValue.length - MAX_EXERCISES_PER_CATEGORY,
    )
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
  skipped: number
  migrated: boolean
  needsRewrite: boolean
} {
  const context: SanitizeContext = {
    issues: [],
    skipped: 0,
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
      skipped: 0,
      migrated: false,
      needsRewrite: true,
    }
  }

  if (value.length > MAX_CATEGORIES) {
    recordIssue(
      context,
      'Die Kategorien wurden wegen des Limits gekürzt.',
      value.length - MAX_CATEGORIES,
    )
  }

  const categories: Category[] = []
  for (const categoryValue of value.slice(0, MAX_CATEGORIES)) {
    const category = sanitizeCategory(categoryValue, context)
    if (category) categories.push(category)
  }

  return {
    categories,
    issues: context.issues,
    skipped: context.skipped,
    migrated: context.migrated,
    needsRewrite: context.needsRewrite,
  }
}

export function parseGymData(serialized: string): GymDataParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return { ok: false, reason: 'invalid-json', error: 'Die Datei enthält kein gültiges JSON.' }
  }
  return parseGymValue(parsed)
}

function parseGymValue(parsed: unknown): GymDataParseResult {
  let categoryValue: unknown
  let envelopeNeedsRewrite = false
  let unwrappedLegacyData = false

  if (Array.isArray(parsed)) {
    categoryValue = parsed
    envelopeNeedsRewrite = true
    unwrappedLegacyData = true
  } else if (isRecord(parsed)) {
    if ('version' in parsed && parsed.version !== GYM_DATA_VERSION) {
      // Only a genuinely newer version locks writes; anything else is simply damaged data.
      if (
        typeof parsed.version === 'number' &&
        Number.isInteger(parsed.version) &&
        parsed.version > GYM_DATA_VERSION
      ) {
        return {
          ok: false,
          reason: 'unsupported-version',
          error: `Datenversion ${parsed.version} wird nicht unterstützt. Bitte aktualisiere GymBuddie.`,
        }
      }
      return {
        ok: false,
        reason: 'invalid-format',
        error: 'Die Datenversion ist ungültig.',
      }
    }
    if (!('categories' in parsed) || !Array.isArray(parsed.categories)) {
      return {
        ok: false,
        reason: 'invalid-format',
        error: 'Die Datei enthält keine gültige Kategorienliste.',
      }
    }
    categoryValue = parsed.categories
    envelopeNeedsRewrite = parsed.version !== GYM_DATA_VERSION
  } else {
    return { ok: false, reason: 'invalid-format', error: 'Das Datenformat wird nicht unterstützt.' }
  }

  try {
    const sanitized = sanitizeCategories(categoryValue)
    return {
      ok: true,
      categories: sanitized.categories,
      issues: sanitized.issues,
      skipped: sanitized.skipped,
      migrated: unwrappedLegacyData || sanitized.migrated,
      needsRewrite: envelopeNeedsRewrite || sanitized.needsRewrite || sanitized.migrated,
    }
  } catch {
    return {
      ok: false,
      reason: 'invalid-format',
      error: 'Die Daten konnten nicht sicher verarbeitet werden.',
    }
  }
}

export function summarizeCategories(categories: Category[]): GymDataSummary {
  let exercises = 0
  let sets = 0
  for (const category of categories) {
    exercises += category.exercises.length
    for (const exercise of category.exercises) {
      for (const session of exercise.history) sets += session.sets.length
    }
  }
  return { categories: categories.length, exercises, sets }
}

function savedAtOf(parsed: unknown): string | null {
  if (!isRecord(parsed)) return null
  for (const value of [parsed.exportedAt, parsed.updatedAt]) {
    if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return value
  }
  return null
}

function toBackupResult(parsed: unknown): BackupParseResult {
  const result = parseGymValue(parsed)
  if (!result.ok) return { ok: false, error: result.error }
  if (result.categories.length === 0) {
    return { ok: false, error: 'Das Backup enthält keine verwendbaren Trainingsdaten.' }
  }

  return {
    ok: true,
    categories: result.categories,
    issues: result.issues,
    skipped: result.skipped,
    summary: summarizeCategories(result.categories),
    savedAt: savedAtOf(parsed),
  }
}

/**
 * Parses a backup file chosen by the user. Unlike stored data, a file must carry the
 * GymBuddie envelope and contain at least one usable category, so picking the wrong
 * JSON file can never replace the training data with nothing.
 */
export function parseBackupFile(serialized: string): BackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return { ok: false, error: 'Die Datei enthält kein gültiges JSON.' }
  }

  if (!isRecord(parsed) || parsed.app !== 'GymBuddie') {
    return { ok: false, error: 'Die Datei ist kein GymBuddie-Backup.' }
  }
  return toBackupResult(parsed)
}

/**
 * A cheap check for listing recovery copies: whether a copy looks restorable and when its
 * data was saved. The full validation runs when the user actually restores it.
 */
export function inspectRecoveryCopy(serialized: string): {
  savedAt: string | null
  restorable: boolean
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return { savedAt: null, restorable: false }
  }

  const categories = Array.isArray(parsed) ? parsed : isRecord(parsed) ? parsed.categories : null
  const supportedVersion =
    !isRecord(parsed) || !('version' in parsed) || parsed.version === GYM_DATA_VERSION
  return {
    savedAt: savedAtOf(parsed),
    restorable: Array.isArray(categories) && categories.length > 0 && supportedVersion,
  }
}

/**
 * Parses a recovery copy GymBuddie stored itself. These may hold the legacy array format,
 * so they follow the stored-data rules, but restoring still needs at least one category.
 */
export function parseRecoveryCopy(serialized: string): BackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return { ok: false, error: 'Die Kopie enthält kein gültiges JSON.' }
  }
  return toBackupResult(parsed)
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
