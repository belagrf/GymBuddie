<script setup lang="ts">
import BackupReminder from '@/components/BackupReminder.vue'
import DataManagement from '@/components/DataManagement.vue'
import ExerciseCard from '@/components/ExerciseCard.vue'
import ReorderList from '@/components/ReorderList.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import StorageNotice from '@/components/StorageNotice.vue'
import { CHEVRON_ICON_PATH, PENCIL_ICON_PATH, TRASH_ICON_PATH } from '@/components/icons'
import { focusById } from '@/composables/focus'
import { useToday } from '@/composables/useToday'
import { useTransientMessage } from '@/composables/useTransientMessage'
import { MAX_NAME_LENGTH, normalizeVideoUrl, useGymStore } from '@/stores/gymStore'
import { useRestTimerStore } from '@/stores/restTimerStore'
import { useUiStore } from '@/stores/uiStore'
import { computed, reactive, ref, watch } from 'vue'

const gymStore = useGymStore()
const uiStore = useUiStore()
const restTimer = useRestTimerStore()
// Extra room at the bottom so the timer bar (and the update toast above it) never covers content.
const bottomSpace = computed(() =>
  restTimer.running || restTimer.finishedAt !== null ? 'pb-72' : 'pb-32',
)
const today = useToday()
const reorderMode = ref(false)

const inputClass =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-base placeholder:text-fg-placeholder focus:border-focus focus:outline-none focus:ring-2 focus:ring-accent-ring aria-invalid:border-danger-fg'
const secondaryButtonClass =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-fg transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const headerIconButtonClass =
  'inline-flex min-h-14 min-w-12 shrink-0 items-center justify-center text-fg-subtle transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px]'

const newCategoryName = ref('')
const categoryError = ref('')
const { message: pageStatus, show: showPageStatus, clear: clearPageStatus } = useTransientMessage()

// Only one exercise form is open at a time, so a single draft is enough.
const exerciseFormCategoryId = ref<string | null>(null)
const exerciseForm = reactive({ name: '', videoUrl: '' })
const exerciseFormErrors = reactive({ name: '', videoUrl: '', form: '' })

const renamingCategoryId = ref<string | null>(null)
const renameName = ref('')
const renameError = ref('')

const confirmCategoryDeleteId = ref<string | null>(null)
const categoryDeleteError = ref('')

const totalSetsToday = computed(() =>
  gymStore.categories.reduce(
    (total, category) =>
      total +
      category.exercises.reduce(
        (exerciseTotal, exercise) =>
          exerciseTotal +
          (exercise.history.find((session) => session.date === today.value)?.sets.length ?? 0),
        0,
      ),
    0,
  ),
)

function describedBy(...ids: (string | false)[]) {
  const value = ids.filter(Boolean).join(' ')
  return value || undefined
}

const isCategoryCollapsed = uiStore.isCategoryCollapsed
const toggleCategory = uiStore.toggleCategory

// Forget view state of deleted categories and exercises.
watch(
  () =>
    gymStore.categories.map(
      (category) => `${category.id}:${category.exercises.map((exercise) => exercise.id).join(',')}`,
    ),
  () => {
    // Data hidden by a load error or a write block is not "deleted": keep its view state.
    if (gymStore.writeBlock !== null || gymStore.persistenceStatus === 'error') return
    const categoryIds = new Set(gymStore.categories.map((category) => category.id))
    const exerciseIds = new Set(
      gymStore.categories.flatMap((category) => category.exercises.map((exercise) => exercise.id)),
    )
    uiStore.prune(categoryIds, exerciseIds)
  },
  { immediate: true },
)

function toggleReorderMode() {
  reorderMode.value = !reorderMode.value
  // Drop half-finished inline forms; they are hidden while reordering.
  exerciseFormCategoryId.value = null
  renamingCategoryId.value = null
  confirmCategoryDeleteId.value = null
}

function handleAddCategory() {
  categoryError.value = ''
  clearPageStatus()
  const name = newCategoryName.value.trim()

  if (!name) {
    categoryError.value = 'Gib einen Namen für die Kategorie ein.'
    void focusById('new-category')
    return
  }

  const result = gymStore.addCategory(name)
  if (!result.ok) {
    categoryError.value = result.error
    void focusById('new-category')
    return
  }

  newCategoryName.value = ''
  showPageStatus(`Kategorie „${name}“ hinzugefügt.`)
}

