<script setup lang="ts">
import { useGymStore } from '@/stores/gymStore'
import { ref, watchEffect, computed } from 'vue'

// --- Store und State ---
const gymStore = useGymStore()

const newCategoryName = ref('')
const newExerciseForms = ref<{ [key: string]: { name: string; videoUrl: string } }>({})
const newProgressForms = ref<{
  [key: string]: { weight: number | null; reps: number | null; sets: number | null }
}>({})
const openExerciseFormId = ref<string | null>(null)

// NEU: Zustand für das Ein- und Ausklappen
const collapsedCategories = ref<string[]>([]) // Speichert die IDs der eingeklappten Kategorien
const collapsedHistories = ref<string[]>([]) // Speichert die IDs der eingeklappten Historien

// --- Computed Properties ---
const totalSets = computed(() => {
  let count = 0
  const today = new Date().toISOString().split('T')[0]
  gymStore.categories.forEach((cat) => {
    cat.exercises.forEach((ex) => {
      ex.history.forEach((entry) => {
        if (entry.date === today) {
          count += entry.sets
        }
      })
    })
  })
  return count
})

// --- Lifecycle Hooks ---
watchEffect(() => {
  gymStore.categories.forEach((cat) => {
    if (!newExerciseForms.value[cat.id]) {
      newExerciseForms.value[cat.id] = { name: '', videoUrl: '' }
    }
    cat.exercises.forEach((ex) => {
      if (!newProgressForms.value[ex.id]) {
        newProgressForms.value[ex.id] = { weight: null, reps: null, sets: null }
      }
    })
  })
})

// --- Methoden ---

// NEU: Funktionen zum Umschalten des Zustands
function toggleCategory(categoryId: string) {
  const index = collapsedCategories.value.indexOf(categoryId)
  if (index === -1) {
    collapsedCategories.value.push(categoryId)
  } else {
    collapsedCategories.value.splice(index, 1)
  }
}

function toggleHistory(exerciseId: string) {
  const index = collapsedHistories.value.indexOf(exerciseId)
  if (index === -1) {
    collapsedHistories.value.push(exerciseId)
  } else {
    collapsedHistories.value.splice(index, 1)
  }
}

// Bisherige Methoden...
function handleAddCategory() {
  gymStore.addCategory(newCategoryName.value)
  newCategoryName.value = ''
}

function handleDeleteCategory(categoryId: string, categoryName: string) {
  if (
    window.confirm(
      `Möchtest du die Kategorie "${categoryName}" und alle darin enthaltenen Übungen wirklich löschen?`,
    )
  ) {
    gymStore.deleteCategory(categoryId)
  }
}

function handleAddExercise(categoryId: string) {
  const form = newExerciseForms.value[categoryId]
  if (!form || !form.name) return
  gymStore.addExercise(categoryId, form.name, form.videoUrl)
  form.name = ''
  form.videoUrl = ''
  openExerciseFormId.value = null
}

function handleDeleteExercise(categoryId: string, exerciseId: string, exerciseName: string) {
  if (window.confirm(`Möchtest du die Übung "${exerciseName}" wirklich löschen?`)) {
    gymStore.deleteExercise(categoryId, exerciseId)
  }
}

function handleLogProgress(exerciseId: string) {
  const form = newProgressForms.value[exerciseId]
  if (form && form.weight !== null && form.reps !== null && form.sets !== null) {
    gymStore.logProgress(exerciseId, { weight: form.weight, reps: form.reps, sets: form.sets })
    form.weight = null
    form.reps = null
    form.sets = null
  }
}

function formatDate(dateString: string) {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}
</script>

<style>
/* CSS für die sanfte Ein- und Ausklapp-Animation */
.v-enter-active,
.v-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
  transform-origin: top;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
  transform: scaleY(0.8);
}
</style>

