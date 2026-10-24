import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GYM_DATA_VERSION,
  MAX_CATEGORIES,
  MAX_EXERCISES_PER_CATEGORY,
  MAX_SETS_PER_SESSION,
  createGymDataEnvelope,
  createGymDataExport,
  type Category,
} from '@/domain/gymData'
import {
  GYM_STORAGE_KEY,
  LAST_EXPORT_KEY,
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  PRE_IMPORT_BACKUP_KEY,
  RECOVERY_BACKUP_KEY,
  useGymStore,
} from '@/stores/gymStore'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function seedCategory(): Category {
  return {
    id: 'category-1',
    name: 'Push',
    exercises: [
      {
        id: 'exercise-1',
        name: 'Bankdrücken',
        history: [
          {
            date: '2026-07-12',
            sets: [{ id: 'set-1', weight: 60, reps: 8 }],
          },
        ],
      },
    ],
  }
}

function seedStorage(categories: Category[] = [seedCategory()]) {
  const raw = JSON.stringify(createGymDataEnvelope(categories, '2026-07-12T10:00:00.000Z'))
  localStorage.setItem(GYM_STORAGE_KEY, raw)
  return raw
}

function storedCategories(): Category[] {
  return (JSON.parse(localStorage.getItem(GYM_STORAGE_KEY) ?? '{}') as { categories: Category[] })
    .categories
}

function failWritesTo(key: string) {
  const original = window.localStorage.setItem.bind(window.localStorage)
  return vi.spyOn(window.localStorage, 'setItem').mockImplementation((itemKey, value) => {
    if (itemKey === key) throw new DOMException('Full', 'QuotaExceededError')
    original(itemKey, value)
  })
}

function backupFile(categories: Category[]) {
  return JSON.stringify(createGymDataExport(categories, '2026-07-13T10:00:00.000Z'))
}

function dispatchStorageEvent(key: string | null) {
  window.dispatchEvent(new window.StorageEvent('storage', { key }))
}

