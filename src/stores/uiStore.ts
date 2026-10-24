import { defineStore } from 'pinia'
import { reactive } from 'vue'

export const UI_STATE_KEY = 'gymbuddie:ui:v1'

interface UiState {
  collapsedCategories: string[]
  /** Explicit open/closed choices per exercise; exercises without a choice use the default. */
  exerciseOpen: Record<string, boolean>
  reminderSnoozedUntil: string | null
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readState(): UiState {
  const state: UiState = { collapsedCategories: [], exerciseOpen: {}, reminderSnoozedUntil: null }
  try {
    const parsed: unknown = JSON.parse(storage()?.getItem(UI_STATE_KEY) ?? 'null')
    if (typeof parsed !== 'object' || parsed === null) return state
    const input = parsed as Record<string, unknown>

    if (Array.isArray(input.collapsedCategories)) {
      state.collapsedCategories = input.collapsedCategories.filter(
        (id): id is string => typeof id === 'string',
      )
    }
    if (typeof input.exerciseOpen === 'object' && input.exerciseOpen !== null) {
      for (const [id, open] of Object.entries(input.exerciseOpen)) {
        if (typeof open === 'boolean') state.exerciseOpen[id] = open
      }
    }
    if (
      typeof input.reminderSnoozedUntil === 'string' &&
      !Number.isNaN(Date.parse(input.reminderSnoozedUntil))
    ) {
      state.reminderSnoozedUntil = input.reminderSnoozedUntil
    }
  } catch {
    // Start with defaults; UI state is a convenience only.
  }
  return state
}

/** View state that should survive a reload: collapsed categories, open exercises, snoozes. */
export const useUiStore = defineStore('ui', () => {
  // A null-prototype map, so exercise IDs can never collide with Object.prototype members.
  const state = reactive<UiState>(readState())
  state.exerciseOpen = Object.assign(Object.create(null), state.exerciseOpen)

  function save() {
    try {
      storage()?.setItem(UI_STATE_KEY, JSON.stringify(state))
    } catch {
      // Not critical; the view simply resets on the next load.
    }
  }

  function isCategoryCollapsed(categoryId: string) {
    return state.collapsedCategories.includes(categoryId)
  }

  function toggleCategory(categoryId: string) {
    state.collapsedCategories = isCategoryCollapsed(categoryId)
      ? state.collapsedCategories.filter((id) => id !== categoryId)
      : [...state.collapsedCategories, categoryId]
    save()
  }

  function exerciseOpenChoice(exerciseId: string): boolean | undefined {
    return state.exerciseOpen[exerciseId]
  }

  function setExerciseOpen(exerciseId: string, open: boolean) {
    state.exerciseOpen[exerciseId] = open
    save()
  }

  function snoozeReminder(until: Date) {
    state.reminderSnoozedUntil = until.toISOString()
    save()
  }

  /** Drops entries for categories and exercises that no longer exist. */
  function prune(categoryIds: Set<string>, exerciseIds: Set<string>) {
    const collapsed = state.collapsedCategories.filter((id) => categoryIds.has(id))
    const staleExercises = Object.keys(state.exerciseOpen).filter((id) => !exerciseIds.has(id))
    if (collapsed.length === state.collapsedCategories.length && staleExercises.length === 0) return
    state.collapsedCategories = collapsed
    for (const id of staleExercises) delete state.exerciseOpen[id]
    save()
  }

  return {
    state,
    isCategoryCollapsed,
    toggleCategory,
    exerciseOpenChoice,
    setExerciseOpen,
    snoozeReminder,
    prune,
  }
})
