<script setup lang="ts">
import { useTransientMessage } from '@/composables/useTransientMessage'
import type { Exercise, SetEntry } from '@/stores/gymStore'
import { isValidSetValues, MAX_REPS, MAX_WEIGHT_KG, useGymStore } from '@/stores/gymStore'
import { computed, reactive, ref } from 'vue'

const props = defineProps<{
  categoryId: string
  exercise: Exercise
}>()

const emit = defineEmits<{
  deleted: [exerciseName: string]
}>()

const gymStore = useGymStore()

const newSet = reactive({ weight: '', reps: '' })
const setError = ref('')
const { message: setStatus, show: showSetStatus, clear: clearSetStatus } = useTransientMessage()
const historyExpanded = ref(true)
const confirmExerciseDelete = ref(false)
const confirmSetDeleteId = ref<string | null>(null)
const editingSetId = ref<string | null>(null)
const editSet = reactive({ weight: '', reps: '' })
const editError = ref('')

const historyId = computed(() => `history-${props.exercise.id}`)
const safeVideoUrl = computed(() => {
  if (!props.exercise.videoUrl) return null

  try {
    const url = new URL(props.exercise.videoUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
})

const latestSession = computed(() => props.exercise.history[0])
const totalHistorySets = computed(() =>
  props.exercise.history.reduce((total, session) => total + session.sets.length, 0),
)

function parseWeight(value: string): number | null {
  const normalized = value.trim().replace(',', '.')
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null

  const number = Number(normalized)
  return isValidSetValues(number, 1) ? number : null
}

function parseReps(value: string): number | null {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) return null

  const number = Number(normalized)
  return isValidSetValues(0, number) ? number : null
}

function handleLogSet() {
  setError.value = ''
  clearSetStatus()

  const weight = parseWeight(newSet.weight)
  const reps = parseReps(newSet.reps)

  if (weight === null || reps === null) {
    setError.value = `Gib ein Gewicht von 0 bis ${MAX_WEIGHT_KG.toLocaleString('de-DE')} kg und ganze Wiederholungen von 1 bis ${MAX_REPS.toLocaleString('de-DE')} ein.`
    return
  }

  if (!gymStore.logSet(props.exercise.id, { weight, reps })) {
    setError.value = 'Der Satz konnte nicht gespeichert werden. Versuche es erneut.'
    return
  }

  newSet.reps = ''
  showSetStatus('Satz gespeichert.')
}

function startEdit(set: SetEntry) {
  confirmSetDeleteId.value = null
  editingSetId.value = set.id
  editSet.weight = String(set.weight).replace('.', ',')
  editSet.reps = String(set.reps)
  editError.value = ''
  clearSetStatus()
}

function cancelEdit() {
  editingSetId.value = null
  editError.value = ''
}

function handleUpdateSet(setId: string) {
  editError.value = ''

  const weight = parseWeight(editSet.weight)
  const reps = parseReps(editSet.reps)

  if (weight === null || reps === null) {
    editError.value = `Gib ein Gewicht von 0 bis ${MAX_WEIGHT_KG.toLocaleString('de-DE')} kg und ganze Wiederholungen von 1 bis ${MAX_REPS.toLocaleString('de-DE')} ein.`
    return
  }

  if (!gymStore.updateSet(props.exercise.id, setId, { weight, reps })) {
    editError.value = 'Der Satz konnte nicht aktualisiert werden. Versuche es erneut.'
    return
  }

  editingSetId.value = null
  showSetStatus('Satz aktualisiert.')
}

function askToDeleteSet(setId: string) {
  editingSetId.value = null
  editError.value = ''
  confirmSetDeleteId.value = setId
}

function handleDeleteSet(setId: string) {
  if (!gymStore.deleteSet(props.exercise.id, setId)) {
    confirmSetDeleteId.value = null
    setError.value = 'Der Satz konnte nicht gelöscht werden. Versuche es erneut.'
    return
  }

  confirmSetDeleteId.value = null
  showSetStatus('Satz gelöscht.')
}

function handleDeleteExercise() {
  if (gymStore.deleteExercise(props.categoryId, props.exercise.id)) {
    emit('deleted', props.exercise.name)
  }
}

function formatDate(dateString: string) {
  const [year, month, day] = dateString.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  if (Number.isNaN(date.getTime())) return dateString

  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}
</script>

<template>
  <article class="border-t border-gray-100 pt-4" :aria-labelledby="`exercise-${exercise.id}`">
    <div class="flex min-w-0 items-start justify-between gap-2">
      <div class="min-w-0 py-1">
        <h4 :id="`exercise-${exercise.id}`" class="break-words text-lg font-semibold text-gray-800">
          {{ exercise.name }}
        </h4>
        <a
          v-if="safeVideoUrl"
          :href="safeVideoUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Anleitung ansehen
          <span class="sr-only"> (öffnet in einem neuen Tab)</span>
        </a>
      </div>

      <button
        type="button"
        class="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        :aria-label="`Übung ${exercise.name} löschen`"
        :aria-expanded="confirmExerciseDelete"
        :aria-controls="`delete-exercise-${exercise.id}`"
        @click="confirmExerciseDelete = !confirmExerciseDelete"
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
      v-if="confirmExerciseDelete"
      :id="`delete-exercise-${exercise.id}`"
      class="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950"
      role="group"
      :aria-label="`Löschen von ${exercise.name} bestätigen`"
    >
      <p>Übung und gesamte Historie wirklich löschen?</p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          @click="handleDeleteExercise"
        >
          Endgültig löschen
        </button>
        <button
          type="button"
          class="min-h-11 rounded-lg border border-gray-300 bg-white px-4 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          @click="confirmExerciseDelete = false"
        >
          Abbrechen
        </button>
      </div>
    </div>

    <form class="mt-3" novalidate @submit.prevent="handleLogSet">
      <div class="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label class="min-w-0 text-xs font-medium text-gray-700">
          Gewicht (kg)
          <input
            v-model="newSet.weight"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            maxlength="8"
            enterkeyhint="next"
            class="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="z. B. 42,5"
            :aria-invalid="Boolean(setError)"
            :aria-describedby="setError ? `set-error-${exercise.id}` : undefined"
          />
        </label>
        <label class="min-w-0 text-xs font-medium text-gray-700">
          Wiederholungen
          <input
            v-model="newSet.reps"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="4"
            enterkeyhint="done"
            class="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-3 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="z. B. 10"
            :aria-invalid="Boolean(setError)"
            :aria-describedby="setError ? `set-error-${exercise.id}` : undefined"
          />
        </label>
        <button
          type="submit"
          class="col-span-2 min-h-11 self-end rounded-lg bg-blue-600 px-4 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:col-span-1"
        >
          Satz speichern
        </button>
      </div>
      <p
        v-if="setError"
        :id="`set-error-${exercise.id}`"
        class="mt-2 text-sm text-red-700"
        role="alert"
      >
        {{ setError }}
      </p>
      <p class="sr-only" aria-live="polite">{{ setStatus }}</p>
    </form>

    <section
      v-if="exercise.history.length > 0"
      class="mt-3"
      :aria-labelledby="`history-heading-${exercise.id}`"
    >
      <h5 :id="`history-heading-${exercise.id}`" class="sr-only">Trainingshistorie</h5>
      <button
        type="button"
        class="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        :aria-expanded="historyExpanded"
        :aria-controls="historyId"
        @click="historyExpanded = !historyExpanded"
      >
        <span class="min-w-0">
          <span class="block text-sm font-semibold text-gray-700">Trainingshistorie</span>
          <span v-if="latestSession" class="block truncate text-xs text-gray-500">
            Zuletzt {{ formatDate(latestSession.date) }} · {{ totalHistorySets }}
            {{ totalHistorySets === 1 ? 'Satz' : 'Sätze' }} insgesamt
          </span>
        </span>
        <svg
          aria-hidden="true"
          class="h-5 w-5 shrink-0 text-gray-500 transition-transform duration-200"
          :class="{ 'rotate-180': historyExpanded }"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 9-7 7-7-7" />
        </svg>
      </button>

      <Transition>
        <div v-show="historyExpanded" :id="historyId" class="mt-2 space-y-3 text-sm">
          <section
            v-for="session in exercise.history"
            :key="session.date"
            class="rounded-lg bg-gray-50 p-3"
            :aria-labelledby="`session-${exercise.id}-${session.date}`"
          >
            <h6
              :id="`session-${exercise.id}-${session.date}`"
              class="mb-1 font-semibold text-gray-800"
            >
              {{ formatDate(session.date) }}
            </h6>
            <ul class="space-y-1">
              <li
                v-for="(set, index) in session.sets"
                :key="set.id"
                class="rounded-lg border border-transparent py-1"
              >
                <form
                  v-if="editingSetId === set.id"
                  class="rounded-lg border border-blue-200 bg-white p-2"
                  novalidate
                  @submit.prevent="handleUpdateSet(set.id)"
                >
                  <p class="mb-2 font-semibold text-gray-800">Satz bearbeiten</p>
                  <div class="grid grid-cols-2 gap-2">
                    <label class="min-w-0 text-xs font-medium text-gray-700">
                      Gewicht (kg)
                      <input
                        v-model="editSet.weight"
                        type="text"
                        inputmode="decimal"
                        maxlength="8"
                        class="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        :aria-invalid="Boolean(editError)"
                        :aria-describedby="
                          editError ? `edit-error-${exercise.id}-${set.id}` : undefined
                        "
                      />
                    </label>
                    <label class="min-w-0 text-xs font-medium text-gray-700">
                      Wiederholungen
                      <input
                        v-model="editSet.reps"
                        type="text"
                        inputmode="numeric"
                        maxlength="4"
                        class="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-gray-300 px-2 text-base focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200"
                        :aria-invalid="Boolean(editError)"
                        :aria-describedby="
                          editError ? `edit-error-${exercise.id}-${set.id}` : undefined
                        "
                      />
                    </label>
                  </div>
                  <p
                    v-if="editError"
                    :id="`edit-error-${exercise.id}-${set.id}`"
                    class="mt-2 text-red-700"
                    role="alert"
                  >
                    {{ editError }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      type="submit"
                      class="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                      Änderungen speichern
                    </button>
                    <button
                      type="button"
                      class="min-h-11 rounded-lg border border-gray-300 bg-white px-4 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      @click="cancelEdit"
                    >
                      Abbrechen
                    </button>
                  </div>
                </form>

                <div
                  v-else-if="confirmSetDeleteId === set.id"
                  class="rounded-lg border border-red-200 bg-white p-2 text-red-950"
                  role="group"
                  :aria-label="`Löschen von Satz ${session.sets.length - index} bestätigen`"
                >
                  <p>Diesen Satz wirklich löschen?</p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                      @click="handleDeleteSet(set.id)"
                    >
                      Löschen
                    </button>
                    <button
                      type="button"
                      class="min-h-11 rounded-lg border border-gray-300 bg-white px-4 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      @click="confirmSetDeleteId = null"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>

                <div v-else class="flex min-w-0 items-center justify-between gap-1">
                  <div class="min-w-0">
                    <span class="block text-xs text-gray-500"
                      >Satz {{ session.sets.length - index }}</span
                    >
                    <span class="font-mono font-medium text-gray-900">
                      {{ set.weight }} kg × {{ set.reps }} Wdh.
                    </span>
                  </div>
                  <div class="flex shrink-0">
                    <button
                      type="button"
                      class="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-gray-600 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                      :aria-label="`Satz ${session.sets.length - index} bearbeiten`"
                      @click="startEdit(set)"
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
                          d="m16.862 3.487 1.651-1.65a1.875 1.875 0 1 1 2.652 2.652L10.582 15.072a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.686a4.5 4.5 0 0 1 1.13-1.897L16.862 3.487Zm0 0L19.5 6.125M18 14.25v4.125A2.625 2.625 0 0 1 15.375 21H5.625A2.625 2.625 0 0 1 3 18.375V8.625A2.625 2.625 0 0 1 5.625 6H9.75"
                        />
                      </svg>
                    </button>
                    <button
                      type="button"
                      class="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-gray-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                      :aria-label="`Satz ${session.sets.length - index} löschen`"
                      @click="askToDeleteSet(set.id)"
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
                          d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673A2.25 2.25 0 0 1 15.916 21H8.084a2.25 2.25 0 0 1-2.244-1.327L4.772 5.79m14.456 0A48.108 48.108 0 0 0 15.75 5.5m-11.978.29c.34-.059.68-.114 1.022-.165m0 0A48.11 48.11 0 0 1 8.25 5.5m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201V5.5m7.5 0a48.667 48.667 0 0 0-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </Transition>
    </section>
  </article>
</template>
