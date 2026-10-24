<script setup lang="ts">
import { CHEVRON_ICON_PATH, PENCIL_ICON_PATH, TRASH_ICON_PATH } from '@/components/icons'
import { focusById } from '@/composables/focus'
import { useTransientMessage } from '@/composables/useTransientMessage'
import { formatDateKey, formatWeight, formatWeightInput } from '@/domain/format'
import { parseRepsInput, parseWeightInput } from '@/domain/setInput'
import type { Exercise, SetEntry, WorkoutSession } from '@/stores/gymStore'
import {
  MAX_NAME_LENGTH,
  MAX_REPS,
  MAX_WEIGHT_KG,
  normalizeVideoUrl,
  useGymStore,
} from '@/stores/gymStore'
import { computed, reactive, ref } from 'vue'

const INITIAL_VISIBLE_SESSIONS = 3
const SESSIONS_PER_PAGE = 10
// A second tap on "Satz speichern" right after a save is treated as a double tap, not a new set.
const DOUBLE_SUBMIT_WINDOW_MS = 1_500

const props = defineProps<{
  categoryId: string
  exercise: Exercise
}>()

const emit = defineEmits<{
  deleted: [exerciseName: string]
}>()

const gymStore = useGymStore()
const { message: setStatus, show: showSetStatus, clear: clearSetStatus } = useTransientMessage()

const weightMessage = `Gib ein Gewicht von 0 bis ${MAX_WEIGHT_KG.toLocaleString('de-DE')} kg ein, z. B. 42,5.`
const repsMessage = `Gib ganze Wiederholungen von 1 bis ${MAX_REPS.toLocaleString('de-DE')} ein.`

const inputClass =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-gray-500 bg-white px-3 text-base placeholder:text-gray-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 aria-invalid:border-red-700'
const secondaryButtonClass =
  'min-h-11 rounded-lg border border-gray-500 bg-white px-4 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600'
const iconButtonClass =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'

const newSet = reactive({ weight: '', reps: '' })
const newSetErrors = reactive({ weight: '', reps: '', form: '' })
let lastLoggedAt = 0

const historyExpanded = ref(true)
const visibleSessionCount = ref(INITIAL_VISIBLE_SESSIONS)

const editingExercise = ref(false)
const exerciseForm = reactive({ name: '', videoUrl: '' })
const exerciseFormErrors = reactive({ name: '', videoUrl: '', form: '' })
const confirmExerciseDelete = ref(false)
const exerciseDeleteError = ref('')

const editingSetId = ref<string | null>(null)
const editSet = reactive({ weight: '', reps: '' })
const editSetErrors = reactive({ weight: '', reps: '', form: '' })
const confirmSetDeleteId = ref<string | null>(null)
const setDeleteError = ref('')

const id = computed(() => props.exercise.id)
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
const visibleSessions = computed(() => props.exercise.history.slice(0, visibleSessionCount.value))
const hiddenSessionCount = computed(() =>
  Math.max(0, props.exercise.history.length - visibleSessionCount.value),
)

function setLabel(session: WorkoutSession, index: number) {
  return `Satz ${session.sets.length - index} vom ${formatDateKey(session.date)}`
}

function describedBy(...ids: (string | false)[]) {
  const value = ids.filter(Boolean).join(' ')
  return value || undefined
}

function handleWeightEnter(event: KeyboardEvent) {
  if (newSet.reps.trim()) return
  // "Weiter" on the weight keyboard should move on to the repetitions, not submit.
  event.preventDefault()
  void focusById(`reps-${id.value}`)
}

function handleLogSet() {
  if (!newSet.reps.trim() && Date.now() - lastLoggedAt < DOUBLE_SUBMIT_WINDOW_MS) return

  newSetErrors.form = ''
  clearSetStatus()

  const weight = parseWeightInput(newSet.weight)
  const reps = parseRepsInput(newSet.reps)
  newSetErrors.weight = weight === null ? weightMessage : ''
  newSetErrors.reps = reps === null ? repsMessage : ''

  if (weight === null || reps === null) {
    void focusById(weight === null ? `weight-${id.value}` : `reps-${id.value}`)
    return
  }

  const result = gymStore.logSet(props.exercise.id, { weight, reps })
  if (!result.ok) {
    newSetErrors.form = `Der Satz wurde nicht gespeichert. ${result.error}`
    return
  }

  lastLoggedAt = Date.now()
  newSet.reps = ''
  historyExpanded.value = true
  showSetStatus(`Satz gespeichert: ${formatWeight(weight)} kg × ${reps} Wdh.`)
}

