import { defineStore } from 'pinia'
import { onScopeDispose, ref, watch } from 'vue'

import {
  MAX_CATEGORIES,
  MAX_EXERCISES_PER_CATEGORY,
  MAX_HISTORY_ENTRIES_PER_EXERCISE,
  MAX_SETS_PER_SESSION,
  createGymDataExport,
  createId,
  isValidSetValues,
  normalizeName,
  normalizeVideoUrl,
  parseGymData,
  serializeGymData,
  toLocalDateKey,
  type Category,
  type Exercise,
  type SetEntry,
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

export type PersistenceStatus = 'ready' | 'saved' | 'synced' | 'error'

interface InitialData {
  categories: Category[]
  status: PersistenceStatus
  error: string | null
  storage: Storage | null
}

function errorMessage(error: unknown): string {
  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'QuotaExceededError'
  ) {
    return 'Der Gerätespeicher ist voll. Bitte exportiere deine Daten, bevor du fortfährst.'
  }
  return 'Die Trainingsdaten konnten auf diesem Gerät nicht gespeichert werden.'
}

function browserStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function preserveRawBackup(storage: Storage, key: string, rawData: string): boolean {
  try {
    if (storage.getItem(key) === null) storage.setItem(key, rawData)
    return true
  } catch {
    return false
  }
}

function loadInitialData(): InitialData {
  const storage = browserStorage()
  if (!storage) {
    return {
      categories: [],
      status: 'error',
      error: 'Lokaler Speicher ist in diesem Browser nicht verfügbar.',
      storage: null,
    }
  }

  let currentRaw: string | null
  let legacyRaw: string | null
  try {
    currentRaw = storage.getItem(GYM_STORAGE_KEY)
    legacyRaw = storage.getItem(LEGACY_STORAGE_KEY)
  } catch (error) {
    return { categories: [], status: 'error', error: errorMessage(error), storage }
  }

  if (currentRaw !== null) {
    const parsed = parseGymData(currentRaw)
    if (parsed.ok) {
      let status: PersistenceStatus = 'ready'
      let error: string | null = null

      if (parsed.needsRewrite) {
        const backupSaved = preserveRawBackup(storage, RECOVERY_BACKUP_KEY, currentRaw)
        try {
          storage.setItem(GYM_STORAGE_KEY, serializeGymData(parsed.categories))
          status = 'saved'
        } catch (storageError) {
          status = 'error'
          error = errorMessage(storageError)
        }

        if (!backupSaved && error === null) {
          status = 'error'
          error =
            'Die bereinigten Daten wurden gespeichert, aber die ursprüngliche Datei konnte nicht gesichert werden.'
        }
      }

      if (parsed.issues.length > 0 && error === null) {
        status = 'error'
        error =
          'Einige beschädigte gespeicherte Einträge wurden sicher übersprungen. Bitte exportiere und prüfe deine Daten.'
      }

      return { categories: parsed.categories, status, error, storage }
    }

    // Keep the exact corrupt payload before attempting a legacy recovery.
    preserveRawBackup(storage, RECOVERY_BACKUP_KEY, currentRaw)
    if (legacyRaw === null) {
      return {
        categories: [],
        status: 'error',
        error: `Gespeicherte Trainingsdaten konnten nicht geladen werden: ${parsed.error}`,
        storage,
      }
    }
  }

  if (legacyRaw !== null) {
    const parsed = parseGymData(legacyRaw)
    if (!parsed.ok) {
      return {
        categories: [],
        status: 'error',
        error: `Alte Trainingsdaten konnten nicht geladen werden: ${parsed.error}`,
        storage,
      }
    }

    // The backup is the exact original string, not a re-serialized approximation.
    const backupSaved = preserveRawBackup(storage, LEGACY_BACKUP_KEY, legacyRaw)
    let dataSaved = false
    let saveError: string | null = null
    try {
      storage.setItem(GYM_STORAGE_KEY, serializeGymData(parsed.categories))
      dataSaved = true
    } catch (error) {
      saveError = errorMessage(error)
    }

    // Only remove the collision-prone old key once both the backup and new copy exist.
    if (backupSaved && dataSaved) {
      try {
        storage.removeItem(LEGACY_STORAGE_KEY)
      } catch {
        // Keeping the old key is safe; the versioned key wins on the next load.
      }
    }

    if (!backupSaved) {
      saveError =
        'Die alten Trainingsdaten wurden geladen, konnten aber nicht zusätzlich gesichert werden.'
    }
    if (parsed.issues.length > 0 && saveError === null) {
      saveError =
        'Einige beschädigte alte Einträge wurden übersprungen. Die unveränderte Originaldatei wurde gesichert.'
    }

    return {
      categories: parsed.categories,
      status: saveError === null ? 'saved' : 'error',
      error: saveError,
      storage,
    }
  }

  return { categories: [], status: 'ready', error: null, storage }
}

