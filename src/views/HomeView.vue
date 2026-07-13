<script setup lang="ts">
import DataManagement from '@/components/DataManagement.vue'
import ExerciseCard from '@/components/ExerciseCard.vue'
import { MAX_NAME_LENGTH, normalizeVideoUrl, toLocalDateKey, useGymStore } from '@/stores/gymStore'
import { computed, reactive, ref, watchEffect } from 'vue'

interface ExerciseForm {
  name: string
  videoUrl: string
}

const gymStore = useGymStore()

const newCategoryName = ref('')
const categoryError = ref('')
const pageStatus = ref('')
const newExerciseForms = reactive<Record<string, ExerciseForm>>({})
const exerciseErrors = reactive<Record<string, string>>({})
const openExerciseFormId = ref<string | null>(null)
const collapsedCategories = ref<string[]>([])
const confirmCategoryDeleteId = ref<string | null>(null)

const totalSetsToday = computed(() => {
  const today = toLocalDateKey()

  return gymStore.categories.reduce(
    (total, category) =>
      total +
      category.exercises.reduce(
        (exerciseTotal, exercise) =>
          exerciseTotal +
          (exercise.history.find((session) => session.date === today)?.sets.length ?? 0),
        0,
      ),
    0,
  )
})

watchEffect(() => {
  for (const category of gymStore.categories) {
    if (!newExerciseForms[category.id]) {
      newExerciseForms[category.id] = { name: '', videoUrl: '' }
    }
  }
})

function isCategoryCollapsed(categoryId: string) {
  return collapsedCategories.value.includes(categoryId)
}

function toggleCategory(categoryId: string) {
  collapsedCategories.value = isCategoryCollapsed(categoryId)
    ? collapsedCategories.value.filter((id) => id !== categoryId)
    : [...collapsedCategories.value, categoryId]
}

function handleAddCategory() {
  categoryError.value = ''
  pageStatus.value = ''
  const name = newCategoryName.value.trim()

  if (!name) {
    categoryError.value = 'Gib einen Namen für die Kategorie ein.'
    return
  }

  if (name.length > MAX_NAME_LENGTH) {
    categoryError.value = `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`
    return
  }

  if (!gymStore.addCategory(name)) {
    categoryError.value = 'Die Kategorie konnte nicht hinzugefügt werden.'
    return
  }

  newCategoryName.value = ''
  pageStatus.value = `Kategorie „${name}“ hinzugefügt.`
}

function handleDeleteCategory(categoryId: string, categoryName: string) {
  pageStatus.value = ''

  if (gymStore.deleteCategory(categoryId)) {
    confirmCategoryDeleteId.value = null
    pageStatus.value = `Kategorie „${categoryName}“ gelöscht.`
  }
}

function openExerciseForm(categoryId: string) {
  openExerciseFormId.value = categoryId
  exerciseErrors[categoryId] = ''
}

function closeExerciseForm(categoryId: string) {
  openExerciseFormId.value = null
  exerciseErrors[categoryId] = ''
}

function handleExerciseDeleted(exerciseName: string) {
  pageStatus.value = `Übung „${exerciseName}“ gelöscht.`
}

function handleAddExercise(categoryId: string) {
  const form = newExerciseForms[categoryId]
  exerciseErrors[categoryId] = ''
  pageStatus.value = ''

  if (!form) return

  const name = form.name.trim()
  if (!name) {
    exerciseErrors[categoryId] = 'Gib einen Namen für die Übung ein.'
    return
  }

  if (name.length > MAX_NAME_LENGTH) {
    exerciseErrors[categoryId] = `Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`
    return
  }

  const videoUrl = normalizeVideoUrl(form.videoUrl)
  if (videoUrl === null) {
    exerciseErrors[categoryId] = 'Der Link muss eine gültige HTTP- oder HTTPS-Adresse sein.'
    return
  }

  if (!gymStore.addExercise(categoryId, name, videoUrl || undefined)) {
    exerciseErrors[categoryId] = 'Die Übung konnte nicht hinzugefügt werden.'
    return
  }

  form.name = ''
  form.videoUrl = ''
  openExerciseFormId.value = null
  pageStatus.value = `Übung „${name}“ hinzugefügt.`
}
</script>