function startExerciseEdit() {
  confirmExerciseDelete.value = false
  editingExercise.value = true
  exerciseForm.name = props.exercise.name
  exerciseForm.videoUrl = props.exercise.videoUrl ?? ''
  Object.assign(exerciseFormErrors, { name: '', videoUrl: '', form: '' })
  void focusById(`edit-exercise-name-${id.value}`)
}

function closeExerciseEdit() {
  editingExercise.value = false
  void focusById(`edit-exercise-btn-${id.value}`)
}

function handleUpdateExercise() {
  exerciseFormErrors.form = ''
  exerciseFormErrors.name = exerciseForm.name.trim() ? '' : 'Gib einen Namen für die Übung ein.'
  exerciseFormErrors.videoUrl =
    normalizeVideoUrl(exerciseForm.videoUrl) === null
      ? 'Der Link muss eine gültige Webadresse sein, z. B. youtube.com/watch?v=…'
      : ''
  if (exerciseFormErrors.name || exerciseFormErrors.videoUrl) {
    void focusById(
      exerciseFormErrors.name ? `edit-exercise-name-${id.value}` : `edit-exercise-url-${id.value}`,
    )
    return
  }

  const result = gymStore.updateExercise(props.exercise.id, {
    name: exerciseForm.name,
    videoUrl: exerciseForm.videoUrl,
  })
  if (!result.ok) {
    exerciseFormErrors.form = result.error
    return
  }

  showSetStatus('Übung aktualisiert.')
  closeExerciseEdit()
}

function toggleExerciseDelete() {
  editingExercise.value = false
  exerciseDeleteError.value = ''
  confirmExerciseDelete.value = !confirmExerciseDelete.value
  if (confirmExerciseDelete.value) void focusById(`delete-exercise-cancel-${id.value}`)
}

function cancelExerciseDelete() {
  confirmExerciseDelete.value = false
  void focusById(`delete-exercise-btn-${id.value}`)
}

function handleDeleteExercise() {
  const name = props.exercise.name
  const result = gymStore.deleteExercise(props.categoryId, props.exercise.id)
  if (!result.ok) {
    exerciseDeleteError.value = result.error
    return
  }
  emit('deleted', name)
}

function toggleHistory() {
  historyExpanded.value = !historyExpanded.value
}

function showMoreSessions() {
  const firstNewSession = props.exercise.history[visibleSessionCount.value]
  visibleSessionCount.value += SESSIONS_PER_PAGE
  if (firstNewSession) void focusById(`session-${id.value}-${firstNewSession.date}`)
}

function startSetEdit(set: SetEntry) {
  confirmSetDeleteId.value = null
  editingSetId.value = set.id
  editSet.weight = formatWeightInput(set.weight)
  editSet.reps = String(set.reps)
  Object.assign(editSetErrors, { weight: '', reps: '', form: '' })
  clearSetStatus()
  void focusById(`set-edit-weight-${set.id}`)
}

function cancelSetEdit(setId: string) {
  editingSetId.value = null
  void focusById(`set-edit-btn-${setId}`)
}

function handleUpdateSet(setId: string) {
  editSetErrors.form = ''

  const weight = parseWeightInput(editSet.weight)
  const reps = parseRepsInput(editSet.reps)
  editSetErrors.weight = weight === null ? weightMessage : ''
  editSetErrors.reps = reps === null ? repsMessage : ''

  if (weight === null || reps === null) {
    void focusById(weight === null ? `set-edit-weight-${setId}` : `set-edit-reps-${setId}`)
    return
  }

  const result = gymStore.updateSet(props.exercise.id, setId, { weight, reps })
  if (!result.ok) {
    editSetErrors.form = `Der Satz wurde nicht aktualisiert. ${result.error}`
    return
  }

  showSetStatus('Satz aktualisiert.')
  cancelSetEdit(setId)
}

function askToDeleteSet(setId: string) {
  editingSetId.value = null
  setDeleteError.value = ''
  confirmSetDeleteId.value = setId
  void focusById(`set-delete-cancel-${setId}`)
}

function cancelSetDelete(setId: string) {
  confirmSetDeleteId.value = null
  void focusById(`set-delete-btn-${setId}`)
}

