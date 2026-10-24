<script setup lang="ts">
import { ARROW_DOWN_ICON_PATH, ARROW_UP_ICON_PATH } from '@/components/icons'
import { focusById } from '@/composables/focus'
import { useTransientMessage } from '@/composables/useTransientMessage'
import { useGymStore } from '@/stores/gymStore'
import { ref } from 'vue'

const gymStore = useGymStore()
const error = ref('')
const { message: status, show: showStatus } = useTransientMessage()

const moveButtonClass =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-surface'

function buttonId(kind: 'category' | 'exercise', id: string, offset: -1 | 1) {
  return `move-${kind}-${offset < 0 ? 'up' : 'down'}-${id}`
}

function moveCategory(categoryId: string, name: string, index: number, offset: -1 | 1) {
  error.value = ''
  const target = index + offset
  if (target < 0 || target >= gymStore.categories.length) return

  const result = gymStore.moveCategory(categoryId, offset)
  if (!result.ok) {
    error.value = result.error
    return
  }
  showStatus(`${name}: Position ${target + 1} von ${gymStore.categories.length}.`)
  // Buttons stay focusable at the edges (aria-disabled), so focus can follow the item.
  void focusById(buttonId('category', categoryId, offset))
}

function moveExercise(
  categoryId: string,
  count: number,
  exerciseId: string,
  name: string,
  index: number,
  offset: -1 | 1,
) {
  error.value = ''
  const target = index + offset
  if (target < 0 || target >= count) return

  const result = gymStore.moveExercise(categoryId, exerciseId, offset)
  if (!result.ok) {
    error.value = result.error
    return
  }
  showStatus(`${name}: Position ${target + 1} von ${count}.`)
  void focusById(buttonId('exercise', exerciseId, offset))
}
</script>

<template>
  <div>
    <p class="mb-3 text-sm text-fg-subtle">
      Verschiebe Kategorien und Übungen mit den Pfeilen. Die Reihenfolge wird sofort gespeichert.
    </p>
    <p v-if="error" class="mb-3 text-sm text-danger-fg" role="alert">{{ error }}</p>
    <p class="sr-only" aria-live="polite">{{ status }}</p>

    <ol class="space-y-3">
      <li
        v-for="(category, categoryIndex) in gymStore.categories"
        :key="category.id"
        class="rounded-xl border border-line bg-surface p-3 shadow-sm"
      >
        <div class="flex min-w-0 items-center gap-2">
          <span class="min-w-0 flex-1 text-lg font-bold break-words text-fg">{{
            category.name
          }}</span>
          <button
            :id="buttonId('category', category.id, -1)"
            type="button"
            :class="moveButtonClass"
            :aria-label="`Kategorie ${category.name} nach oben`"
            :aria-disabled="categoryIndex === 0"
            @click="moveCategory(category.id, category.name, categoryIndex, -1)"
          >
            <svg
              aria-hidden="true"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                :d="ARROW_UP_ICON_PATH"
              />
            </svg>
          </button>
          <button
            :id="buttonId('category', category.id, 1)"
            type="button"
            :class="moveButtonClass"
            :aria-label="`Kategorie ${category.name} nach unten`"
            :aria-disabled="categoryIndex === gymStore.categories.length - 1"
            @click="moveCategory(category.id, category.name, categoryIndex, 1)"
          >
            <svg
              aria-hidden="true"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                :d="ARROW_DOWN_ICON_PATH"
              />
            </svg>
          </button>
        </div>

        <ol v-if="category.exercises.length > 0" class="mt-2 space-y-1 border-l-2 border-line pl-3">
          <li
            v-for="(exercise, exerciseIndex) in category.exercises"
            :key="exercise.id"
            class="flex min-w-0 items-center gap-2"
          >
            <span class="min-w-0 flex-1 break-words text-fg">{{ exercise.name }}</span>
            <button
              :id="buttonId('exercise', exercise.id, -1)"
              type="button"
              :class="moveButtonClass"
              :aria-label="`Übung ${exercise.name} nach oben`"
              :aria-disabled="exerciseIndex === 0"
              @click="
                moveExercise(
                  category.id,
                  category.exercises.length,
                  exercise.id,
                  exercise.name,
                  exerciseIndex,
                  -1,
                )
              "
            >
              <svg
                aria-hidden="true"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  :d="ARROW_UP_ICON_PATH"
                />
              </svg>
            </button>
            <button
              :id="buttonId('exercise', exercise.id, 1)"
              type="button"
              :class="moveButtonClass"
              :aria-label="`Übung ${exercise.name} nach unten`"
              :aria-disabled="exerciseIndex === category.exercises.length - 1"
              @click="
                moveExercise(
                  category.id,
                  category.exercises.length,
                  exercise.id,
                  exercise.name,
                  exerciseIndex,
                  1,
                )
              "
            >
              <svg
                aria-hidden="true"
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  :d="ARROW_DOWN_ICON_PATH"
                />
              </svg>
            </button>
          </li>
        </ol>
      </li>
    </ol>
  </div>
</template>
