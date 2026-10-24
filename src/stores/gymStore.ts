import { defineStore } from 'pinia'
import { onScopeDispose, ref, toRaw } from 'vue'

import {
  MAX_CATEGORIES,
  MAX_EXERCISES_PER_CATEGORY,
  MAX_HISTORY_ENTRIES_PER_EXERCISE,
  MAX_NAME_LENGTH,
  MAX_REPS,
  MAX_SETS_PER_SESSION,
  MAX_WEIGHT_KG,
  createGymDataExport,
  createId,
  isValidSetValues,
  normalizeName,
  normalizeVideoUrl,
  parseBackupFile,
  parseGymData,
  serializeGymData,
  toLocalDateKey,
  type BackupParseResult,
  type Category,
  type Exercise,
  type GymDataSummary,
  type SetEntry,
  type WorkoutSession,
} from '@/domain/gymData'

export type { Category, Exercise, SetEntry, WorkoutSession } from '@/domain/gymData'
export {
  MAX_NAME_LENGTH,
  MAX_REPS,
  MAX_WEIGHT_KG,
  isValidSetValues,
  normalizeVideoUrl,
  toLocalDateKey,
} from '@/domain/gymData'

export const GYM_STORAGE_KEY = 'gymbuddie:data:v2'
export const LEGACY_STORAGE_KEY = 'gymData'
export const LEGACY_BACKUP_KEY = 'gymbuddie:backup:gymData:v1'
export const RECOVERY_BACKUP_KEY = 'gymbuddie:backup:invalid-data:v2'
export const PRE_IMPORT_BACKUP_KEY = 'gymbuddie:backup:before-import:v2'
export const LAST_EXPORT_KEY = 'gymbuddie:meta:last-export'

const BACKUP_KEY_PREFIX = 'gymbuddie:backup:'
const MAX_COPIES_PER_BACKUP = 3

export type PersistenceStatus = 'ready' | 'saved' | 'synced' | 'error'

/**
 * Why writes are refused: `unpreserved-data` means stored data could not be read or fully
 * sanitized and no recovery copy fit into storage; `newer-version` means another app
 * version wrote a format this one does not understand.
 */
export type WriteBlockReason = 'unpreserved-data' | 'newer-version'

export type ActionResult = { ok: true } | { ok: false; error: string }

export type ImportResult =
  | { ok: true; summary: GymDataSummary; skipped: number; snapshotSaved: boolean }
  | { ok: false; error: string }

export interface RecoveryCopy {
  key: string
  label: string
  size: number
}

const STORAGE_UNAVAILABLE =
  'Lokaler Speicher ist in diesem Browser nicht verfügbar. Änderungen gehen beim Schließen verloren.'
const NOT_FOUND =
  'Der Eintrag wurde nicht gefunden. Möglicherweise wurde er in einem anderen Tab gelöscht.'
const CONFLICT =
  'In einem anderen Tab wurden die Daten geändert. Die aktuelle Version wurde geladen – bitte wiederhole die Eingabe.'
const INVALID_NAME = `Gib einen Namen mit höchstens ${MAX_NAME_LENGTH} Zeichen ein.`
const INVALID_URL = 'Der Link muss eine gültige HTTP- oder HTTPS-Adresse sein.'
const INVALID_SET = `Gib ein Gewicht von 0 bis ${MAX_WEIGHT_KG.toLocaleString('de-DE')} kg und ganze Wiederholungen von 1 bis ${MAX_REPS.toLocaleString('de-DE')} ein.`

export function writeBlockMessage(reason: WriteBlockReason): string {
  return reason === 'newer-version'
    ? 'Deine Daten wurden mit einer neueren GymBuddie-Version gespeichert. Bitte lade die App neu, damit sie sich aktualisiert. Bis dahin werden keine Änderungen gespeichert.'
    : 'Gespeicherte Daten konnten nicht gelesen werden, und für eine Sicherungskopie war kein Platz. Lade die Rohdaten unter „Daten sichern“ herunter oder verwirf sie – bis dahin werden keine Änderungen gespeichert.'
}

interface InitialData {
  categories: Category[]
  status: PersistenceStatus
  error: string | null
  storage: Storage | null
  knownRaw: string | null
  writeBlock: WriteBlockReason | null
}

