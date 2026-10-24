<script setup lang="ts">
import ProgressChart from '@/components/ProgressChart.vue'
import {
  CHEVRON_ICON_PATH,
  PENCIL_ICON_PATH,
  TRASH_ICON_PATH,
  TROPHY_ICON_PATH,
} from '@/components/icons'
import { focusById } from '@/composables/focus'
import { useTransientMessage } from '@/composables/useTransientMessage'
import { formatDateKey, formatWeight, formatWeightInput } from '@/domain/format'
import { parseRepsInput, parseWeightInput } from '@/domain/setInput'
import {
  earnedRecordIds,
  exerciseRecords,
  progressSeries,
  recordsForNewSet,
  roundEstimate,
  estimatedOneRepMax,
} from '@/domain/stats'
import { useRestTimerStore } from '@/stores/restTimerStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'
import type { Exercise, SetEntry, WorkoutSession } from '@/stores/gymStore'
import {
  MAX_NAME_LENGTH,
  MAX_REPS,
  MAX_WEIGHT_KG,
  normalizeVideoUrl,
  useGymStore,
} from '@/stores/gymStore'
import { computed, nextTick, reactive, ref } from 'vue'

const INITIAL_VISIBLE_SESSIONS = 3
const SESSIONS_PER_PAGE = 10
// A second tap on "Satz speichern" right after a save is treated as a double tap, not a new set.
const DOUBLE_SUBMIT_WINDOW_MS = 1_500

const props = defineProps<{
  categoryId: string
  exercise: Exercise
  /** Today's local date key, kept reactive by the parent so it rolls over at midnight. */
  today: string
}>()

const emit = defineEmits<{
  deleted: [exerciseName: string]
}>()

const gymStore = useGymStore()
const settingsStore = useSettingsStore()
const restTimer = useRestTimerStore()
const uiStore = useUiStore()
const { message: setStatus, show: showSetStatus, clear: clearSetStatus } = useTransientMessage()
const { message: recordMessage, show: showRecord, clear: clearRecord } = useTransientMessage(8_000)

const weightMessage = `Gib ein Gewicht von 0 bis ${MAX_WEIGHT_KG.toLocaleString('de-DE')} kg ein, z. B. 42,5.`
const repsMessage = `Gib ganze Wiederholungen von 1 bis ${MAX_REPS.toLocaleString('de-DE')} ein.`

const inputClass =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-base placeholder:text-fg-placeholder focus:border-focus focus:outline-none focus:ring-2 focus:ring-accent-ring aria-invalid:border-danger-fg'
const secondaryButtonClass =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const stepperClass =
  'inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-surface text-2xl font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
const iconButtonClass =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition-colors focus-visible:outline-2 focus-visible:outline-offset-2'

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

const todaySession = computed(() =>
  props.exercise.history.find((session) => session.date === props.today),
)
// Open by default while the exercise is being trained today; an explicit choice always wins.
const open = computed(() => uiStore.exerciseOpenChoice(id.value) ?? Boolean(todaySession.value))
const showChart = ref(false)
const formEnd = ref<HTMLElement | null>(null)

// The newest session that is not today's: the same session the collapsed summary describes.
const previousSession = computed(() =>
  props.exercise.history.find((session) => session.date !== props.today),
)
/** Last time's sets in the order they were done. */
const previousSets = computed(() => [...(previousSession.value?.sets ?? [])].reverse())
/** The set from last time at the position of the next set today. */
const repeatSuggestion = computed(() => {
  const position = todaySession.value?.sets.length ?? 0
  return previousSets.value[position] ?? previousSets.value.at(-1) ?? null
})

const records = computed(() => exerciseRecords(props.exercise.history))
const recordSetIds = computed(() => earnedRecordIds(props.exercise.history))
const series = computed(() => progressSeries(props.exercise.history))