function startRename(categoryId: string, currentName: string) {
  confirmCategoryDeleteId.value = null
  renamingCategoryId.value = categoryId
  renameName.value = currentName
  renameError.value = ''
  void focusById(`rename-category-input-${categoryId}`)
}

function closeRename(categoryId: string) {
  renamingCategoryId.value = null
  void focusById(`rename-category-btn-${categoryId}`)
}

function handleRename(categoryId: string) {
  renameError.value = ''
  if (!renameName.value.trim()) {
    renameError.value = 'Gib einen Namen für die Kategorie ein.'
    void focusById(`rename-category-input-${categoryId}`)
    return
  }

  const result = gymStore.renameCategory(categoryId, renameName.value)
  if (!result.ok) {
    renameError.value = result.error
    return
  }

  showPageStatus(`Kategorie in „${renameName.value.trim()}“ umbenannt.`)
  closeRename(categoryId)
}

function toggleCategoryDelete(categoryId: string) {
  renamingCategoryId.value = null
  categoryDeleteError.value = ''
  confirmCategoryDeleteId.value = confirmCategoryDeleteId.value === categoryId ? null : categoryId
  if (confirmCategoryDeleteId.value) void focusById(`delete-category-cancel-${categoryId}`)
}

function cancelCategoryDelete(categoryId: string) {
  confirmCategoryDeleteId.value = null
  void focusById(`delete-category-btn-${categoryId}`)
}

function handleDeleteCategory(categoryId: string, categoryName: string) {
  clearPageStatus()
  const index = gymStore.categories.findIndex((category) => category.id === categoryId)

  const result = gymStore.deleteCategory(categoryId)
  if (!result.ok) {
    categoryDeleteError.value = result.error
    return
  }

  confirmCategoryDeleteId.value = null
  showPageStatus(`Kategorie „${categoryName}“ gelöscht.`)
  const next = gymStore.categories[index] ?? gymStore.categories[index - 1]
  void focusById(next ? `category-toggle-${next.id}` : 'new-category')
}

function openExerciseForm(categoryId: string) {
  exerciseFormCategoryId.value = categoryId
  exerciseForm.name = ''
  exerciseForm.videoUrl = ''
  Object.assign(exerciseFormErrors, { name: '', videoUrl: '', form: '' })
  void focusById(`new-exercise-name-${categoryId}`)
}

function closeExerciseForm(categoryId: string) {
  exerciseFormCategoryId.value = null
  void focusById(`add-exercise-btn-${categoryId}`)
}

function handleExerciseDeleted(categoryId: string, exerciseName: string) {
  showPageStatus(`Übung „${exerciseName}“ gelöscht.`)
  void focusById(
    `add-exercise-btn-${categoryId}`,
    `new-exercise-name-${categoryId}`,
    `category-toggle-${categoryId}`,
  )
}

function handleAddExercise(categoryId: string) {
  clearPageStatus()
  exerciseFormErrors.form = ''

  const name = exerciseForm.name.trim()
  exerciseFormErrors.name = name ? '' : 'Gib einen Namen für die Übung ein.'
  exerciseFormErrors.videoUrl =
    normalizeVideoUrl(exerciseForm.videoUrl) === null
      ? 'Der Link muss eine gültige Webadresse sein, z. B. youtube.com/watch?v=…'
      : ''

  if (exerciseFormErrors.name || exerciseFormErrors.videoUrl) {
    void focusById(
      exerciseFormErrors.name
        ? `new-exercise-name-${categoryId}`
        : `new-exercise-url-${categoryId}`,
    )
    return
  }

  const result = gymStore.addExercise(categoryId, name, exerciseForm.videoUrl)
  if (!result.ok) {
    exerciseFormErrors.form = result.error
    return
  }
  // A new exercise opens right away, ready for its first set.
  if (result.id) uiStore.setExerciseOpen(result.id, true)

  showPageStatus(`Übung „${name}“ hinzugefügt.`)
  closeExerciseForm(categoryId)
}
</script>