function isQuotaError(error: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  )
}

function errorMessage(error: unknown): string {
  if (isQuotaError(error)) {
    return 'Der Gerätespeicher ist voll. Exportiere ein Backup und lösche nicht mehr benötigte Wiederherstellungskopien unter „Daten sichern“.'
  }
  return 'Die Änderung konnte auf diesem Gerät nicht gespeichert werden.'
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function backupSlots(baseKey: string): string[] {
  return Array.from({ length: MAX_COPIES_PER_BACKUP }, (_, index) =>
    index === 0 ? baseKey : `${baseKey}:${index + 1}`,
  )
}

/**
 * Stores an exact raw payload in the first free slot of a bounded backup family. Returns
 * true only if this payload is now preserved, either freshly written or already present.
 */
function preserveRawBackup(storage: Storage, baseKey: string, rawData: string): boolean {
  try {
    for (const key of backupSlots(baseKey)) {
      const existing = storage.getItem(key)
      if (existing === rawData) return true
      if (existing === null) {
        storage.setItem(key, rawData)
        return true
      }
    }
  } catch {
    // Treated as "not preserved" below.
  }
  return false
}

function describeBackupKey(key: string): string {
  const match = /^(.*?)(?::(\d+))?$/.exec(key)
  const baseKey = match?.[1] ?? key
  const suffix = match?.[2] ? ` (${match[2]})` : ''

  switch (baseKey) {
    case LEGACY_BACKUP_KEY:
      return `Originaldaten vor der Umstellung auf das neue Speicherformat${suffix}`
    case RECOVERY_BACKUP_KEY:
      return `Unveränderte Kopie beschädigter oder bereinigter Daten${suffix}`
    case PRE_IMPORT_BACKUP_KEY:
      return `Datenstand vor dem letzten Import${suffix}`
    default:
      return `Sicherungskopie${suffix}`
  }
}

function loadLegacyData(
  storage: Storage,
  legacyRaw: string,
  currentRaw: string | null,
  replacesCorruptData: boolean,
): InitialData {
  const parsed = parseGymData(legacyRaw)
  if (!parsed.ok) {
    return {
      categories: [],
      status: 'error',
      error: `Alte Trainingsdaten konnten nicht geladen werden: ${parsed.error} Sie bleiben unverändert gespeichert.`,
      storage,
      knownRaw: currentRaw,
      writeBlock: null,
    }
  }

  // The backup is the exact original string, not a re-serialized approximation.
  const backupSaved = preserveRawBackup(storage, LEGACY_BACKUP_KEY, legacyRaw)
  const serialized = serializeGymData(parsed.categories)
  let knownRaw = currentRaw
  let error: string | null = null

  try {
    storage.setItem(GYM_STORAGE_KEY, serialized)
    knownRaw = serialized
  } catch (storageError) {
    error = `Die alten Trainingsdaten wurden geladen, konnten aber nicht im neuen Format gespeichert werden. ${errorMessage(storageError)}`
  }

  // Only remove the collision-prone old key once both the backup and new copy exist.
  if (backupSaved && error === null) {
    try {
      storage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      // Keeping the old key is safe; the versioned key wins on the next load.
    }
  }

  if (error === null && replacesCorruptData) {
    error =
      'Die aktuellen Daten waren beschädigt und wurden als Wiederherstellungskopie gesichert. Es wurde der ältere Datenstand wiederhergestellt – bitte prüfe deine Daten.'
  } else if (error === null && parsed.issues.length > 0) {
    error =
      'Einige beschädigte alte Einträge wurden übersprungen. Das unveränderte Original findest du unter „Daten sichern“.'
  }

  return {
    categories: parsed.categories,
    status: error === null ? 'saved' : 'error',
    error,
    storage,
    knownRaw,
    writeBlock: null,
  }
}

function loadInitialData(): InitialData {
  const storage = browserStorage()
  if (!storage) {
    return {
      categories: [],
      status: 'error',
      error: STORAGE_UNAVAILABLE,
      storage: null,
      knownRaw: null,
      writeBlock: null,
    }
  }

  let currentRaw: string | null
  let legacyRaw: string | null
  try {
    currentRaw = storage.getItem(GYM_STORAGE_KEY)
    legacyRaw = storage.getItem(LEGACY_STORAGE_KEY)
  } catch (error) {
    return {
      categories: [],
      status: 'error',
      error: errorMessage(error),
      storage,
      knownRaw: null,
      writeBlock: null,
    }
  }

  if (currentRaw === null) {
    if (legacyRaw !== null) return loadLegacyData(storage, legacyRaw, null, false)
    return {
      categories: [],
      status: 'ready',
      error: null,
      storage,
      knownRaw: null,
      writeBlock: null,
    }
  }

  const parsed = parseGymData(currentRaw)

  if (!parsed.ok) {
    if (parsed.reason === 'unsupported-version') {
      // Never fall back to older data or overwrite a format written by a newer version.
      return {
        categories: [],
        status: 'error',
        error: parsed.error,
        storage,
        knownRaw: currentRaw,
        writeBlock: 'newer-version',
      }
    }

    // Keep the exact unreadable payload before anything can replace it.
    const backupSaved = preserveRawBackup(storage, RECOVERY_BACKUP_KEY, currentRaw)
    if (!backupSaved) {
      return {
        categories: [],
        status: 'error',
        error: `Gespeicherte Trainingsdaten konnten nicht gelesen werden: ${parsed.error}`,
        storage,
        knownRaw: currentRaw,
        writeBlock: 'unpreserved-data',
      }
    }
    if (legacyRaw !== null) return loadLegacyData(storage, legacyRaw, currentRaw, true)

    return {
      categories: [],
      status: 'error',
      error: `Gespeicherte Trainingsdaten konnten nicht gelesen werden: ${parsed.error} Eine unveränderte Kopie findest du unter „Daten sichern“.`,
      storage,
      knownRaw: currentRaw,
      writeBlock: null,
    }
  }

  if (!parsed.needsRewrite) {
    return {
      categories: parsed.categories,
      status: 'ready',
      error: null,
      storage,
      knownRaw: currentRaw,
      writeBlock: null,
    }
  }

  const backupSaved = preserveRawBackup(storage, RECOVERY_BACKUP_KEY, currentRaw)
  if (!backupSaved && parsed.issues.length > 0) {
    // Rewriting would drop the skipped entries for good, so keep the original untouched.
    return {
      categories: parsed.categories,
      status: 'error',
      error:
        'Einige gespeicherte Einträge sind beschädigt und wurden ausgeblendet. Für eine Sicherungskopie war kein Platz.',
      storage,
      knownRaw: currentRaw,
      writeBlock: 'unpreserved-data',
    }
  }

  const serialized = serializeGymData(parsed.categories)
  try {
    storage.setItem(GYM_STORAGE_KEY, serialized)
  } catch (error) {
    return {
      categories: parsed.categories,
      status: 'error',
      error: errorMessage(error),
      storage,
      knownRaw: currentRaw,
      writeBlock: null,
    }
  }

  return {
    categories: parsed.categories,
    status: parsed.issues.length > 0 ? 'error' : 'saved',
    error:
      parsed.issues.length > 0
        ? 'Einige beschädigte gespeicherte Einträge wurden übersprungen. Das unveränderte Original findest du unter „Daten sichern“.'
        : null,
    storage,
    knownRaw: serialized,
    writeBlock: null,
  }
}

type WriteResult = { ok: true } | { ok: false; error: string; external?: string | null }

export const useGymStore = defineStore('gym', () => {
  const initial = loadInitialData()
  const categories = ref<Category[]>(initial.categories)
  const persistenceStatus = ref<PersistenceStatus>(initial.status)
  const persistenceError = ref<string | null>(initial.error)
  const lastSavedAt = ref<string | null>(
    initial.status === 'saved' ? new Date().toISOString() : null,
  )
  const writeBlock = ref<WriteBlockReason | null>(initial.writeBlock)
  const recoveryCopies = ref<RecoveryCopy[]>([])
  const lastExportAt = ref<string | null>(null)
  const storagePersisted = ref<boolean | null>(null)
  const storage = initial.storage

  // The exact string this tab last read or wrote; anything else in storage came from another tab.
  let knownRaw = initial.knownRaw
  const storedSize = ref(knownRaw?.length ?? 0)

  function setKnownRaw(raw: string | null) {
    knownRaw = raw
    storedSize.value = raw?.length ?? 0
  }
  let persistenceRequested = false

  function refreshRecoveryCopies() {
    const copies: RecoveryCopy[] = []
    if (storage) {
      try {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index)
          if (!key?.startsWith(BACKUP_KEY_PREFIX)) continue
          const value = storage.getItem(key)
          if (value !== null)
            copies.push({ key, label: describeBackupKey(key), size: value.length })
        }
      } catch {
        // Listing is best effort; the copies stay in storage either way.
      }
    }
    recoveryCopies.value = copies.sort((a, b) => a.key.localeCompare(b.key))
  }

  function refreshLastExport() {
    try {
      lastExportAt.value = storage?.getItem(LAST_EXPORT_KEY) ?? null
    } catch {
      lastExportAt.value = null
    }
  }

  function storageManager(): StorageManager | undefined {
    return typeof navigator === 'undefined' ? undefined : navigator.storage
  }

  async function checkPersistentStorage() {
    const manager = storageManager()
    if (typeof manager?.persisted !== 'function') return
    try {
      storagePersisted.value = await manager.persisted()
    } catch {
      storagePersisted.value = null
    }
  }

  /**
   * Asks the browser to exempt GymBuddie's storage from automatic eviction. Called after
   * the first successful save so Firefox's permission prompt follows a user action.
   */
  async function requestPersistentStorage() {
    if (persistenceRequested) return
    persistenceRequested = true
    const manager = storageManager()
    if (typeof manager?.persist !== 'function' || typeof manager.persisted !== 'function') return
    try {
      if (await manager.persisted()) {
        storagePersisted.value = true
        return
      }
      storagePersisted.value = await manager.persist()
    } catch {
      // Not supported in this context; the status simply stays unknown.
    }
  }

  function applyExternal(raw: string | null) {
    setKnownRaw(raw)
    if (raw === null) {
      categories.value = []
      persistenceStatus.value = 'synced'
      return
    }

    const parsed = parseGymData(raw)
    if (!parsed.ok) {
      persistenceStatus.value = 'error'
      if (parsed.reason === 'unsupported-version') {
        writeBlock.value = 'newer-version'
        persistenceError.value = parsed.error
        return
      }
      if (storage) preserveRawBackup(storage, RECOVERY_BACKUP_KEY, raw)
      refreshRecoveryCopies()
      persistenceError.value = `Änderungen aus einem anderen Tab konnten nicht geladen werden: ${parsed.error}`
      return
    }

    categories.value = parsed.categories
    persistenceStatus.value = 'synced'
    if (parsed.issues.length > 0) {
      persistenceError.value =
        'Einige ungültige Änderungen aus einem anderen Tab wurden übersprungen.'
    }
  }

  function syncFromStorage() {
    if (!storage) return
    let raw: string | null
    try {
      raw = storage.getItem(GYM_STORAGE_KEY)
    } catch {
      return
    }
    if (raw !== knownRaw) applyExternal(raw)
  }

  function write(): WriteResult {
    if (writeBlock.value) return { ok: false, error: writeBlockMessage(writeBlock.value) }
    if (!storage) return { ok: false, error: STORAGE_UNAVAILABLE }

    try {
      const current = storage.getItem(GYM_STORAGE_KEY)
      if (current !== knownRaw) return { ok: false, error: CONFLICT, external: current }

      const serialized = serializeGymData(toRaw(categories.value))
      try {
        storage.setItem(GYM_STORAGE_KEY, serialized)
      } catch (error) {
        // The pre-import snapshot is the most expendable copy; give its space to the live data.
        if (!isQuotaError(error) || storage.getItem(PRE_IMPORT_BACKUP_KEY) === null) throw error
        storage.removeItem(PRE_IMPORT_BACKUP_KEY)
        storage.setItem(GYM_STORAGE_KEY, serialized)
        refreshRecoveryCopies()
        persistenceError.value =
          'Der Speicher war voll. Die Kopie des Datenstands vor dem letzten Import wurde gelöscht, um deine Änderung zu speichern.'
      }
      setKnownRaw(serialized)
    } catch (error) {
      return { ok: false, error: errorMessage(error) }
    }

    persistenceStatus.value = 'saved'
    lastSavedAt.value = new Date().toISOString()
    void requestPersistentStorage()
    return { ok: true }
  }

  /** Persists the in-memory change right away and reverts it if the write fails. */
  function commit(undo: () => void): ActionResult {
    const result = write()
    if (result.ok) return result

    undo()
    if (result.external !== undefined) applyExternal(result.external)
    return { ok: false, error: result.error }
  }

  function fail(error: string): ActionResult {
    return { ok: false, error }
  }

  function findCategory(categoryId: string): Category | undefined {
    return categories.value.find((category) => category.id === categoryId)
  }

  function findExercise(exerciseId: string): Exercise | undefined {
    for (const category of categories.value) {
      const exercise = category.exercises.find((candidate) => candidate.id === exerciseId)
      if (exercise) return exercise
    }
    return undefined
  }

  function logSet(exerciseId: string, newSet: Omit<SetEntry, 'id'>): ActionResult {
    if (!isValidSetValues(newSet.weight, newSet.reps)) return fail(INVALID_SET)
    const exercise = findExercise(exerciseId)
    if (!exercise) return fail(NOT_FOUND)

    const today = toLocalDateKey()
    const set: SetEntry = { id: createId(), weight: newSet.weight, reps: newSet.reps }
    const todaySession = exercise.history.find((session) => session.date === today)

    if (todaySession) {
      if (todaySession.sets.length >= MAX_SETS_PER_SESSION) {
        return fail(`Pro Tag sind höchstens ${MAX_SETS_PER_SESSION} Sätze je Übung möglich.`)
      }
      todaySession.sets.unshift(set)
      return commit(() => {
        const index = todaySession.sets.findIndex((candidate) => candidate.id === set.id)
        if (index >= 0) todaySession.sets.splice(index, 1)
      })
    }

    if (exercise.history.length >= MAX_HISTORY_ENTRIES_PER_EXERCISE) {
      return fail('Für diese Übung ist das Limit an Trainingstagen erreicht.')
    }
    // Keep the newest-first order even if the device clock moved backwards.
    const insertAt = exercise.history.findIndex((session) => session.date < today)
    exercise.history.splice(insertAt < 0 ? exercise.history.length : insertAt, 0, {
      date: today,
      sets: [set],
    })
    return commit(() => {
      const index = exercise.history.findIndex((session) => session.date === today)
      if (index >= 0) exercise.history.splice(index, 1)
    })
  }

  function addCategory(name: string): ActionResult {
    const normalizedName = normalizeName(name)
    if (!normalizedName) return fail(INVALID_NAME)
    if (categories.value.length >= MAX_CATEGORIES) {
      return fail(`Es sind höchstens ${MAX_CATEGORIES} Kategorien möglich.`)
    }

    const category: Category = { id: createId(), name: normalizedName, exercises: [] }
    categories.value.unshift(category)
    return commit(() => {
      const index = categories.value.findIndex((candidate) => candidate.id === category.id)
      if (index >= 0) categories.value.splice(index, 1)
    })
  }

  function renameCategory(categoryId: string, name: string): ActionResult {
    const normalizedName = normalizeName(name)
    if (!normalizedName) return fail(INVALID_NAME)
    const category = findCategory(categoryId)
    if (!category) return fail(NOT_FOUND)

    const previousName = category.name
    category.name = normalizedName
    return commit(() => {
      category.name = previousName
    })
  }

  function deleteCategory(categoryId: string): ActionResult {
    const index = categories.value.findIndex((category) => category.id === categoryId)
    if (index < 0) return fail(NOT_FOUND)

    const [removed] = categories.value.splice(index, 1)
    return commit(() => {
      if (removed) categories.value.splice(index, 0, removed)
    })
  }

  function addExercise(categoryId: string, exerciseName: string, videoUrl?: string): ActionResult {
    const normalizedName = normalizeName(exerciseName)
    if (!normalizedName) return fail(INVALID_NAME)
    const normalizedVideoUrl = normalizeVideoUrl(videoUrl)
    if (normalizedVideoUrl === null) return fail(INVALID_URL)
    const category = findCategory(categoryId)
    if (!category) return fail(NOT_FOUND)
    if (category.exercises.length >= MAX_EXERCISES_PER_CATEGORY) {
      return fail(`Pro Kategorie sind höchstens ${MAX_EXERCISES_PER_CATEGORY} Übungen möglich.`)
    }

    const exercise: Exercise = {
      id: createId(),
      name: normalizedName,
      ...(normalizedVideoUrl ? { videoUrl: normalizedVideoUrl } : {}),
      history: [],
    }
    category.exercises.unshift(exercise)
    return commit(() => {
      const index = category.exercises.findIndex((candidate) => candidate.id === exercise.id)
      if (index >= 0) category.exercises.splice(index, 1)
    })
  }

  function updateExercise(
    exerciseId: string,
    updates: { name: string; videoUrl?: string },
  ): ActionResult {
    const normalizedName = normalizeName(updates.name)
    if (!normalizedName) return fail(INVALID_NAME)
    const normalizedVideoUrl = normalizeVideoUrl(updates.videoUrl)
    if (normalizedVideoUrl === null) return fail(INVALID_URL)
    const exercise = findExercise(exerciseId)
    if (!exercise) return fail(NOT_FOUND)

    const previous = { name: exercise.name, videoUrl: exercise.videoUrl }
    exercise.name = normalizedName
    if (normalizedVideoUrl) exercise.videoUrl = normalizedVideoUrl
    else delete exercise.videoUrl

    return commit(() => {
      exercise.name = previous.name
      if (previous.videoUrl) exercise.videoUrl = previous.videoUrl
      else delete exercise.videoUrl
    })
  }

  function deleteExercise(categoryId: string, exerciseId: string): ActionResult {
    const category = findCategory(categoryId)
    if (!category) return fail(NOT_FOUND)
    const index = category.exercises.findIndex((exercise) => exercise.id === exerciseId)
    if (index < 0) return fail(NOT_FOUND)

    const [removed] = category.exercises.splice(index, 1)
    return commit(() => {
      if (removed) category.exercises.splice(index, 0, removed)
    })
  }

  function updateSet(
    exerciseId: string,
    setId: string,
    updates: { weight?: number; reps?: number },
  ): ActionResult {
    if (updates.weight === undefined && updates.reps === undefined) return fail(INVALID_SET)
    const exercise = findExercise(exerciseId)
    if (!exercise) return fail(NOT_FOUND)

    for (const session of exercise.history) {
      const set = session.sets.find((candidate) => candidate.id === setId)
      if (!set) continue

      const weight = updates.weight ?? set.weight
      const reps = updates.reps ?? set.reps
      if (!isValidSetValues(weight, reps)) return fail(INVALID_SET)

      const previous = { weight: set.weight, reps: set.reps }
      set.weight = weight
      set.reps = reps
      return commit(() => {
        set.weight = previous.weight
        set.reps = previous.reps
      })
    }
    return fail(NOT_FOUND)
  }

  function deleteSet(exerciseId: string, setId: string): ActionResult {
    const exercise = findExercise(exerciseId)
    if (!exercise) return fail(NOT_FOUND)

    for (let sessionIndex = 0; sessionIndex < exercise.history.length; sessionIndex += 1) {
      const session: WorkoutSession | undefined = exercise.history[sessionIndex]
      if (!session) continue
      const setIndex = session.sets.findIndex((set) => set.id === setId)
      if (setIndex < 0) continue

      const [removedSet] = session.sets.splice(setIndex, 1)
      const sessionRemoved = session.sets.length === 0
      if (sessionRemoved) exercise.history.splice(sessionIndex, 1)

      return commit(() => {
        if (sessionRemoved) exercise.history.splice(sessionIndex, 0, session)
        if (removedSet) session.sets.splice(setIndex, 0, removedSet)
      })
    }
    return fail(NOT_FOUND)
  }

  function exportData(): string {
    return JSON.stringify(createGymDataExport(toRaw(categories.value)))
  }

  function markExported() {
    const now = new Date().toISOString()
    lastExportAt.value = now
    try {
      storage?.setItem(LAST_EXPORT_KEY, now)
    } catch {
      // Only a reminder; the backup itself was already handed to the browser.
    }
  }

  function previewBackup(serialized: string): BackupParseResult {
    return parseBackupFile(serialized)
  }

  function importBackup(serialized: string): ImportResult {
    const parsed = parseBackupFile(serialized)
    if (!parsed.ok) return { ok: false, error: `Import fehlgeschlagen: ${parsed.error}` }
    if (writeBlock.value === 'newer-version') {
      return { ok: false, error: writeBlockMessage('newer-version') }
    }
    if (!storage) return { ok: false, error: STORAGE_UNAVAILABLE }

    let current: string | null = null
    try {
      current = storage.getItem(GYM_STORAGE_KEY)
    } catch {
      current = knownRaw
    }

    // Keep the replaced data so a wrong import can be reverted from a downloaded copy.
    let snapshotSaved = current === null
    if (current !== null) {
      try {
        storage.setItem(PRE_IMPORT_BACKUP_KEY, current)
        snapshotSaved = true
      } catch {
        snapshotSaved = false
      }
    }
    if (writeBlock.value === 'unpreserved-data' && !snapshotSaved) {
      return { ok: false, error: writeBlockMessage('unpreserved-data') }
    }

    const serializedData = serializeGymData(parsed.categories)
    try {
      storage.setItem(GYM_STORAGE_KEY, serializedData)
    } catch (error) {
      refreshRecoveryCopies()
      return { ok: false, error: `Import fehlgeschlagen: ${errorMessage(error)}` }
    }

    setKnownRaw(serializedData)
    categories.value = parsed.categories
    writeBlock.value = null
    persistenceStatus.value = 'saved'
    persistenceError.value = null
    lastSavedAt.value = new Date().toISOString()
    refreshRecoveryCopies()
    void requestPersistentStorage()
    return {
      ok: true,
      summary: parsed.summary,
      skipped: parsed.issues.length,
      snapshotSaved,
    }
  }

  function readRecoveryCopy(key: string): string | null {
    if (!storage || !key.startsWith(BACKUP_KEY_PREFIX)) return null
    try {
      return storage.getItem(key)
    } catch {
      return null
    }
  }

  function deleteRecoveryCopy(key: string): boolean {
    if (!storage || !key.startsWith(BACKUP_KEY_PREFIX)) return false
    try {
      storage.removeItem(key)
    } catch {
      return false
    }
    refreshRecoveryCopies()
    return true
  }

  /** The exact unreadable payload that is currently protected by a write block. */
  function readUnreadableData(): string | null {
    try {
      return storage?.getItem(GYM_STORAGE_KEY) ?? null
    } catch {
      return null
    }
  }

  /** Lifts an `unpreserved-data` block once the user downloaded or chose to discard the data. */
  function releaseWriteBlock() {
    if (writeBlock.value !== 'unpreserved-data') return
    writeBlock.value = null
    persistenceError.value = null
    persistenceStatus.value = 'ready'
  }

  function clearPersistenceError() {
    persistenceError.value = null
    if (persistenceStatus.value === 'error') persistenceStatus.value = 'ready'
  }

  refreshRecoveryCopies()
  refreshLastExport()
  void checkPersistentStorage()

  if (typeof window !== 'undefined' && storage) {
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea && event.storageArea !== storage) return
      if (event.key === null || event.key.startsWith(BACKUP_KEY_PREFIX)) refreshRecoveryCopies()
      if (event.key === null || event.key === LAST_EXPORT_KEY) refreshLastExport()
      if (event.key === null || event.key === GYM_STORAGE_KEY) syncFromStorage()
    }
    // Pages restored from the back/forward cache or woken up may have missed storage events.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') syncFromStorage()
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('pageshow', syncFromStorage)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    onScopeDispose(() => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('pageshow', syncFromStorage)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    })
  }

  return {
    categories,
    persistenceStatus,
    persistenceError,
    lastSavedAt,
    writeBlock,
    recoveryCopies,
    lastExportAt,
    storagePersisted,
    storedSize,
    clearPersistenceError,
    addCategory,
    renameCategory,
    deleteCategory,
    addExercise,
    updateExercise,
    deleteExercise,
    logSet,
    updateSet,
    deleteSet,
    exportData,
    markExported,
    previewBackup,
    importBackup,
    readRecoveryCopy,
    deleteRecoveryCopy,
    readUnreadableData,
    releaseWriteBlock,
  }
})