function handleDeleteSet(setId: string) {
  const result = gymStore.deleteSet(props.exercise.id, setId)
  if (!result.ok) {
    setDeleteError.value = `Der Satz wurde nicht gelöscht. ${result.error}`
    return
  }

  confirmSetDeleteId.value = null
  showSetStatus('Satz gelöscht.')
  void focusById(
    props.exercise.history.length > 0 ? `history-toggle-${id.value}` : `weight-${id.value}`,
  )
}
</script>

<template>
  <article class="border-t border-gray-100 pt-4" :aria-labelledby="`exercise-${id}`">
    <div class="flex min-w-0 items-start justify-between gap-1">
      <div class="min-w-0 py-1">
        <h4 :id="`exercise-${id}`" class="break-words text-lg font-semibold text-gray-800">
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
          <span class="sr-only"> zu {{ exercise.name }} (öffnet in einem neuen Tab)</span>
        </a>
      </div>

      <div class="flex shrink-0">
        <button
          :id="`edit-exercise-btn-${id}`"
          type="button"
          :class="[
            iconButtonClass,
            'hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-blue-600',
          ]"
          :aria-label="`Übung ${exercise.name} bearbeiten`"
          :aria-expanded="editingExercise"
          :aria-controls="`edit-exercise-form-${id}`"
          @click="editingExercise ? closeExerciseEdit() : startExerciseEdit()"
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
          :id="`delete-exercise-btn-${id}`"
          type="button"
          :class="[
            iconButtonClass,
            'hover:bg-red-50 hover:text-red-700 focus-visible:outline-red-600',
          ]"
          :aria-label="`Übung ${exercise.name} löschen`"
          :aria-expanded="confirmExerciseDelete"
          :aria-controls="`delete-exercise-${id}`"
          @click="toggleExerciseDelete"
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
    </div>

    <form
      v-if="editingExercise"
      :id="`edit-exercise-form-${id}`"
      class="mt-2 rounded-lg bg-blue-50 p-3"
      novalidate
      @submit.prevent="handleUpdateExercise"
      @keydown.esc="closeExerciseEdit"
    >
      <fieldset class="min-w-0">
        <legend class="font-semibold break-words text-gray-900">Übung bearbeiten</legend>
        <div class="mt-2 space-y-3">
          <label class="block text-sm font-medium text-gray-700">
            Name der Übung
            <input
              :id="`edit-exercise-name-${id}`"
              v-model="exerciseForm.name"
              type="text"
              autocomplete="off"
              required
              :maxlength="MAX_NAME_LENGTH"
              :class="inputClass"
              :aria-invalid="Boolean(exerciseFormErrors.name)"
              :aria-describedby="
                describedBy(Boolean(exerciseFormErrors.name) && `edit-exercise-name-error-${id}`)
              "
            />
          </label>
          <p
            v-if="exerciseFormErrors.name"
            :id="`edit-exercise-name-error-${id}`"
            class="text-sm text-red-700"
          >
            {{ exerciseFormErrors.name }}
          </p>
          <label class="block text-sm font-medium text-gray-700">
            Anleitung als Link
            <span class="font-normal text-gray-600">(optional)</span>
            <input
              :id="`edit-exercise-url-${id}`"
              v-model="exerciseForm.videoUrl"
              type="url"
              inputmode="url"
              autocomplete="off"
              maxlength="2048"
              placeholder="https://…"
              :class="inputClass"
              :aria-invalid="Boolean(exerciseFormErrors.videoUrl)"
              :aria-describedby="
                describedBy(Boolean(exerciseFormErrors.videoUrl) && `edit-exercise-url-error-${id}`)
              "
            />
          </label>
          <p
            v-if="exerciseFormErrors.videoUrl"
            :id="`edit-exercise-url-error-${id}`"
            class="text-sm text-red-700"
          >
            {{ exerciseFormErrors.videoUrl }}
          </p>
        </div>
      </fieldset>
      <p v-if="exerciseFormErrors.form" class="mt-2 text-sm text-red-700" role="alert">
        {{ exerciseFormErrors.form }}
      </p>
      <div class="mt-3 flex flex-col gap-2 min-[360px]:flex-row">
        <button
          type="submit"
          class="min-h-11 flex-1 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Änderungen speichern
        </button>
        <button type="button" :class="[secondaryButtonClass, 'flex-1']" @click="closeExerciseEdit">
          Abbrechen
        </button>
      </div>
    </form>

    <div
      v-if="confirmExerciseDelete"
      :id="`delete-exercise-${id}`"
      class="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950"
      role="group"
      :aria-label="`Löschen von ${exercise.name} bestätigen`"
    >
      <p class="break-words">
        Übung „{{ exercise.name }}“ mit {{ totalHistorySets }}
        {{ totalHistorySets === 1 ? 'Satz' : 'Sätzen' }} wirklich löschen?
      </p>
      <p v-if="exerciseDeleteError" class="mt-2 text-red-800" role="alert">
        {{ exerciseDeleteError }}
      </p>
      <div class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          @click="handleDeleteExercise"
        >
          Endgültig löschen
        </button>
        <button
          :id="`delete-exercise-cancel-${id}`"
          type="button"
          :class="secondaryButtonClass"
          @click="cancelExerciseDelete"
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
            :id="`weight-${id}`"
            v-model="newSet.weight"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            maxlength="8"
            enterkeyhint="next"
            required
            :class="inputClass"
            placeholder="z. B. 42,5"
            :aria-invalid="Boolean(newSetErrors.weight)"
            :aria-describedby="describedBy(Boolean(newSetErrors.weight) && `weight-error-${id}`)"
            @keydown.enter="handleWeightEnter"
          />
        </label>
        <label class="min-w-0 text-xs font-medium text-gray-700">
          Wiederholungen
          <input
            :id="`reps-${id}`"
            v-model="newSet.reps"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="4"
            enterkeyhint="done"
            required
            :class="inputClass"
            placeholder="z. B. 10"
            :aria-invalid="Boolean(newSetErrors.reps)"
            :aria-describedby="describedBy(Boolean(newSetErrors.reps) && `reps-error-${id}`)"
          />
        </label>
        <button
          type="submit"
          class="col-span-2 min-h-11 self-end rounded-lg bg-blue-600 px-4 font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 sm:col-span-1"
        >
          Satz speichern
        </button>
      </div>
      <p v-if="newSetErrors.weight" :id="`weight-error-${id}`" class="mt-2 text-sm text-red-700">
        {{ newSetErrors.weight }}
      </p>
      <p v-if="newSetErrors.reps" :id="`reps-error-${id}`" class="mt-2 text-sm text-red-700">
        {{ newSetErrors.reps }}
      </p>
      <p v-if="newSetErrors.form" class="mt-2 text-sm text-red-700" role="alert">
        {{ newSetErrors.form }}
      </p>
      <p class="sr-only" aria-live="polite">{{ setStatus }}</p>
    </form>

    <section
      v-if="exercise.history.length > 0"
      class="mt-3"
      :aria-labelledby="`history-heading-${id}`"
    >
      <h5 :id="`history-heading-${id}`" class="sr-only">Trainingshistorie {{ exercise.name }}</h5>
      <button
        :id="`history-toggle-${id}`"
        type="button"
        class="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-left transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        :aria-expanded="historyExpanded"
        :aria-controls="`history-${id}`"
        @click="toggleHistory"
      >
        <span class="min-w-0">
          <span class="block text-sm font-semibold text-gray-700">Trainingshistorie</span>
          <span v-if="latestSession" class="block text-xs text-gray-600">
            Zuletzt {{ formatDateKey(latestSession.date) }} · {{ totalHistorySets }}
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
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            :d="CHEVRON_ICON_PATH"
          />
        </svg>
      </button>

      <Transition>
        <div v-if="historyExpanded" :id="`history-${id}`" class="mt-2 space-y-3 text-sm">
          <div
            v-for="session in visibleSessions"
            :key="session.date"
            class="rounded-lg bg-gray-50 p-3"
          >
            <h6
              :id="`session-${id}-${session.date}`"
              class="mb-1 font-semibold text-gray-800 focus:outline-none"
              tabindex="-1"
            >
              {{ formatDateKey(session.date) }}
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
                  @keydown.esc="cancelSetEdit(set.id)"
                >
                  <p class="mb-2 font-semibold text-gray-800">
                    {{ setLabel(session, index) }} bearbeiten
                  </p>
                  <div class="grid grid-cols-2 gap-2">
                    <label class="min-w-0 text-xs font-medium text-gray-700">
                      Gewicht (kg)
                      <input
                        :id="`set-edit-weight-${set.id}`"
                        v-model="editSet.weight"
                        type="text"
                        inputmode="decimal"
                        autocomplete="off"
                        maxlength="8"
                        required
                        :class="inputClass"
                        :aria-invalid="Boolean(editSetErrors.weight)"
                        :aria-describedby="
                          describedBy(
                            Boolean(editSetErrors.weight) && `set-edit-weight-error-${set.id}`,
                          )
                        "
                      />
                    </label>
                    <label class="min-w-0 text-xs font-medium text-gray-700">
                      Wiederholungen
                      <input
                        :id="`set-edit-reps-${set.id}`"
                        v-model="editSet.reps"
                        type="text"
                        inputmode="numeric"
                        autocomplete="off"
                        maxlength="4"
                        required
                        :class="inputClass"
                        :aria-invalid="Boolean(editSetErrors.reps)"
                        :aria-describedby="
                          describedBy(
                            Boolean(editSetErrors.reps) && `set-edit-reps-error-${set.id}`,
                          )
                        "
                      />
                    </label>
                  </div>
                  <p
                    v-if="editSetErrors.weight"
                    :id="`set-edit-weight-error-${set.id}`"
                    class="mt-2 text-red-700"
                  >
                    {{ editSetErrors.weight }}
                  </p>
                  <p
                    v-if="editSetErrors.reps"
                    :id="`set-edit-reps-error-${set.id}`"
                    class="mt-2 text-red-700"
                  >
                    {{ editSetErrors.reps }}
                  </p>
                  <p v-if="editSetErrors.form" class="mt-2 text-red-700" role="alert">
                    {{ editSetErrors.form }}
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
                      :class="secondaryButtonClass"
                      @click="cancelSetEdit(set.id)"
                    >
                      Abbrechen
                    </button>
                  </div>
                </form>

                <div
                  v-else-if="confirmSetDeleteId === set.id"
                  class="rounded-lg border border-red-200 bg-white p-2 text-red-950"
                  role="group"
                  :aria-label="`Löschen von ${setLabel(session, index)} bestätigen`"
                >
                  <p>
                    {{ setLabel(session, index) }} ({{ formatWeight(set.weight) }} kg ×
                    {{ set.reps }} Wdh.) wirklich löschen?
                  </p>
                  <p v-if="setDeleteError" class="mt-2 text-red-800" role="alert">
                    {{ setDeleteError }}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                      @click="handleDeleteSet(set.id)"
                    >
                      Löschen
                    </button>
                    <button
                      :id="`set-delete-cancel-${set.id}`"
                      type="button"
                      :class="secondaryButtonClass"
                      @click="cancelSetDelete(set.id)"
                    >
                      Abbrechen
                    </button>
                  </div>
                </div>

                <div v-else class="flex min-w-0 items-center justify-between gap-1">
                  <div class="min-w-0">
                    <span class="block text-xs text-gray-600"
                      >Satz {{ session.sets.length - index }}</span
                    >
                    <span class="font-mono font-medium text-gray-900">
                      {{ formatWeight(set.weight) }} kg × {{ set.reps }} Wdh.
                    </span>
                  </div>
                  <div class="flex shrink-0">
                    <button
                      :id="`set-edit-btn-${set.id}`"
                      type="button"
                      :class="[
                        iconButtonClass,
                        'min-h-12 min-w-12 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-blue-600',
                      ]"
                      :aria-label="`${setLabel(session, index)} bearbeiten`"
                      @click="startSetEdit(set)"
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
                      :id="`set-delete-btn-${set.id}`"
                      type="button"
                      :class="[
                        iconButtonClass,
                        'min-h-12 min-w-12 hover:bg-red-50 hover:text-red-700 focus-visible:outline-red-600',
                      ]"
                      :aria-label="`${setLabel(session, index)} löschen`"
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
                          :d="TRASH_ICON_PATH"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </li>
            </ul>
          </div>

          <button
            v-if="hiddenSessionCount > 0"
            type="button"
            class="min-h-11 w-full rounded-lg px-3 text-left font-semibold text-blue-700 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            @click="showMoreSessions"
          >
            Ältere Einheiten anzeigen
            <span class="font-normal text-gray-600">({{ hiddenSessionCount }} weitere)</span>
          </button>
        </div>
      </Transition>
    </section>
  </article>
</template>