describe('gym store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 6, 13, 18, 30))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('loading', () => {
    it('migrates legacy data, saves the exact raw backup, and removes the old key', () => {
      const legacyRaw = JSON.stringify([
        {
          id: 'category-1',
          name: 'Push',
          exercises: [
            {
              id: 'exercise-1',
              name: 'Bankdrücken',
              videoUrl: 'youtube.com/watch?v=abc',
              history: [{ date: '2026-07-12', weight: 60, reps: 8, sets: 3 }],
            },
          ],
        },
      ])
      localStorage.setItem(LEGACY_STORAGE_KEY, legacyRaw)

      const store = useGymStore()

      const exercise = store.categories[0]?.exercises[0]
      expect(exercise?.history[0]?.sets).toHaveLength(3)
      // Old free-text links without a scheme are repaired instead of dropped.
      expect(exercise?.videoUrl).toBe('https://youtube.com/watch?v=abc')
      expect(localStorage.getItem(LEGACY_BACKUP_KEY)).toBe(legacyRaw)
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
      expect(JSON.parse(localStorage.getItem(GYM_STORAGE_KEY) ?? '{}')).toMatchObject({
        app: 'GymBuddie',
        version: GYM_DATA_VERSION,
      })
      expect(store.persistenceStatus).toBe('saved')
      expect(store.persistenceError).toBeNull()
    })

    it('keeps unreadable data as a recovery copy and lets the user continue', () => {
      localStorage.setItem(GYM_STORAGE_KEY, '{not-json')

      const store = useGymStore()

      expect(store.categories).toEqual([])
      expect(store.persistenceStatus).toBe('error')
      expect(store.persistenceError).toContain('konnten nicht gelesen werden')
      expect(store.writeBlock).toBeNull()
      expect(localStorage.getItem(RECOVERY_BACKUP_KEY)).toBe('{not-json')
      expect(store.recoveryCopies.map((copy) => copy.key)).toEqual([RECOVERY_BACKUP_KEY])

      expect(store.addCategory('Neu').ok).toBe(true)
      expect(localStorage.getItem(RECOVERY_BACKUP_KEY)).toBe('{not-json')
    })

    it('keeps a second, different unreadable payload in its own slot', () => {
      localStorage.setItem(RECOVERY_BACKUP_KEY, 'older copy')
      localStorage.setItem(GYM_STORAGE_KEY, '{newer-corruption')

      const store = useGymStore()

      expect(localStorage.getItem(RECOVERY_BACKUP_KEY)).toBe('older copy')
      expect(localStorage.getItem(`${RECOVERY_BACKUP_KEY}:2`)).toBe('{newer-corruption')
      expect(store.writeBlock).toBeNull()
      expect(store.recoveryCopies).toHaveLength(2)
    })

    it('blocks writes when unreadable data cannot be preserved, until the user decides', () => {
      localStorage.setItem(RECOVERY_BACKUP_KEY, 'copy 1')
      localStorage.setItem(`${RECOVERY_BACKUP_KEY}:2`, 'copy 2')
      localStorage.setItem(`${RECOVERY_BACKUP_KEY}:3`, 'copy 3')
      localStorage.setItem(GYM_STORAGE_KEY, '{fourth-corruption')

      const store = useGymStore()

      expect(store.writeBlock).toBe('unpreserved-data')
      const result = store.addCategory('Push')
      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining('keine Änderungen'),
      })
      expect(store.categories).toEqual([])
      expect(localStorage.getItem(GYM_STORAGE_KEY)).toBe('{fourth-corruption')
      expect(store.readUnreadableData()).toBe('{fourth-corruption')

      store.releaseWriteBlock()
      expect(store.writeBlock).toBeNull()
      expect(store.addCategory('Push').ok).toBe(true)
      expect(storedCategories().map((category) => category.name)).toEqual(['Push'])
    })

    it('does not rewrite partly damaged data when no recovery copy fits', () => {
      const raw = JSON.stringify(
        createGymDataEnvelope([
          {
            ...seedCategory(),
            exercises: [
              {
                id: 'exercise-1',
                name: 'Bankdrücken',
                history: [{ date: '2026-07-12', sets: [{ id: 'bad', weight: 'x', reps: 8 }] }],
              },
            ],
          } as unknown as Category,
        ]),
      )
      localStorage.setItem(GYM_STORAGE_KEY, raw)
      failWritesTo(RECOVERY_BACKUP_KEY)

      const store = useGymStore()

      expect(store.writeBlock).toBe('unpreserved-data')
      expect(store.categories[0]?.name).toBe('Push')
      expect(localStorage.getItem(GYM_STORAGE_KEY)).toBe(raw)
    })

    it('never overwrites data written by a newer app version', () => {
      const newer = JSON.stringify({ app: 'GymBuddie', version: 3, categories: [], plans: [] })
      localStorage.setItem(GYM_STORAGE_KEY, newer)
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([seedCategory()]))

      const store = useGymStore()

      expect(store.writeBlock).toBe('newer-version')
      expect(store.categories).toEqual([])
      expect(store.addCategory('Push').ok).toBe(false)
      expect(store.importBackup(backupFile([seedCategory()])).ok).toBe(false)
      expect(localStorage.getItem(GYM_STORAGE_KEY)).toBe(newer)
    })

    it.each([['"2"'], ['1'], ['null'], ['0']])(
      'treats version %s as damaged data, not as a newer app version',
      (version) => {
        const raw = `{"app":"GymBuddie","version":${version},"categories":[]}`
        localStorage.setItem(GYM_STORAGE_KEY, raw)

        const store = useGymStore()

        expect(store.writeBlock).toBeNull()
        expect(localStorage.getItem(RECOVERY_BACKUP_KEY)).toBe(raw)
      },
    )

    it('keeps the legacy key when its original cannot be backed up', () => {
      const legacyRaw = JSON.stringify([seedCategory()])
      localStorage.setItem(LEGACY_STORAGE_KEY, legacyRaw)
      failWritesTo(LEGACY_BACKUP_KEY)

      const store = useGymStore()

      expect(store.categories[0]?.name).toBe('Push')
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBe(legacyRaw)
    })

    it('warns when unreadable current data falls back to older legacy data', () => {
      localStorage.setItem(GYM_STORAGE_KEY, '{corrupt')
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([seedCategory()]))

      const store = useGymStore()

      expect(store.categories[0]?.name).toBe('Push')
      expect(store.persistenceStatus).toBe('error')
      expect(store.persistenceError).toContain('ältere Datenstand')
      expect(localStorage.getItem(RECOVERY_BACKUP_KEY)).toBe('{corrupt')
    })

    it('says so when migrated legacy data could not be saved in the new format', () => {
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify([seedCategory()]))
      failWritesTo(GYM_STORAGE_KEY)

      const store = useGymStore()

      expect(store.categories[0]?.name).toBe('Push')
      expect(store.persistenceError).toContain('nicht im neuen Format gespeichert')
      expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull()
    })
  })

  describe('actions', () => {
    it('uses UUIDs, strict inputs, normalized URLs, and local date keys', () => {
      const store = useGymStore()

      expect(store.addCategory(' Push ').ok).toBe(true)
      expect(store.addCategory('   ')).toMatchObject({ ok: false })
      const category = store.categories[0]
      if (!category) throw new Error('Expected category')
      expect(category.id).toMatch(UUID_PATTERN)
      expect(category.name).toBe('Push')

      expect(store.addExercise(category.id, 'Bankdrücken', 'javascript:alert(1)')).toMatchObject({
        ok: false,
        error: expect.stringContaining('Link'),
      })
      expect(store.addExercise(category.id, ' Bankdrücken ', 'example.com/demo').ok).toBe(true)
      const exercise = category.exercises[0]
      if (!exercise) throw new Error('Expected exercise')
      expect(exercise.videoUrl).toBe('https://example.com/demo')

      expect(store.logSet(exercise.id, { weight: Number.POSITIVE_INFINITY, reps: 10 }).ok).toBe(
        false,
      )
      expect(store.logSet(exercise.id, { weight: 50, reps: 3.5 }).ok).toBe(false)
      expect(store.logSet(exercise.id, { weight: 50, reps: 10 }).ok).toBe(true)
      expect(exercise.history[0]?.date).toBe('2026-07-13')
      expect(exercise.history[0]?.sets[0]?.id).toMatch(UUID_PATTERN)
      expect(storedCategories()[0]?.exercises[0]?.history[0]?.sets).toHaveLength(1)
    })

    it('persists each change synchronously, without a deferred watcher', () => {
      seedStorage()
      const store = useGymStore()

      expect(store.logSet('exercise-1', { weight: 65, reps: 5 }).ok).toBe(true)

      expect(storedCategories()[0]?.exercises[0]?.history.map((session) => session.date)).toEqual([
        '2026-07-13',
        '2026-07-12',
      ])
      expect(store.persistenceStatus).toBe('saved')
      expect(store.lastSavedAt).not.toBeNull()
    })

    it('updates and deletes individual sets and removes empty sessions', () => {
      seedStorage()
      const store = useGymStore()

      expect(store.updateSet('exercise-1', 'set-1', { weight: 62.5 }).ok).toBe(true)
      expect(storedCategories()[0]?.exercises[0]?.history[0]?.sets[0]).toMatchObject({
        weight: 62.5,
        reps: 8,
      })
      expect(store.updateSet('exercise-1', 'set-1', { reps: 2.5 }).ok).toBe(false)
      expect(store.updateSet('exercise-1', 'missing', { reps: 9 }).ok).toBe(false)
      expect(store.deleteSet('exercise-1', 'set-1').ok).toBe(true)
      expect(store.categories[0]?.exercises[0]?.history).toEqual([])
      expect(storedCategories()[0]?.exercises[0]?.history).toEqual([])
      expect(store.deleteSet('exercise-1', 'set-1').ok).toBe(false)
    })

    it('renames categories and edits exercise names and links', () => {
      seedStorage()
      const store = useGymStore()

      expect(store.renameCategory('category-1', '  Push Day ').ok).toBe(true)
      expect(store.renameCategory('category-1', ' ').ok).toBe(false)
      expect(
        store.updateExercise('exercise-1', { name: 'Bankdrücken eng', videoUrl: 'youtu.be/x' }).ok,
      ).toBe(true)
      expect(storedCategories()[0]).toMatchObject({
        name: 'Push Day',
        exercises: [{ name: 'Bankdrücken eng', videoUrl: 'https://youtu.be/x' }],
      })

      expect(store.updateExercise('exercise-1', { name: 'Bankdrücken eng', videoUrl: '' }).ok).toBe(
        true,
      )
      expect(storedCategories()[0]?.exercises[0]).not.toHaveProperty('videoUrl')
      expect(store.updateExercise('exercise-1', { name: 'X', videoUrl: 'ftp://x.de' }).ok).toBe(
        false,
      )
      // The sets survive renaming, which used to require deleting the whole exercise.
      expect(storedCategories()[0]?.exercises[0]?.history[0]?.sets).toHaveLength(1)
    })

    it('enforces category, exercise, and daily set limits during live actions', () => {
      const fullCategory: Category = {
        id: 'full-category',
        name: 'Full',
        exercises: Array.from({ length: MAX_EXERCISES_PER_CATEGORY }, (_, exerciseIndex) => ({
          id: `exercise-${exerciseIndex}`,
          name: `Exercise ${exerciseIndex}`,
          history:
            exerciseIndex === 0
              ? [
                  {
                    date: '2026-07-13',
                    sets: Array.from({ length: MAX_SETS_PER_SESSION }, (_, setIndex) => ({
                      id: `set-${setIndex}`,
                      weight: 20,
                      reps: 10,
                    })),
                  },
                ]
              : [],
        })),
      }
      seedStorage([
        fullCategory,
        ...Array.from({ length: MAX_CATEGORIES - 1 }, (_, categoryIndex) => ({
          id: `category-${categoryIndex}`,
          name: `Category ${categoryIndex}`,
          exercises: [],
        })),
      ])
      const store = useGymStore()

      expect(store.addCategory('One too many')).toMatchObject({
        ok: false,
        error: expect.stringContaining(`${MAX_CATEGORIES}`),
      })
      expect(store.addExercise('full-category', 'One too many').ok).toBe(false)
      expect(store.logSet('exercise-0', { weight: 20, reps: 10 }).ok).toBe(false)
      expect(store.categories).toHaveLength(MAX_CATEGORIES)
      expect(store.categories[0]?.exercises).toHaveLength(MAX_EXERCISES_PER_CATEGORY)
      expect(store.categories[0]?.exercises[0]?.history[0]?.sets).toHaveLength(MAX_SETS_PER_SESSION)
    })

    it('rolls every action back and reports the error when storage is full', () => {
      seedStorage()
      const store = useGymStore()
      const before = JSON.stringify(store.categories)
      failWritesTo(GYM_STORAGE_KEY)

      const results = [
        store.logSet('exercise-1', { weight: 70, reps: 5 }),
        store.addCategory('Pull'),
        store.renameCategory('category-1', 'Push Day'),
        store.addExercise('category-1', 'Dips'),
        store.updateExercise('exercise-1', { name: 'Schrägbank' }),
        store.updateSet('exercise-1', 'set-1', { weight: 100 }),
        store.deleteSet('exercise-1', 'set-1'),
        store.deleteExercise('category-1', 'exercise-1'),
        store.deleteCategory('category-1'),
      ]

      for (const result of results) {
        expect(result).toMatchObject({
          ok: false,
          error: expect.stringContaining('Gerätespeicher ist voll'),
        })
      }
      expect(JSON.stringify(store.categories)).toBe(before)
    })

    it('restores a changed link when saving the exercise fails', () => {
      seedStorage([
        {
          ...seedCategory(),
          exercises: [
            { id: 'exercise-1', name: 'Bankdrücken', videoUrl: 'https://a.example/', history: [] },
          ],
        },
      ])
      const store = useGymStore()
      failWritesTo(GYM_STORAGE_KEY)

      expect(
        store.updateExercise('exercise-1', { name: 'Neu', videoUrl: 'https://b.example/' }).ok,
      ).toBe(false)
      expect(store.categories[0]?.exercises[0]).toMatchObject({
        name: 'Bankdrücken',
        videoUrl: 'https://a.example/',
      })
      expect(store.updateExercise('exercise-1', { name: 'Neu', videoUrl: '' }).ok).toBe(false)
      expect(store.categories[0]?.exercises[0]?.videoUrl).toBe('https://a.example/')
    })

    it('keeps sessions newest first even if the clock moved backwards', () => {
      seedStorage([
        {
          ...seedCategory(),
          exercises: [
            {
              id: 'exercise-1',
              name: 'Bankdrücken',
              history: [
                { date: '2026-07-14', sets: [{ id: 'future', weight: 60, reps: 8 }] },
                { date: '2026-07-12', sets: [{ id: 'past', weight: 60, reps: 8 }] },
              ],
            },
          ],
        },
      ])
      const store = useGymStore()

      expect(store.logSet('exercise-1', { weight: 65, reps: 5 }).ok).toBe(true)
      expect(store.categories[0]?.exercises[0]?.history.map((session) => session.date)).toEqual([
        '2026-07-14',
        '2026-07-13',
        '2026-07-12',
      ])
    })

    it('puts the pre-import snapshot back when the retried save still does not fit', () => {
      seedStorage()
      localStorage.setItem(PRE_IMPORT_BACKUP_KEY, 'snapshot')
      const store = useGymStore()
      failWritesTo(GYM_STORAGE_KEY)

      expect(store.logSet('exercise-1', { weight: 70, reps: 5 }).ok).toBe(false)
      expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toBe('snapshot')
      expect(store.recoveryCopies.map((copy) => copy.key)).toEqual([PRE_IMPORT_BACKUP_KEY])
    })

    it('asks for persistent storage once, after the first successful save', async () => {
      const persisted = vi.fn().mockResolvedValue(false)
      const persist = vi.fn().mockResolvedValue(true)
      vi.stubGlobal('navigator', { ...navigator, storage: { persisted, persist } })
      const store = useGymStore()
      await vi.waitFor(() => expect(persisted).toHaveBeenCalledTimes(1))
      expect(persist).not.toHaveBeenCalled()

      store.addCategory('Push')
      store.addCategory('Pull')
      await vi.waitFor(() => expect(store.storagePersisted).toBe(true))
      expect(persist).toHaveBeenCalledTimes(1)
      vi.unstubAllGlobals()
    })

    it('does not ask again when storage is already persistent', async () => {
      const persist = vi.fn().mockResolvedValue(true)
      vi.stubGlobal('navigator', {
        ...navigator,
        storage: { persisted: vi.fn().mockResolvedValue(true), persist },
      })
      const store = useGymStore()

      store.addCategory('Push')
      await vi.waitFor(() => expect(store.storagePersisted).toBe(true))
      expect(persist).not.toHaveBeenCalled()
      vi.unstubAllGlobals()
    })

    it('frees the pre-import snapshot when a regular save runs out of space', () => {
      seedStorage()
      localStorage.setItem(PRE_IMPORT_BACKUP_KEY, 'snapshot')
      const store = useGymStore()
      const original = window.localStorage.setItem.bind(window.localStorage)
      vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
        if (key === GYM_STORAGE_KEY && localStorage.getItem(PRE_IMPORT_BACKUP_KEY) !== null) {
          throw new DOMException('Full', 'QuotaExceededError')
        }
        original(key, value)
      })

      expect(store.logSet('exercise-1', { weight: 70, reps: 5 }).ok).toBe(true)
      expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toBeNull()
      expect(store.persistenceError).toContain('vor dem letzten Import wurde gelöscht')
      expect(storedCategories()[0]?.exercises[0]?.history).toHaveLength(2)
    })
  })

  describe('import and export', () => {
    it('exports a compact versioned backup and remembers when it was exported', () => {
      seedStorage()
      const store = useGymStore()

      const exported = store.exportData()
      expect(exported).not.toContain('\n')
      expect(JSON.parse(exported)).toMatchObject({
        app: 'GymBuddie',
        version: GYM_DATA_VERSION,
        categories: [{ name: 'Push' }],
      })

      store.markExported()
      expect(store.lastExportAt).toBe(new Date(2026, 6, 13, 18, 30).toISOString())
      expect(localStorage.getItem(LAST_EXPORT_KEY)).toBe(store.lastExportAt)
    })

    it('imports a backup, keeps a snapshot of the replaced data, and can restore it', () => {
      const originalRaw = seedStorage()
      const store = useGymStore()

      const result = store.importBackup(backupFile([{ id: 'pull', name: 'Pull', exercises: [] }]))

      expect(result).toEqual({
        ok: true,
        summary: { categories: 1, exercises: 0, sets: 0 },
        skipped: 0,
        corrections: 0,
        snapshot: 'saved',
      })
      expect(store.categories.map((category) => category.name)).toEqual(['Pull'])
      expect(storedCategories().map((category) => category.name)).toEqual(['Pull'])
      expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toBe(originalRaw)
      expect(store.recoveryCopies.map((copy) => copy.label)).toEqual([
        'Datenstand vor dem letzten Import',
      ])

      expect(store.recoveryCopies[0]).toMatchObject({
        restorable: true,
        savedAt: '2026-07-12T10:00:00.000Z',
      })
      expect(store.previewRecoveryCopy(PRE_IMPORT_BACKUP_KEY)).toMatchObject({
        ok: true,
        summary: { categories: 1, exercises: 1, sets: 1 },
      })
      expect(store.restoreRecoveryCopy(PRE_IMPORT_BACKUP_KEY).ok).toBe(true)
      expect(store.categories.map((category) => category.name)).toEqual(['Push'])
    })

    it('restores the legacy original copy, which is a raw array, through the stored-data rules', () => {
      const legacyRaw = JSON.stringify([seedCategory()])
      localStorage.setItem(LEGACY_STORAGE_KEY, legacyRaw)
      const store = useGymStore()
      store.addCategory('Neu')

      expect(store.recoveryCopies).toEqual([
        expect.objectContaining({ key: LEGACY_BACKUP_KEY, restorable: true }),
      ])
      // As a file, the same content is rejected, because exported backups are envelopes.
      expect(store.previewBackup(legacyRaw).ok).toBe(false)
      expect(store.restoreRecoveryCopy(LEGACY_BACKUP_KEY)).toMatchObject({ ok: true })
      expect(store.categories.map((category) => category.name)).toEqual(['Push'])
    })

    it('marks unreadable copies as not restorable', () => {
      localStorage.setItem(GYM_STORAGE_KEY, '{not-json')
      const store = useGymStore()

      expect(store.recoveryCopies[0]).toMatchObject({ restorable: false, savedAt: null })
      expect(store.restoreRecoveryCopy(RECOVERY_BACKUP_KEY).ok).toBe(false)
    })

    it('reports that no snapshot was needed on a device without data', () => {
      const store = useGymStore()

      expect(store.importBackup(backupFile([seedCategory()]))).toMatchObject({
        ok: true,
        snapshot: 'not-needed',
      })
      expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toBeNull()
    })

    it('keeps the previous snapshot when an import cannot be saved', () => {
      seedStorage()
      localStorage.setItem(PRE_IMPORT_BACKUP_KEY, 'original snapshot')
      const store = useGymStore()
      failWritesTo(GYM_STORAGE_KEY)

      expect(store.importBackup(backupFile([{ id: 'pull', name: 'Pull', exercises: [] }])).ok).toBe(
        false,
      )
      expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toBe('original snapshot')
    })

    it('labels an old snapshot with its date when a new one cannot be written', () => {
      seedStorage()
      localStorage.setItem(
        PRE_IMPORT_BACKUP_KEY,
        JSON.stringify(createGymDataEnvelope([seedCategory()], '2026-01-05T08:00:00.000Z')),
      )
      const store = useGymStore()
      failWritesTo(PRE_IMPORT_BACKUP_KEY)

      expect(
        store.importBackup(backupFile([{ id: 'pull', name: 'Pull', exercises: [] }])),
      ).toMatchObject({ ok: true, snapshot: 'failed' })
      expect(store.recoveryCopies[0]?.savedAt).toBe('2026-01-05T08:00:00.000Z')
    })

    it('refuses to import over data it cannot read', () => {
      seedStorage()
      const store = useGymStore()
      vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
        throw new DOMException('Denied', 'SecurityError')
      })

      expect(store.importBackup(backupFile([seedCategory()]))).toMatchObject({
        ok: false,
        error: expect.stringContaining('nicht gelesen'),
      })
    })

    it('imports over unpreserved unreadable data only when a snapshot of it can be kept', () => {
      localStorage.setItem(RECOVERY_BACKUP_KEY, 'copy 1')
      localStorage.setItem(`${RECOVERY_BACKUP_KEY}:2`, 'copy 2')
      localStorage.setItem(`${RECOVERY_BACKUP_KEY}:3`, 'copy 3')
      localStorage.setItem(GYM_STORAGE_KEY, '{unreadable')
      const store = useGymStore()
      expect(store.writeBlock).toBe('unpreserved-data')

      const spy = failWritesTo(PRE_IMPORT_BACKUP_KEY)
      expect(store.importBackup(backupFile([seedCategory()])).ok).toBe(false)
      expect(localStorage.getItem(GYM_STORAGE_KEY)).toBe('{unreadable')

      spy.mockRestore()
      expect(store.importBackup(backupFile([seedCategory()])).ok).toBe(true)
      expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toBe('{unreadable')
      expect(store.writeBlock).toBeNull()
      expect(store.addCategory('Pull').ok).toBe(true)
    })

    it.each([
      ['an empty array', '[]'],
      ['a foreign file', JSON.stringify({ app: 'Other', categories: [] })],
      ['junk entries', JSON.stringify([1, 2, 3])],
      ['an empty backup', JSON.stringify(createGymDataEnvelope([]))],
      ['invalid JSON', '{invalid'],
    ])('rejects %s and keeps the current data', (_label, contents) => {
      const originalRaw = seedStorage()
      const store = useGymStore()

      const result = store.importBackup(contents)

      expect(result).toMatchObject({
        ok: false,
        error: expect.stringContaining('Import fehlgeschlagen'),
      })
      expect(store.categories.map((category) => category.name)).toEqual(['Push'])
      expect(localStorage.getItem(GYM_STORAGE_KEY)).toBe(originalRaw)
      expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).toBeNull()
    })

    it('reports skipped entries of an imported backup', () => {
      seedStorage()
      const store = useGymStore()
      const backup = JSON.parse(backupFile([seedCategory()])) as { categories: unknown[] }
      backup.categories.push({ id: 'broken', name: '   ', exercises: [] })

      expect(store.importBackup(JSON.stringify(backup))).toMatchObject({ ok: true, skipped: 1 })
    })

    it('keeps current categories intact when an import cannot be persisted', () => {
      seedStorage()
      const store = useGymStore()
      failWritesTo(GYM_STORAGE_KEY)

      const result = store.importBackup(backupFile([{ id: 'pull', name: 'Pull', exercises: [] }]))

      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('Gerätespeicher') })
      expect(store.categories.map((category) => category.name)).toEqual(['Push'])
    })

    it('deletes recovery copies on request but never touches other keys', () => {
      seedStorage()
      localStorage.setItem(PRE_IMPORT_BACKUP_KEY, 'snapshot')
      const store = useGymStore()

      expect(store.deleteRecoveryCopy(GYM_STORAGE_KEY)).toBe(false)
      expect(store.readRecoveryCopy(GYM_STORAGE_KEY)).toBeNull()
      expect(store.deleteRecoveryCopy(PRE_IMPORT_BACKUP_KEY)).toBe(true)
      expect(store.recoveryCopies).toEqual([])
      expect(localStorage.getItem(GYM_STORAGE_KEY)).not.toBeNull()
    })
  })

  describe('other tabs', () => {
    it('refreshes valid data written by another tab without writing it back', () => {
      const store = useGymStore()
      const setItem = vi.spyOn(window.localStorage, 'setItem')
      seedStorage()
      setItem.mockClear()

      dispatchStorageEvent(GYM_STORAGE_KEY)

      expect(store.categories[0]?.name).toBe('Push')
      expect(store.persistenceStatus).toBe('synced')
      expect(setItem).not.toHaveBeenCalled()
    })

    it('reloads instead of overwriting when another tab saved first', () => {
      seedStorage()
      const store = useGymStore()
      // Another tab logs a set; this tab has not received the storage event yet.
      const otherTab = seedCategory()
      otherTab.exercises[0]?.history[0]?.sets.unshift({ id: 'other-tab', weight: 80, reps: 3 })
      seedStorage([otherTab])

      const result = store.logSet('exercise-1', { weight: 70, reps: 5 })

      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('anderen Tab') })
      const sets = store.categories[0]?.exercises[0]?.history.flatMap((session) => session.sets)
      expect(sets?.map((set) => set.id)).toEqual(['other-tab', 'set-1'])
      expect(store.logSet('exercise-1', { weight: 70, reps: 5 }).ok).toBe(true)
      expect(storedCategories()[0]?.exercises[0]?.history.flatMap((s) => s.sets)).toHaveLength(3)
    })

    it('picks up changes missed while the page was hidden', () => {
      const store = useGymStore()
      seedStorage()

      document.dispatchEvent(new Event('visibilitychange'))

      expect(store.categories[0]?.name).toBe('Push')
    })

    it('blocks writes when another tab stores a newer data version', () => {
      seedStorage()
      const store = useGymStore()
      const newer = JSON.stringify({ app: 'GymBuddie', version: 3, categories: [] })
      localStorage.setItem(GYM_STORAGE_KEY, newer)

      dispatchStorageEvent(GYM_STORAGE_KEY)

      expect(store.writeBlock).toBe('newer-version')
      expect(store.addCategory('Pull').ok).toBe(false)
      expect(localStorage.getItem(GYM_STORAGE_KEY)).toBe(newer)
    })

    it('keeps a copy of unreadable data written by another tab', () => {
      seedStorage()
      const store = useGymStore()
      localStorage.setItem(GYM_STORAGE_KEY, '{broken')

      dispatchStorageEvent(GYM_STORAGE_KEY)

      expect(store.persistenceError).toContain('anderen Tab')
      expect(localStorage.getItem(RECOVERY_BACKUP_KEY)).toBe('{broken')
    })

    it('saves its data again when storage is wiped from outside', () => {
      seedStorage()
      const store = useGymStore()
      localStorage.clear()

      dispatchStorageEvent(null)

      expect(store.categories.map((category) => category.name)).toEqual(['Push'])
      expect(storedCategories().map((category) => category.name)).toEqual(['Push'])
      expect(store.persistenceError).toContain('außerhalb von GymBuddie gelöscht')
    })

    it('follows a removal when it has no data of its own', () => {
      const store = useGymStore()
      localStorage.removeItem(GYM_STORAGE_KEY)

      dispatchStorageEvent(null)

      expect(store.categories).toEqual([])
      expect(store.persistenceError).toBeNull()
    })

    it('keeps a copy before adopting partly invalid data from another tab', () => {
      seedStorage()
      const store = useGymStore()
      const raw = JSON.stringify(
        createGymDataEnvelope([
          {
            ...seedCategory(),
            exercises: [
              {
                id: 'exercise-1',
                name: 'Bankdrücken',
                history: [{ date: '2026-07-12', sets: [{ id: 'x', weight: 2500, reps: 8 }] }],
              },
            ],
          },
        ]),
      )
      localStorage.setItem(GYM_STORAGE_KEY, raw)

      dispatchStorageEvent(GYM_STORAGE_KEY)

      expect(localStorage.getItem(RECOVERY_BACKUP_KEY)).toBe(raw)
      expect(store.writeBlock).toBeNull()
    })

    it('blocks writes when another tab stores unreadable data and no copy fits', () => {
      seedStorage()
      localStorage.setItem(RECOVERY_BACKUP_KEY, 'copy 1')
      localStorage.setItem(`${RECOVERY_BACKUP_KEY}:2`, 'copy 2')
      localStorage.setItem(`${RECOVERY_BACKUP_KEY}:3`, 'copy 3')
      const store = useGymStore()
      localStorage.setItem(GYM_STORAGE_KEY, '{"app":"GymBuddie","version":2,"categories":[')

      dispatchStorageEvent(GYM_STORAGE_KEY)

      expect(store.writeBlock).toBe('unpreserved-data')
      expect(store.addCategory('Pull').ok).toBe(false)
    })

    it('lifts its write block when another tab replaced the unreadable data', () => {
      localStorage.setItem(RECOVERY_BACKUP_KEY, 'copy 1')
      localStorage.setItem(`${RECOVERY_BACKUP_KEY}:2`, 'copy 2')
      localStorage.setItem(`${RECOVERY_BACKUP_KEY}:3`, 'copy 3')
      localStorage.setItem(GYM_STORAGE_KEY, '{unreadable')
      const store = useGymStore()
      expect(store.writeBlock).toBe('unpreserved-data')

      seedStorage()
      dispatchStorageEvent(GYM_STORAGE_KEY)

      expect(store.writeBlock).toBeNull()
      expect(store.addCategory('Pull').ok).toBe(true)
    })
  })
})