<template>
  <div class="bg-gray-50 font-sans min-h-screen">
    <div class="max-w-4xl mx-auto p-4 sm:p-6">
      <header class="mb-6">
        <h1 class="text-4xl font-bold text-gray-900 tracking-tight">GymBuddie</h1>
        <p v-if="totalSets > 0" class="text-gray-600">
          Stark! Du hast heute schon
          <span class="font-bold text-blue-600">{{ totalSets }}</span> Sätze absolviert.
        </p>
        <p v-else class="text-gray-600">Zeit, ins Training zu starten!</p>
      </header>

      <div class="mb-8">
        <form @submit.prevent="handleAddCategory" class="flex gap-2 items-center">
          <input
            v-model="newCategoryName"
            type="text"
            placeholder="Neue Kategorie (z.B. Push, Pull...)"
            class="flex-grow p-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none transition-shadow"
          />
          <button
            type="submit"
            class="bg-blue-600 text-white font-semibold px-4 py-3 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors shrink-0"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 6v6m0 0v6m0-6h6m-6 0H6"
              />
            </svg>
          </button>
        </form>
      </div>

      <div
        v-if="gymStore.categories.length === 0"
        class="text-center text-gray-500 bg-white p-10 rounded-xl shadow-sm"
      >
        <p class="font-semibold">Willkommen bei GymBuddie!</p>
        <p>Füge deine erste Trainingskategorie hinzu, um loszulegen.</p>
      </div>

      <div class="space-y-4">
        <div
          v-for="category in gymStore.categories"
          :key="category.id"
          class="bg-white rounded-xl shadow-sm transition-all overflow-hidden"
        >
          <div
            @click="toggleCategory(category.id)"
            class="p-4 flex justify-between items-center cursor-pointer hover:bg-gray-50 transition-colors"
          >
            <h3 class="text-xl font-bold text-gray-800">{{ category.name }}</h3>
            <div class="flex items-center gap-3">
              <button
                @click.stop="handleDeleteCategory(category.id, category.name)"
                class="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full z-10"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6 text-gray-400 transition-transform duration-300"
                :class="{ 'rotate-180': !collapsedCategories.includes(category.id) }"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>

          <Transition>
            <div v-if="!collapsedCategories.includes(category.id)">
              <div class="px-4 pb-4 space-y-3">
                <div
                  v-for="exercise in category.exercises"
                  :key="exercise.id"
                  class="border-t border-gray-100 pt-3"
                >
                  <div class="flex justify-between items-start">
                    <div>
                      <h4 class="font-semibold text-lg text-gray-700">{{ exercise.name }}</h4>
                      <a
                        v-if="exercise.videoUrl"
                        :href="exercise.videoUrl"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-sm text-blue-500 hover:underline"
                      >
                        Anleitung ansehen
                      </a>
                    </div>
                    <button
                      @click="handleDeleteExercise(category.id, exercise.id, exercise.name)"
                      class="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full shrink-0 ml-2"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  <form
                    @submit.prevent="handleLogProgress(exercise.id)"
                    class="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3"
                  >
                    <input
                      v-model.number="newProgressForms[exercise.id].weight"
                      type="number"
                      step="0.25"
                      placeholder="kg"
                      class="p-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none w-full text-center"
                    />
                    <input
                      v-model.number="newProgressForms[exercise.id].reps"
                      type="number"
                      placeholder="Wdh"
                      class="p-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none w-full text-center"
                    />
                    <input
                      v-model.number="newProgressForms[exercise.id].sets"
                      type="number"
                      placeholder="Sätze"
                      class="p-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none w-full text-center"
                    />
                    <button
                      type="submit"
                      class="col-span-2 sm:col-span-1 bg-blue-500 text-white font-semibold p-2 rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                      Log
                    </button>
                  </form>

                  <div v-if="exercise.history.length > 0" class="mt-3">
                    <div
                      @click="toggleHistory(exercise.id)"
                      class="flex justify-between items-center cursor-pointer p-2 -mx-2 rounded-lg hover:bg-gray-50"
                    >
                      <h5 class="font-semibold text-sm text-gray-600">
                        Letzte Einträge ({{ exercise.history.length }})
                      </h5>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-5 w-5 text-gray-400 transition-transform duration-300"
                        :class="{ 'rotate-180': !collapsedHistories.includes(exercise.id) }"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                    <Transition>
                      <ul
                        v-if="!collapsedHistories.includes(exercise.id)"
                        class="space-y-1.5 text-sm mt-2"
                      >
                        <li
                          v-for="(entry, index) in exercise.history"
                          :key="index"
                          class="flex justify-between items-center text-gray-600 bg-gray-50 p-2 rounded-lg"
                        >
                          <span>{{ formatDate(entry.date) }}</span>
                          <span class="font-mono text-gray-800 font-medium"
                            >{{ entry.weight }}kg &times; {{ entry.reps }} &times;
                            {{ entry.sets }}</span
                          >
                        </li>
                      </ul>
                    </Transition>
                  </div>
                </div>

                <div class="border-t border-gray-100 pt-3">
                  <div v-if="openExerciseFormId !== category.id">
                    <button
                      @click="openExerciseFormId = category.id"
                      class="w-full text-left text-blue-600 font-semibold p-2 rounded-lg hover:bg-blue-50 transition-colors"
                    >
                      + Übung hinzufügen
                    </button>
                  </div>
                  <form
                    v-else
                    @submit.prevent="handleAddExercise(category.id)"
                    class="bg-blue-50 p-3 rounded-lg space-y-2"
                  >
                    <input
                      v-model="newExerciseForms[category.id].name"
                      type="text"
                      placeholder="Name der Übung"
                      class="w-full p-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <input
                      v-model="newExerciseForms[category.id].videoUrl"
                      type="text"
                      placeholder="Optional: Video-Link"
                      class="w-full p-2 border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none"
                    />
                    <div class="flex gap-2">
                      <button
                        type="submit"
                        class="w-full bg-blue-500 text-white font-semibold p-2 rounded-lg hover:bg-blue-600 transition-colors"
                      >
                        Speichern
                      </button>
                      <button
                        @click="openExerciseFormId = null"
                        type="button"
                        class="w-full bg-gray-200 text-gray-700 font-semibold p-2 rounded-lg hover:bg-gray-300 transition-colors"
                      >
                        Abbrechen
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  </div>
</template>