const latestSession = computed(() => props.exercise.history[0])
const summary = computed(() => {
  const parts: string[] = []
  const today = todaySession.value
  if (today) {
    parts.push(`Heute ${today.sets.length} ${today.sets.length === 1 ? 'Satz' : 'Sätze'}`)
  } else if (latestSession.value) {
    const last = latestSession.value.sets[0]
    parts.push(
      `Zuletzt ${formatDateKey(latestSession.value.date)}${last ? `: ${formatWeight(last.weight)} kg × ${last.reps}` : ''}`,
    )
  } else {
    parts.push('Noch keine Sätze')
  }
  // Only records that beat an earlier set; a single set is not worth a "Rekord".
  const heaviest = records.value.heaviest
  const bodyweight = records.value.mostBodyweightReps
  if (heaviest && recordSetIds.value.has(heaviest.id)) {
    parts.push(`Rekord ${formatWeight(heaviest.weight)} kg`)
  } else if (bodyweight && recordSetIds.value.has(bodyweight.id)) {
    parts.push(`Rekord ${bodyweight.reps} Wdh.`)
  }
  return parts.join(' · ')
})
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

function toggleOpen() {
  uiStore.setExerciseOpen(id.value, !open.value)
}

function roundToGrams(value: number) {
  return Math.round(value * 1000) / 1000
}

function stepWeight(direction: 1 | -1) {
  const step = settingsStore.settings.weightStep
  const current = parseWeightInput(newSet.weight) ?? repeatSuggestion.value?.weight ?? null
  const next = current === null ? (direction > 0 ? step : 0) : current + direction * step
  newSet.weight = formatWeightInput(roundToGrams(Math.min(MAX_WEIGHT_KG, Math.max(0, next))))
  newSetErrors.weight = ''
}

function stepReps(direction: 1 | -1) {
  const current = parseRepsInput(newSet.reps) ?? repeatSuggestion.value?.reps ?? null
  const next = current === null ? 1 : current + direction
  newSet.reps = String(Math.min(MAX_REPS, Math.max(1, next)))
  newSetErrors.reps = ''
}

function repeatLastTime() {
  const suggestion = repeatSuggestion.value
  if (!suggestion) return
  newSet.weight = formatWeightInput(suggestion.weight)
  newSet.reps = String(suggestion.reps)
  newSetErrors.weight = ''
  newSetErrors.reps = ''
  showSetStatus(`Übernommen: ${formatWeight(suggestion.weight)} kg × ${suggestion.reps} Wdh.`)
}

function describeRecord(weight: number, reps: number, kinds: string[]) {
  if (kinds.includes('reps')) return `Neuer Rekord: ${reps} Wiederholungen mit Körpergewicht!`
  const estimate = formatWeight(roundEstimate(estimatedOneRepMax(weight, reps)))
  return kinds.includes('weight')
    ? `Neuer Rekord: ${formatWeight(weight)} kg × ${reps} – so schwer wie noch nie!`
    : `Neuer Rekord: ${formatWeight(weight)} kg × ${reps} (geschätztes Maximum ${estimate} kg)!`
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

  // Records compare against every earlier set, so check before the new one exists.
  const recordKinds = recordsForNewSet(props.exercise.history, { weight, reps })
  const result = gymStore.logSet(props.exercise.id, { weight, reps })
  if (!result.ok) {
    newSetErrors.form = `Der Satz wurde nicht gespeichert. ${result.error}`
    return
  }

  lastLoggedAt = Date.now()
  newSet.reps = ''
  historyExpanded.value = true
  if (recordKinds.length > 0) showRecord(describeRecord(weight, reps, recordKinds))
  else clearRecord()
  showSetStatus(`Satz gespeichert: ${formatWeight(weight)} kg × ${reps} Wdh.`)
  if (settingsStore.settings.restAutoStart) restTimer.start()
  // Keep the save button and a record message clear of the timer bar (html scroll-padding).
  void nextTick(() => {
    if (typeof formEnd.value?.scrollIntoView === 'function') {
      formEnd.value.scrollIntoView({ block: 'nearest' })
    }
  })
}