<template>
  <main class="min-h-screen bg-gray-50 font-sans text-gray-900">
    <div class="mx-auto w-full max-w-4xl px-3 py-5 sm:px-6 sm:py-7">
      <header class="mb-7">
        <h1 class="break-words text-4xl font-bold tracking-tight text-gray-950">GymBuddie</h1>
        <p v-if="totalSetsToday > 0" class="mt-1 text-gray-700">
          Stark! Du hast heute schon
          <strong class="font-bold text-blue-700">{{ totalSetsToday }}</strong>
          {{ totalSetsToday === 1 ? 'Satz' : 'Sätze' }} absolviert.
        </p>
        <p v-else class="mt-1 text-gray-700">Zeit, ins Training zu starten!</p>
      </header>

      <section aria-labelledby="new-category-heading" class="mb-8">
        <h2 id="new-category-heading" class="mb-2 text-lg font-bold text-gray-900">
          Trainingskategorie hinzufügen
        </h2>
        <form novalidate @submit.prevent="handleAddCategory">
          <label for="new-category" class="text-sm font-medium text-gray-700">Name</label>
          <div class="mt-1 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2">
            <input
              id="new-category"
              v-model="newCategoryName"
              type="text"
              autocomplete="off"
              :maxlength="MAX_NAME_LENGTH"
              placeholder="z. B. Push oder Pull"
              class="min-h-11 w-full min-w-0 rounded-xl border border-gray-300 px-3 text-base transition-shadow focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
              :aria-invalid="Boolean(categoryError)"
              :aria-describedby="categoryError ? 'category-error' : undefined"
            />
            <button
              type="submit"
              class="min-h-11 shrink-0 rounded-xl bg-blue-600 px-3 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:px-4"
            >
              Hinzufügen
            </button>
          </div>
          <p
            v-if="categoryError"
            id="category-error"
            class="mt-2 text-sm text-red-700"
            role="alert"
          >
            {{ categoryError }}
          </p>
        </form>
      </section>

      <p
        v-if="pageStatus"
        class="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800"
        aria-live="polite"
      >
        {{ pageStatus }}
      </p>

      <section aria-labelledby="training-heading">
        <h2 id="training-heading" class="mb-3 text-2xl font-bold text-gray-950">Dein Training</h2>

        <div
          v-if="gymStore.categories.length === 0"
          class="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-600 shadow-sm sm:p-10"
        >
          <p class="font-semibold text-gray-900">Noch keine Trainingskategorien</p>
          <p class="mt-1">Füge oben deine erste Kategorie hinzu, um loszulegen.</p>
        </div>

        <div v-else class="space-y-4">
          <section
            v-for="category in gymStore.categories"
            :key="category.id"
            class="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm"
            :aria-labelledby="`category-${category.id}`"
          >
            <div class="flex min-w-0 items-stretch border-b border-transparent">
              <h3
                :id="`category-${category.id}`"
                class="flex min-w-0 flex-1 text-xl font-bold text-gray-900"
              >
                <button
                  type="button"
                  class="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-2 px-4 text-left transition-colors hover:bg-gray-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600"
                  :aria-expanded="!isCategoryCollapsed(category.id)"
                  :aria-controls="`category-content-${category.id}`"
                  @click="toggleCategory(category.id)"
                >
                  <span class="min-w-0 break-words">{{ category.name }}</span>
                  <svg
                    aria-hidden="true"
                    class="h-6 w-6 shrink-0 text-gray-500 transition-transform duration-200"
                    :class="{ 'rotate-180': !isCategoryCollapsed(category.id) }"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="m19 9-7 7-7-7"
                    />
                  </svg>
                </button>
              </h3>
              <button
                type="button"
                class="inline-flex min-h-14 min-w-14 shrink-0 items-center justify-center text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-red-600"
                :aria-label="`Kategorie ${category.name} löschen`"
                :aria-expanded="confirmCategoryDeleteId === category.id"
                :aria-controls="`delete-category-${category.id}`"
                @click="
                  confirmCategoryDeleteId =
                    confirmCategoryDeleteId === category.id ? null : category.id
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
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div
              v-if="confirmCategoryDeleteId === category.id"
              :id="`delete-category-${category.id}`"
              class="border-t border-red-200 bg-red-50 p-4 text-sm text-red-950"
              role="group"
              :aria-label="`Löschen der Kategorie ${category.name} bestätigen`"
            >
              <p>Kategorie, Übungen und gesamte Historie wirklich löschen?</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                  @click="handleDeleteCategory(category.id, category.name)"
                >
                  Endgültig löschen
                </button>
                <button
                  type="button"
                  class="min-h-11 rounded-lg border border-gray-300 bg-white px-4 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  @click="confirmCategoryDeleteId = null"
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
                  v-if="category.exercises.length === 0 && openExerciseFormId !== category.id"
                  class="border-t border-gray-100 py-5 text-sm text-gray-600"
                >
                  In dieser Kategorie gibt es noch keine Übungen.
                </p>

                <div v-else class="space-y-1">
                  <ExerciseCard
                    v-for="exercise in category.exercises"
                    :key="exercise.id"
                    :category-id="category.id"
                    :exercise="exercise"
                    @deleted="handleExerciseDeleted"
                  />
                </div>

                <div class="mt-3 border-t border-gray-100 pt-3">
                  <button
                    v-if="openExerciseFormId !== category.id"
                    type="button"
                    class="min-h-11 w-full rounded-lg px-3 text-left font-semibold text-blue-700 transition-colors hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    @click="openExerciseForm(category.id)"
                  >
                    + Übung hinzufügen
                  </button>

                  <form
                    v-else
                    class="rounded-lg bg-blue-50 p-3"
                    novalidate
                    @submit.prevent="handleAddExercise(category.id)"
                  >
                    <fieldset>
                      <legend class="font-semibold text-gray-900">Neue Übung</legend>
                      <div class="mt-2 space-y-3">
                        <label class="block text-sm font-medium text-gray-700">
                          Name der Übung
                          <input
                            v-model="newExerciseForms[category.id].name"
                            type="text"
                            autofocus
                            autocomplete="off"
                            :maxlength="MAX_NAME_LENGTH"
                            class="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            :aria-invalid="Boolean(exerciseErrors[category.id])"
                          />
                        </label>
                        <label class="block text-sm font-medium text-gray-700">
                          Anleitung als Link
                          <span class="font-normal text-gray-500">(optional)</span>
                          <input
                            v-model="newExerciseForms[category.id].videoUrl"
                            type="url"
                            inputmode="url"
                            autocomplete="url"
                            maxlength="2048"
                            placeholder="https://…"
                            class="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-gray-300 bg-white px-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            :aria-invalid="Boolean(exerciseErrors[category.id])"
                          />
                        </label>
                      </div>
                    </fieldset>

                    <p
                      v-if="exerciseErrors[category.id]"
                      class="mt-2 text-sm text-red-700"
                      role="alert"
                    >
                      {{ exerciseErrors[category.id] }}
                    </p>

                    <div class="mt-3 flex flex-col gap-2 min-[360px]:flex-row">
                      <button
                        type="submit"
                        class="min-h-11 flex-1 rounded-lg bg-blue-600 px-4 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      >
                        Übung speichern
                      </button>
                      <button
                        type="button"
                        class="min-h-11 flex-1 rounded-lg border border-gray-300 bg-white px-4 font-semibold text-gray-800 transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
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
