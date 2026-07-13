import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  GYM_DATA_VERSION,
  MAX_CATEGORIES,
  MAX_EXERCISES_PER_CATEGORY,
  MAX_SETS_PER_SESSION,
  createGymDataEnvelope,
  toLocalDateKey,
  type Category,
} from '@/domain/gymData'
import {
  GYM_STORAGE_KEY,
  LEGACY_BACKUP_KEY,
  LEGACY_STORAGE_KEY,
  useGymStore,
} from '@/stores/gymStore'

function seedCategory() {
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

describe('gym store', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('migrates legacy data, saves the exact raw backup, and removes the old key', () => {
    const legacyRaw = JSON.stringify([
      {
        id: 'category-1',
        name: 'Push',
        exercises: [
          {
            id: 'exercise-1',
            name: 'Bankdrücken',
            history: [{ date: '2026-07-12', weight: 60, reps: 8, sets: 3 }],
          },
        ],
      },
    ])
    localStorage.setItem(LEGACY_STORAGE_KEY, legacyRaw)

    const store = useGymStore()

    expect(store.categories[0]?.exercises[0]?.history[0]?.sets).toHaveLength(3)
    expect(localStorage.getItem(LEGACY_BACKUP_KEY)).toBe(legacyRaw)
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull()
    expect(JSON.parse(localStorage.getItem(GYM_STORAGE_KEY) ?? '{}')).toMatchObject({
      app: 'GymBuddie',
      version: GYM_DATA_VERSION,
    })
    expect(store.persistenceStatus).toBe('saved')
  })

  it('does not crash when stored JSON is corrupt', () => {
    localStorage.setItem(GYM_STORAGE_KEY, '{not-json')

    const store = useGymStore()

    expect(store.categories).toEqual([])
    expect(store.persistenceStatus).toBe('error')
    expect(store.persistenceError).toContain('konnten nicht geladen werden')
  })

  it('uses UUIDs, strict inputs, normalized URLs, and local date keys', () => {
    const store = useGymStore()

    expect(store.addCategory(' Push ')).toBe(true)
    expect(store.addCategory('   ')).toBe(false)
    const category = store.categories[0]
    expect(category?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    expect(category?.name).toBe('Push')
    if (!category) throw new Error('Expected category')

    expect(store.addExercise(category.id, 'Bankdrücken', 'javascript:alert(1)')).toBe(false)
    expect(store.addExercise(category.id, ' Bankdrücken ', 'https://example.com/demo')).toBe(true)
    const exercise = category.exercises[0]
    expect(exercise?.videoUrl).toBe('https://example.com/demo')
    if (!exercise) throw new Error('Expected exercise')

    expect(store.logSet(exercise.id, { weight: Number.POSITIVE_INFINITY, reps: 10 })).toBe(false)
    expect(store.logSet(exercise.id, { weight: 50, reps: 3.5 })).toBe(false)
    expect(store.logSet(exercise.id, { weight: 50, reps: 10 })).toBe(true)
    expect(exercise.history[0]?.date).toBe(toLocalDateKey())
    expect(exercise.history[0]?.sets[0]?.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('updates and deletes individual sets and removes empty sessions', () => {
    localStorage.setItem(GYM_STORAGE_KEY, JSON.stringify(createGymDataEnvelope([seedCategory()])))
    const store = useGymStore()

    expect(store.updateSet('exercise-1', 'set-1', { weight: 62.5 })).toBe(true)
    expect(store.categories[0]?.exercises[0]?.history[0]?.sets[0]).toMatchObject({
      weight: 62.5,
      reps: 8,
    })
    expect(store.updateSet('exercise-1', 'set-1', { reps: 2.5 })).toBe(false)
    expect(store.updateSet('exercise-1', 'missing', { reps: 9 })).toBe(false)
    expect(store.deleteSet('exercise-1', 'set-1')).toBe(true)
    expect(store.categories[0]?.exercises[0]?.history).toEqual([])
    expect(store.deleteSet('exercise-1', 'set-1')).toBe(false)
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
                  date: toLocalDateKey(),
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
    const categories = [
      fullCategory,
      ...Array.from({ length: MAX_CATEGORIES - 1 }, (_, categoryIndex) => ({
        id: `category-${categoryIndex}`,
        name: `Category ${categoryIndex}`,
        exercises: [],
      })),
    ]
    localStorage.setItem(GYM_STORAGE_KEY, JSON.stringify(createGymDataEnvelope(categories)))
    const store = useGymStore()

    expect(store.addCategory('One too many')).toBe(false)
    expect(store.addExercise('full-category', 'One too many')).toBe(false)
    expect(store.logSet('exercise-0', { weight: 20, reps: 10 })).toBe(false)
    expect(store.categories).toHaveLength(MAX_CATEGORIES)
    expect(store.categories[0]?.exercises).toHaveLength(MAX_EXERCISES_PER_CATEGORY)
    expect(store.categories[0]?.exercises[0]?.history[0]?.sets).toHaveLength(MAX_SETS_PER_SESSION)
  })

  it('exports, imports, sanitizes, and leaves current data intact after an invalid import', () => {
    localStorage.setItem(GYM_STORAGE_KEY, JSON.stringify(createGymDataEnvelope([seedCategory()])))
    const store = useGymStore()

    const exported = store.exportData()
    expect(JSON.parse(exported)).toMatchObject({
      app: 'GymBuddie',
      version: GYM_DATA_VERSION,
      categories: [{ name: 'Push' }],
    })

    expect(
      store.importData(
        JSON.stringify({
          version: GYM_DATA_VERSION,
          categories: [{ id: 'pull', name: 'Pull', exercises: [] }],
        }),
      ),
    ).toBe(true)
    expect(store.categories.map((category) => category.name)).toEqual(['Pull'])
    expect(store.importData('{invalid')).toBe(false)
    expect(store.categories.map((category) => category.name)).toEqual(['Pull'])
    expect(store.persistenceError).toContain('Import fehlgeschlagen')
  })

  it('catches quota errors and exposes persistence status instead of throwing', async () => {
    const store = useGymStore()
    const setItem = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })

    expect(() => store.addCategory('Push')).not.toThrow()
    await nextTick()

    expect(setItem).toHaveBeenCalled()
    expect(store.persistenceStatus).toBe('error')
    expect(store.persistenceError).toContain('Gerätespeicher ist voll')
  })

  it('keeps current categories intact when an import cannot be persisted', () => {
    localStorage.setItem(GYM_STORAGE_KEY, JSON.stringify(createGymDataEnvelope([seedCategory()])))
    const store = useGymStore()
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError')
    })

    const imported = store.importData(
      JSON.stringify({
        version: GYM_DATA_VERSION,
        categories: [{ id: 'pull', name: 'Pull', exercises: [] }],
      }),
    )

    expect(imported).toBe(false)
    expect(store.categories.map((category) => category.name)).toEqual(['Push'])
    expect(store.persistenceStatus).toBe('error')
    expect(store.persistenceError).toContain('Gerätespeicher ist voll')
  })

  it('refreshes valid data written by another tab without writing it back', async () => {
    const store = useGymStore()
    const setItem = vi.spyOn(window.localStorage, 'setItem')
    const newValue = JSON.stringify(createGymDataEnvelope([seedCategory()]))

    window.dispatchEvent(
      new window.StorageEvent('storage', {
        key: GYM_STORAGE_KEY,
        newValue,
      }),
    )
    await nextTick()

    expect(store.categories[0]?.name).toBe('Push')
    expect(store.persistenceStatus).toBe('synced')
    expect(setItem).not.toHaveBeenCalled()
  })
})