<template>
  <main class="min-h-screen bg-page font-sans text-fg">
    <div class="mx-auto w-full max-w-4xl px-3 pt-5 sm:px-6 sm:pt-7" :class="bottomSpace">
      <header class="mb-7">
        <h1 class="break-words text-4xl font-bold tracking-tight text-fg">GymBuddie</h1>
        <p v-if="totalSetsToday > 0" class="mt-1 text-fg-muted">
          Stark! Du hast heute schon
          <strong class="font-bold text-accent-fg">{{ totalSetsToday }}</strong>
          {{ totalSetsToday === 1 ? 'Satz' : 'Sätze' }} absolviert.
        </p>
        <p v-else class="mt-1 text-fg-muted">Zeit, ins Training zu starten!</p>
      </header>

      <StorageNotice />
      <BackupReminder :today="today" />

      <section aria-labelledby="new-category-heading" class="mb-8">
        <h2
          id="new-category-heading"
          class="mb-2 text-lg font-bold text-fg focus:outline-none"
          tabindex="-1"
        >
          Trainingskategorie hinzufügen
        </h2>
        <form novalidate @submit.prevent="handleAddCategory">
          <label for="new-category" class="text-sm font-medium text-fg-muted">Name</label>
          <div class="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
            <input
              id="new-category"
              v-model="newCategoryName"
              type="text"
              autocomplete="off"
              required
              :maxlength="MAX_NAME_LENGTH"
              placeholder="z. B. Push oder Pull"
              class="min-h-11 w-full min-w-0 rounded-xl border border-line-strong bg-surface px-3 text-base transition-shadow placeholder:text-fg-placeholder focus:border-focus focus:outline-none focus:ring-2 focus:ring-accent-ring aria-invalid:border-danger-fg"
              :aria-invalid="Boolean(categoryError)"
              :aria-describedby="categoryError ? 'category-error' : undefined"
            />
            <button
              type="submit"
              class="min-h-11 shrink-0 rounded-xl bg-blue-600 px-3 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:px-4"
            >
              Hinzufügen
            </button>
          </div>
          <p
            v-if="categoryError"
            id="category-error"
            class="mt-2 text-sm text-danger-fg"
            role="alert"
          >
            {{ categoryError }}
          </p>
        </form>
      </section>

      <p class="sr-only" aria-live="polite">{{ pageStatus }}</p>

      <section aria-labelledby="training-heading">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="training-heading"
            class="text-2xl font-bold text-fg focus:outline-none"
            tabindex="-1"
          >
            Dein Training
          </h2>
          <button
            v-if="
              reorderMode ||
              gymStore.categories.length > 1 ||
              gymStore.categories[0]?.exercises.length
            "
            id="reorder-toggle"
            type="button"
            class="min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            @click="toggleReorderMode"
          >
            {{ reorderMode ? 'Fertig' : 'Reihenfolge ändern' }}
          </button>
        </div>

        <ReorderList v-if="reorderMode && gymStore.categories.length > 0" />

        <div
          v-else-if="gymStore.categories.length === 0"
          class="rounded-xl border border-line bg-surface p-8 text-center text-fg-subtle shadow-sm sm:p-10"
        >
          <p class="font-semibold text-fg">Noch keine Trainingskategorien</p>
          <p class="mt-1">Füge oben deine erste Kategorie hinzu, um loszulegen.</p>
          <p class="mt-1">Oder importiere unten unter „Daten sichern“ ein vorhandenes Backup.</p>
        </div>

        <div v-else class="space-y-4">
          <section
            v-for="category in gymStore.categories"
            :key="category.id"
            class="overflow-hidden rounded-xl border border-line bg-surface shadow-sm"
            :aria-labelledby="`category-${category.id}`"
          >
            <div class="flex min-w-0 items-stretch">
              <h3
                :id="`category-${category.id}`"
                class="flex min-w-0 flex-1 text-xl font-bold text-fg"
              >
                <button
                  :id="`category-toggle-${category.id}`"
                  type="button"
                  class="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-2 pl-4 pr-2 text-left transition-colors hover:bg-surface-hover focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
                  :aria-expanded="!isCategoryCollapsed(category.id)"
                  :aria-controls="`category-content-${category.id}`"
                  @click="toggleCategory(category.id)"
                >
                  <span class="min-w-0 break-words">{{ category.name }}</span>
                  <svg
                    aria-hidden="true"
                    class="h-6 w-6 shrink-0 text-fg-subtle transition-transform duration-200"
                    :class="{ 'rotate-180': !isCategoryCollapsed(category.id) }"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      :d="CHEVRON_ICON_PATH"
                    />
                  </svg>
                </button>
              </h3>
              <button
                :id="`rename-category-btn-${category.id}`"
                type="button"
                :class="[
                  headerIconButtonClass,
                  'hover:bg-info hover:text-accent-fg focus-visible:outline-focus',
                ]"
                :aria-label="`Kategorie ${category.name} umbenennen`"
                :aria-expanded="renamingCategoryId === category.id"
                :aria-controls="`rename-category-${category.id}`"
                @click="
                  renamingCategoryId === category.id
                    ? closeRename(category.id)
                    : startRename(category.id, category.name)
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
                    :d="PENCIL_ICON_PATH"
                  />
                </svg>
              </button>
              <button
                :id="`delete-category-btn-${category.id}`"
                type="button"
                :class="[
                  headerIconButtonClass,
                  'hover:bg-danger-tint hover:text-danger-fg focus-visible:outline-focus-danger',
                ]"
                :aria-label="`Kategorie ${category.name} löschen`"
                :aria-expanded="confirmCategoryDeleteId === category.id"
                :aria-controls="`delete-category-${category.id}`"
                @click="toggleCategoryDelete(category.id)"
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
                    :d="TRASH_ICON_PATH"
                  />
                </svg>
              </button>
            </div>

            <form
              v-if="renamingCategoryId === category.id"
              :id="`rename-category-${category.id}`"
              class="border-t border-info-line bg-info p-4"
              novalidate
              @submit.prevent="handleRename(category.id)"
              @keydown.esc="closeRename(category.id)"
            >
              <label class="block text-sm font-medium text-fg-muted">
                Neuer Name der Kategorie
                <input
                  :id="`rename-category-input-${category.id}`"
                  v-model="renameName"
                  type="text"
                  autocomplete="off"
                  required
                  :maxlength="MAX_NAME_LENGTH"
                  :class="inputClass"
                  :aria-invalid="Boolean(renameError)"
                  :aria-describedby="
                    describedBy(Boolean(renameError) && `rename-category-error-${category.id}`)
                  "
                />
              </label>
              <p
                v-if="renameError"
                :id="`rename-category-error-${category.id}`"
                class="mt-2 text-sm text-danger-fg"
                role="alert"
              >
                {{ renameError }}
              </p>
              <div class="mt-3 flex flex-col gap-2 min-[360px]:flex-row">
                <button
                  type="submit"
                  class="min-h-11 flex-1 rounded-lg bg-blue-600 px-4 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  Namen speichern
                </button>
                <button
                  type="button"
                  :class="[secondaryButtonClass, 'flex-1']"
                  @click="closeRename(category.id)"
                >
                  Abbrechen
                </button>
              </div>
            </form>

            <div
              v-if="confirmCategoryDeleteId === category.id"
              :id="`delete-category-${category.id}`"
              class="border-t border-danger-line bg-danger-tint p-4 text-sm text-danger-strong"
              role="group"
              :aria-label="`Löschen der Kategorie ${category.name} bestätigen`"
            >
              <p class="break-words">
                Kategorie „{{ category.name }}“ mit {{ category.exercises.length }}
                {{ category.exercises.length === 1 ? 'Übung' : 'Übungen' }} und der gesamten
                Historie wirklich löschen?
              </p>
              <p v-if="categoryDeleteError" class="mt-2 text-danger-strong" role="alert">
                {{ categoryDeleteError }}
              </p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-danger"
                  @click="handleDeleteCategory(category.id, category.name)"
                >
                  Endgültig löschen
                </button>
                <button
                  :id="`delete-category-cancel-${category.id}`"
                  type="button"
                  :class="secondaryButtonClass"
                  @click="cancelCategoryDelete(category.id)"
                >
                  Abbrechen
                </button>
              </div>
            </div>

            <Transition>
              <div
                v-show="!isCategoryCollapsed(category.id)"
                :id="`category-content-${category.id}`"
                class="px-4 pb-4"
              >
                <p
                  v-if="category.exercises.length === 0 && exerciseFormCategoryId !== category.id"
                  class="border-t border-line-subtle py-5 text-sm text-fg-subtle"
                >
                  In dieser Kategorie gibt es noch keine Übungen.
                </p>

                <div v-else class="space-y-1">
                  <ExerciseCard
                    v-for="exercise in category.exercises"
                    :key="exercise.id"
                    :category-id="category.id"
                    :exercise="exercise"
                    :today="today"
                    @deleted="(name) => handleExerciseDeleted(category.id, name)"
                  />
                </div>

                <div class="mt-3 border-t border-line-subtle pt-3">
                  <button
                    v-if="exerciseFormCategoryId !== category.id"
                    :id="`add-exercise-btn-${category.id}`"
                    type="button"
                    class="min-h-11 w-full rounded-lg px-3 text-left font-semibold text-accent-fg transition-colors hover:bg-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                    @click="openExerciseForm(category.id)"
                  >
                    + Übung hinzufügen
                  </button>

                  <form
                    v-else
                    class="rounded-lg bg-info p-3"
                    novalidate
                    @submit.prevent="handleAddExercise(category.id)"
                    @keydown.esc="closeExerciseForm(category.id)"
                  >
                    <fieldset class="min-w-0">
                      <legend class="font-semibold break-words text-fg">
                        Neue Übung in {{ category.name }}
                      </legend>
                      <div class="mt-2 space-y-3">
                        <label class="block text-sm font-medium text-fg-muted">
                          Name der Übung
                          <input
                            :id="`new-exercise-name-${category.id}`"
                            v-model="exerciseForm.name"
                            type="text"
                            autocomplete="off"
                            required
                            :maxlength="MAX_NAME_LENGTH"
                            :class="inputClass"
                            :aria-invalid="Boolean(exerciseFormErrors.name)"
                            :aria-describedby="
                              describedBy(
                                Boolean(exerciseFormErrors.name) &&
                                  `new-exercise-name-error-${category.id}`,
                              )
                            "
                          />
                        </label>
                        <p
                          v-if="exerciseFormErrors.name"
                          :id="`new-exercise-name-error-${category.id}`"
                          class="text-sm text-danger-fg"
                        >
                          {{ exerciseFormErrors.name }}
                        </p>
                        <label class="block text-sm font-medium text-fg-muted">
                          Anleitung als Link
                          <span class="font-normal text-fg-subtle">(optional)</span>
                          <input
                            :id="`new-exercise-url-${category.id}`"
                            v-model="exerciseForm.videoUrl"
                            type="url"
                            inputmode="url"
                            autocomplete="off"
                            maxlength="2048"
                            placeholder="https://…"
                            :class="inputClass"
                            :aria-invalid="Boolean(exerciseFormErrors.videoUrl)"
                            :aria-describedby="
                              describedBy(
                                Boolean(exerciseFormErrors.videoUrl) &&
                                  `new-exercise-url-error-${category.id}`,
                              )
                            "
                          />
                        </label>
                        <p
                          v-if="exerciseFormErrors.videoUrl"
                          :id="`new-exercise-url-error-${category.id}`"
                          class="text-sm text-danger-fg"
                        >
                          {{ exerciseFormErrors.videoUrl }}
                        </p>
                      </div>
                    </fieldset>

                    <p
                      v-if="exerciseFormErrors.form"
                      class="mt-2 text-sm text-danger-fg"
                      role="alert"
                    >
                      {{ exerciseFormErrors.form }}
                    </p>

                    <div class="mt-3 flex flex-col gap-2 min-[360px]:flex-row">
                      <button
                        type="submit"
                        class="min-h-11 flex-1 rounded-lg bg-blue-600 px-4 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                      >
                        Übung speichern
                      </button>
                      <button
                        type="button"
                        :class="[secondaryButtonClass, 'flex-1']"
                        @click="closeExerciseForm(category.id)"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </Transition>
          </section>
        </div>
      </section>

      <SettingsPanel />
      <DataManagement />
    </div>
  </main>
</template>

<style>
.v-enter-active,
.v-leave-active {
  transform-origin: top;
  transition: transform 0.2s ease;
}

.v-enter-from,
.v-leave-to {
  transform: scaleY(0.97);
}
</style>