export const useGymStore = defineStore('gym', () => {
  const initial = loadInitialData()
  const categories = ref<Category[]>(initial.categories)
  const persistenceStatus = ref<PersistenceStatus>(initial.status)
  const persistenceError = ref<string | null>(initial.error)
  const lastSavedAt = ref<string | null>(
    initial.status === 'saved' ? new Date().toISOString() : null,
  )
  const storage = initial.storage

  let ignoredExternalFingerprint: string | null = null

  function setPersistenceError(message: string) {
    persistenceStatus.value = 'error'
    persistenceError.value = message
  }

  function clearPersistenceError() {
    persistenceError.value = null
    if (persistenceStatus.value === 'error') persistenceStatus.value = 'ready'
  }

  function persist(data: Category[]): boolean {
    if (!storage) {
      setPersistenceError('Lokaler Speicher ist in diesem Browser nicht verfügbar.')
      return false
    }

    try {
      storage.setItem(GYM_STORAGE_KEY, serializeGymData(data))
      persistenceStatus.value = 'saved'
      persistenceError.value = null
      lastSavedAt.value = new Date().toISOString()
      return true
    } catch (error) {
      setPersistenceError(errorMessage(error))
      return false
    }
  }

  function findExercise(exerciseId: string): Exercise | undefined {
    for (const category of categories.value) {
      const exercise = category.exercises.find((candidate) => candidate.id === exerciseId)
      if (exercise) return exercise
    }
    return undefined
  }

  function logSet(exerciseId: string, newSet: Omit<SetEntry, 'id'>): boolean {
    if (!isValidSetValues(newSet.weight, newSet.reps)) return false
    const exercise = findExercise(exerciseId)
    if (!exercise) return false

    const today = toLocalDateKey()
    const todaySession = exercise.history.find((session) => session.date === today)

    if (todaySession) {
      if (todaySession.sets.length >= MAX_SETS_PER_SESSION) return false
      todaySession.sets.unshift({ ...newSet, id: createId() })
    } else {
      if (exercise.history.length >= MAX_HISTORY_ENTRIES_PER_EXERCISE) return false
      exercise.history.unshift({ date: today, sets: [{ ...newSet, id: createId() }] })
    }
    return true
  }

  function addCategory(name: string): boolean {
    const normalizedName = normalizeName(name)
    if (!normalizedName || categories.value.length >= MAX_CATEGORIES) return false

    categories.value.unshift({
      id: createId(),
      name: normalizedName,
      exercises: [],
    })
    return true
  }

  function deleteCategory(categoryId: string): boolean {
    const index = categories.value.findIndex((category) => category.id === categoryId)
    if (index < 0) return false
    categories.value.splice(index, 1)
    return true
  }

  function addExercise(categoryId: string, exerciseName: string, videoUrl?: string): boolean {
    const category = categories.value.find((candidate) => candidate.id === categoryId)
    const normalizedName = normalizeName(exerciseName)
    const normalizedVideoUrl = normalizeVideoUrl(videoUrl)
    if (
      !category ||
      !normalizedName ||
      normalizedVideoUrl === null ||
      category.exercises.length >= MAX_EXERCISES_PER_CATEGORY
    ) {
      return false
    }

    category.exercises.unshift({
      id: createId(),
      name: normalizedName,
      ...(normalizedVideoUrl ? { videoUrl: normalizedVideoUrl } : {}),
      history: [],
    })
    return true
  }

  function deleteExercise(categoryId: string, exerciseId: string): boolean {
    const category = categories.value.find((candidate) => candidate.id === categoryId)
    if (!category) return false
    const index = category.exercises.findIndex((exercise) => exercise.id === exerciseId)
    if (index < 0) return false
    category.exercises.splice(index, 1)
    return true
  }

  function updateSet(
    exerciseId: string,
    setId: string,
    updates: { weight?: number; reps?: number },
  ): boolean {
    if (updates.weight === undefined && updates.reps === undefined) return false
    const exercise = findExercise(exerciseId)
    if (!exercise) return false

    for (const session of exercise.history) {
      const set = session.sets.find((candidate) => candidate.id === setId)
      if (!set) continue

      const weight = updates.weight ?? set.weight
      const reps = updates.reps ?? set.reps
      if (!isValidSetValues(weight, reps)) return false
      set.weight = weight
      set.reps = reps
      return true
    }
    return false
  }

  function deleteSet(exerciseId: string, setId: string): boolean {
    const exercise = findExercise(exerciseId)
    if (!exercise) return false

    for (let sessionIndex = 0; sessionIndex < exercise.history.length; sessionIndex += 1) {
      const session = exercise.history[sessionIndex]
      if (!session) continue
      const setIndex = session.sets.findIndex((set) => set.id === setId)
      if (setIndex < 0) continue

      session.sets.splice(setIndex, 1)
      if (session.sets.length === 0) exercise.history.splice(sessionIndex, 1)
      return true
    }
    return false
  }

  function exportData(): string {
    return JSON.stringify(createGymDataExport(categories.value), null, 2)
  }

  function importData(serialized: string): boolean {
    const parsed = parseGymData(serialized)
    if (!parsed.ok) {
      setPersistenceError(`Import fehlgeschlagen: ${parsed.error}`)
      return false
    }

    // Keep the current in-memory data intact unless the replacement is durable.
    if (!persist(parsed.categories)) return false

    const fingerprint = JSON.stringify(parsed.categories)
    ignoredExternalFingerprint = fingerprint
    categories.value = parsed.categories
    if (parsed.issues.length > 0) {
      setPersistenceError(
        'Der Import wurde abgeschlossen; einige ungültige Einträge wurden übersprungen.',
      )
    }
    return true
  }

  watch(
    categories,
    (newData) => {
      const fingerprint = JSON.stringify(newData)
      if (fingerprint === ignoredExternalFingerprint) {
        ignoredExternalFingerprint = null
        return
      }
      ignoredExternalFingerprint = null
      persist(newData)
    },
    { deep: true },
  )

  if (typeof window !== 'undefined' && storage) {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== GYM_STORAGE_KEY) return
      if (event.storageArea && event.storageArea !== storage) return

      if (event.newValue === null) {
        ignoredExternalFingerprint = JSON.stringify([])
        categories.value = []
        persistenceStatus.value = 'synced'
        persistenceError.value = null
        return
      }

      const parsed = parseGymData(event.newValue)
      if (!parsed.ok) {
        setPersistenceError(
          `Änderungen aus einem anderen Tab konnten nicht geladen werden: ${parsed.error}`,
        )
        return
      }

      ignoredExternalFingerprint = JSON.stringify(parsed.categories)
      categories.value = parsed.categories
      persistenceStatus.value = 'synced'
      persistenceError.value =
        parsed.issues.length > 0
          ? 'Einige ungültige Änderungen aus einem anderen Tab wurden übersprungen.'
          : null
    }

    window.addEventListener('storage', handleStorage)
    onScopeDispose(() => window.removeEventListener('storage', handleStorage))
  }

  return {
    categories,
    persistenceStatus,
    persistenceError,
    lastSavedAt,
    clearPersistenceError,
    addCategory,
    deleteCategory,
    addExercise,
    deleteExercise,
    logSet,
    updateSet,
    deleteSet,
    exportData,
    importData,
  }
})