function startRest() {
  restTimer.start()
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
  <article class="border-t border-line-subtle pt-3" :aria-labelledby="`exercise-${id}`">
    <h4 :id="`exercise-${id}`" class="text-lg font-semibold text-fg">
      <button
        :id="`exercise-toggle-${id}`"
        type="button"
        class="flex min-h-12 w-full min-w-0 items-center justify-between gap-2 rounded-lg px-1 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        :aria-expanded="open"
        :aria-controls="`exercise-details-${id}`"
        @click="toggleOpen"
      >
        <span class="min-w-0">
          <span class="block break-words">{{ exercise.name }}</span>
          <span class="block text-sm font-normal text-fg-subtle">{{ summary }}</span>
        </span>
        <svg
          aria-hidden="true"
          class="h-5 w-5 shrink-0 text-fg-subtle transition-transform duration-200"
          :class="{ 'rotate-180': open }"
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
    </h4>

    <div v-if="open" :id="`exercise-details-${id}`" class="pb-2">
      <div class="flex min-w-0 items-center justify-between gap-1">
        <div class="min-w-0">
          <a
            v-if="safeVideoUrl"
            :href="safeVideoUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-accent-fg underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
              'hover:bg-info hover:text-accent-fg focus-visible:outline-focus',
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
              'hover:bg-danger-tint hover:text-danger-fg focus-visible:outline-focus-danger',
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
        class="mt-2 rounded-lg bg-info p-3"
        novalidate
        @submit.prevent="handleUpdateExercise"
        @keydown.esc="closeExerciseEdit"
      >
        <fieldset class="min-w-0">
          <legend class="font-semibold break-words text-fg">Übung bearbeiten</legend>
          <div class="mt-2 space-y-3">
            <label class="block text-sm font-medium text-fg-muted">
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
              class="text-sm text-danger-fg"
            >
              {{ exerciseFormErrors.name }}
            </p>
            <label class="block text-sm font-medium text-fg-muted">
              Anleitung als Link
              <span class="font-normal text-fg-subtle">(optional)</span>
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
                  describedBy(
                    Boolean(exerciseFormErrors.videoUrl) && `edit-exercise-url-error-${id}`,
                  )
                "
              />
            </label>
            <p
              v-if="exerciseFormErrors.videoUrl"
              :id="`edit-exercise-url-error-${id}`"
              class="text-sm text-danger-fg"
            >
              {{ exerciseFormErrors.videoUrl }}
            </p>
          </div>
        </fieldset>
        <p v-if="exerciseFormErrors.form" class="mt-2 text-sm text-danger-fg" role="alert">
          {{ exerciseFormErrors.form }}
        </p>
        <div class="mt-3 flex flex-col gap-2 min-[360px]:flex-row">
          <button
            type="submit"
            class="min-h-11 flex-1 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Änderungen speichern
          </button>
          <button
            type="button"
            :class="[secondaryButtonClass, 'flex-1']"
            @click="closeExerciseEdit"
          >
            Abbrechen
          </button>
        </div>
      </form>

      <div
        v-if="confirmExerciseDelete"
        :id="`delete-exercise-${id}`"
        class="mt-2 rounded-lg border border-danger-line bg-danger-tint p-3 text-sm text-danger-strong"
        role="group"
        :aria-label="`Löschen von ${exercise.name} bestätigen`"
      >
        <p class="break-words">
          Übung „{{ exercise.name }}“ mit {{ totalHistorySets }}
          {{ totalHistorySets === 1 ? 'Satz' : 'Sätzen' }} wirklich löschen?
        </p>
        <p v-if="exerciseDeleteError" class="mt-2 text-danger-strong" role="alert">
          {{ exerciseDeleteError }}
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-danger"
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

      <div
        v-if="previousSession"
        class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted px-3 py-2 text-sm"
      >
        <p class="min-w-0 text-fg-muted">
          <span class="font-semibold text-fg">Letztes Mal</span>
          ({{ formatDateKey(previousSession.date) }}):
          <span class="tabular-nums">
            {{ previousSets.map((set) => `${formatWeight(set.weight)} × ${set.reps}`).join(' · ') }}
          </span>
        </p>
        <button
          v-if="repeatSuggestion"
          type="button"
          class="min-h-11 shrink-0 rounded-lg border border-line-strong bg-surface px-3 font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          @click="repeatLastTime"
        >
          Wiederholen: {{ formatWeight(repeatSuggestion.weight) }} kg × {{ repeatSuggestion.reps }}
          <span class="sr-only"> (vom letzten Mal übernehmen)</span>
        </button>
      </div>

      <form class="mt-3" novalidate @submit.prevent="handleLogSet">
        <div class="grid min-w-0 gap-3 sm:grid-cols-2">
          <div class="min-w-0">
            <label :for="`weight-${id}`" class="text-xs font-medium text-fg-muted"
              >Gewicht (kg)</label
            >
            <div class="mt-1 flex items-stretch gap-2">
              <button
                type="button"
                :class="stepperClass"
                :aria-label="`Gewicht um ${formatWeight(settingsStore.settings.weightStep)} kg verringern`"
                @click="stepWeight(-1)"
              >
                −
              </button>
              <input
                :id="`weight-${id}`"
                v-model="newSet.weight"
                type="text"
                inputmode="decimal"
                autocomplete="off"
                maxlength="8"
                enterkeyhint="next"
                required
                :class="[inputClass, 'mt-0 text-center text-lg tabular-nums']"
                :placeholder="
                  repeatSuggestion ? formatWeightInput(repeatSuggestion.weight) : 'z. B. 42,5'
                "
                :aria-invalid="Boolean(newSetErrors.weight)"
                :aria-describedby="
                  describedBy(Boolean(newSetErrors.weight) && `weight-error-${id}`)
                "
                @keydown.enter="handleWeightEnter"
              />
              <button
                type="button"
                :class="stepperClass"
                :aria-label="`Gewicht um ${formatWeight(settingsStore.settings.weightStep)} kg erhöhen`"
                @click="stepWeight(1)"
              >
                +
              </button>
            </div>
          </div>
          <div class="min-w-0">
            <label :for="`reps-${id}`" class="text-xs font-medium text-fg-muted"
              >Wiederholungen</label
            >
            <div class="mt-1 flex items-stretch gap-2">
              <button
                type="button"
                :class="stepperClass"
                aria-label="Wiederholungen um 1 verringern"
                @click="stepReps(-1)"
              >
                −
              </button>
              <input
                :id="`reps-${id}`"
                v-model="newSet.reps"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                maxlength="4"
                enterkeyhint="done"
                required
                :class="[inputClass, 'mt-0 text-center text-lg tabular-nums']"
                :placeholder="repeatSuggestion ? String(repeatSuggestion.reps) : 'z. B. 10'"
                :aria-invalid="Boolean(newSetErrors.reps)"
                :aria-describedby="describedBy(Boolean(newSetErrors.reps) && `reps-error-${id}`)"
              />
              <button
                type="button"
                :class="stepperClass"
                aria-label="Wiederholungen um 1 erhöhen"
                @click="stepReps(1)"
              >
                +
              </button>
            </div>
          </div>
        </div>
        <p
          v-if="newSetErrors.weight"
          :id="`weight-error-${id}`"
          class="mt-2 text-sm text-danger-fg"
        >
          {{ newSetErrors.weight }}
        </p>
        <p v-if="newSetErrors.reps" :id="`reps-error-${id}`" class="mt-2 text-sm text-danger-fg">
          {{ newSetErrors.reps }}
        </p>
        <p v-if="newSetErrors.form" class="mt-2 text-sm text-danger-fg" role="alert">
          {{ newSetErrors.form }}
        </p>
        <div class="mt-3 flex gap-2">
          <button
            type="submit"
            class="min-h-12 flex-1 rounded-lg bg-blue-600 px-4 text-lg font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            Satz speichern
          </button>
          <button
            v-if="!settingsStore.settings.restAutoStart"
            type="button"
            :class="secondaryButtonClass"
            @click="startRest"
          >
            Pause starten
          </button>
        </div>
        <p class="sr-only" aria-live="polite">{{ setStatus }}</p>
        <!-- Always rendered, so the record announcement is read out when it appears. -->
        <div ref="formEnd" aria-live="polite">
          <p
            v-if="recordMessage"
            class="mt-3 flex items-center gap-2 rounded-lg border border-warn-line bg-record-tint px-3 py-2 font-semibold text-record-fg"
          >
            <svg
              aria-hidden="true"
              class="h-6 w-6 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                :d="TROPHY_ICON_PATH"
              />
            </svg>
            {{ recordMessage }}
          </p>
        </div>
      </form>

      <div v-if="series.points.length >= 2" class="mt-3">
        <button
          :id="`chart-toggle-${id}`"
          type="button"
          class="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm font-semibold text-fg-muted transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          :aria-expanded="showChart"
          :aria-controls="`chart-${id}`"
          @click="showChart = !showChart"
        >
          Fortschritt
          <svg
            aria-hidden="true"
            class="h-5 w-5 shrink-0 text-fg-subtle transition-transform duration-200"
            :class="{ 'rotate-180': showChart }"
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
        <div v-if="showChart" :id="`chart-${id}`">
          <ProgressChart
            :chart-id="`progress-${id}`"
            :exercise-name="exercise.name"
            :metric="series.metric"
            :points="series.points"
          />
        </div>
      </div>

      <section
        v-if="exercise.history.length > 0"
        class="mt-3"
        :aria-labelledby="`history-heading-${id}`"
      >
        <h5 :id="`history-heading-${id}`" class="sr-only">Trainingshistorie {{ exercise.name }}</h5>
        <button
          :id="`history-toggle-${id}`"
          type="button"
          class="flex min-h-11 w-full min-w-0 items-center justify-between gap-2 rounded-lg px-2 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          :aria-expanded="historyExpanded"
          :aria-controls="`history-${id}`"
          @click="toggleHistory"
        >
          <span class="min-w-0">
            <span class="block text-sm font-semibold text-fg-muted">Trainingshistorie</span>
            <span v-if="latestSession" class="block text-xs text-fg-subtle">
              Zuletzt {{ formatDateKey(latestSession.date) }} · {{ totalHistorySets }}
              {{ totalHistorySets === 1 ? 'Satz' : 'Sätze' }} insgesamt
            </span>
          </span>
          <svg
            aria-hidden="true"
            class="h-5 w-5 shrink-0 text-fg-subtle transition-transform duration-200"
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
              class="rounded-lg bg-surface-muted p-3"
            >
              <h6
                :id="`session-${id}-${session.date}`"
                class="mb-1 font-semibold text-fg focus:outline-none"
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
                    class="rounded-lg border border-info-line bg-surface p-2"
                    novalidate
                    @submit.prevent="handleUpdateSet(set.id)"
                    @keydown.esc="cancelSetEdit(set.id)"
                  >
                    <p class="mb-2 font-semibold text-fg">
                      {{ setLabel(session, index) }} bearbeiten
                    </p>
                    <div class="grid grid-cols-2 gap-2">
                      <label class="min-w-0 text-xs font-medium text-fg-muted">
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
                      <label class="min-w-0 text-xs font-medium text-fg-muted">
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
                      class="mt-2 text-danger-fg"
                    >
                      {{ editSetErrors.weight }}
                    </p>
                    <p
                      v-if="editSetErrors.reps"
                      :id="`set-edit-reps-error-${set.id}`"
                      class="mt-2 text-danger-fg"
                    >
                      {{ editSetErrors.reps }}
                    </p>
                    <p v-if="editSetErrors.form" class="mt-2 text-danger-fg" role="alert">
                      {{ editSetErrors.form }}
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        type="submit"
                        class="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
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
                    class="rounded-lg border border-danger-line bg-surface p-2 text-danger-strong"
                    role="group"
                    :aria-label="`Löschen von ${setLabel(session, index)} bestätigen`"
                  >
                    <p>
                      {{ setLabel(session, index) }} ({{ formatWeight(set.weight) }} kg ×
                      {{ set.reps }} Wdh.) wirklich löschen?
                    </p>
                    <p v-if="setDeleteError" class="mt-2 text-danger-strong" role="alert">
                      {{ setDeleteError }}
                    </p>
                    <div class="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-danger"
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
                      <span class="block text-xs text-fg-subtle"
                        >Satz {{ session.sets.length - index }}</span
                      >
                      <span class="inline-flex items-center gap-1 font-mono font-medium text-fg">
                        {{ formatWeight(set.weight) }} kg × {{ set.reps }} Wdh.
                        <svg
                          v-if="recordSetIds.has(set.id)"
                          aria-hidden="true"
                          class="h-4 w-4 shrink-0 text-record-fg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="1.5"
                            :d="TROPHY_ICON_PATH"
                          />
                        </svg>
                        <span v-if="recordSetIds.has(set.id)" class="sr-only">(Rekord)</span>
                      </span>
                    </div>
                    <div class="flex shrink-0">
                      <button
                        :id="`set-edit-btn-${set.id}`"
                        type="button"
                        :class="[
                          iconButtonClass,
                          'min-h-12 min-w-12 hover:bg-info hover:text-accent-fg focus-visible:outline-focus',
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
                          'min-h-12 min-w-12 hover:bg-danger-tint hover:text-danger-fg focus-visible:outline-focus-danger',
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
              class="min-h-11 w-full rounded-lg px-3 text-left font-semibold text-accent-fg hover:bg-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              @click="showMoreSessions"
            >
              Ältere Einheiten anzeigen
              <span class="font-normal text-fg-subtle">({{ hiddenSessionCount }} weitere)</span>
            </button>
          </div>
        </Transition>
      </section>
    </div>
  </article>
</template>
