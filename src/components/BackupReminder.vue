<script setup lang="ts">
import { focusById } from '@/composables/focus'
import { useBackupExport } from '@/composables/useBackupExport'
import { useTransientMessage } from '@/composables/useTransientMessage'
import { useGymStore } from '@/stores/gymStore'
import { useUiStore } from '@/stores/uiStore'
import { computed } from 'vue'

const REMINDER_DAYS = 14
const SNOOZE_DAYS = 3
const DAY_MS = 24 * 60 * 60 * 1000

const props = defineProps<{
  /** Today's date key; changes at midnight so the reminder is re-evaluated. */
  today: string
}>()

const gymStore = useGymStore()
const uiStore = useUiStore()
const { canShareFiles, shareBackup, downloadBackup } = useBackupExport()
const { message: status, show: showStatus } = useTransientMessage(6_000)

function parseTime(value: string | null | undefined) {
  const time = value ? Date.parse(value) : Number.NaN
  return Number.isNaN(time) ? null : time
}

const firstSetTime = computed(() => {
  let earliest: string | null = null
  for (const category of gymStore.categories) {
    for (const exercise of category.exercises) {
      const oldest = exercise.history.at(-1)?.date
      if (oldest && (earliest === null || oldest < earliest)) earliest = oldest
    }
  }
  return earliest ? parseTime(`${earliest}T00:00:00`) : null
})

const lastExportTime = computed(() => parseTime(gymStore.lastExportAt))
// Data restored from a backup is as safe as a fresh export, until it changes.
const baselineTime = computed(() => {
  const times = [lastExportTime.value, parseTime(gymStore.lastImportAt)].filter(
    (time): time is number => time !== null,
  )
  return times.length > 0 ? Math.max(...times) : null
})

const daysSinceBackup = computed(() => {
  // Referencing today makes the reminder re-check after midnight.
  void props.today
  const since = baselineTime.value ?? firstSetTime.value
  return since === null ? 0 : Math.floor((Date.now() - since) / DAY_MS)
})

const visible = computed(() => {
  if (firstSetTime.value === null) return false
  const dataUpdated = parseTime(gymStore.dataUpdatedAt)
  // Nothing new since the last backup: no reason to nag.
  if (baselineTime.value !== null && dataUpdated !== null && dataUpdated <= baselineTime.value) {
    return false
  }
  if (daysSinceBackup.value < REMINDER_DAYS) return false
  const snoozedUntil = parseTime(uiStore.state.reminderSnoozedUntil)
  return snoozedUntil === null || Date.now() >= snoozedUntil
})

// The reminder disappears under the focused button; continue with the next section.
function moveFocusOn() {
  void focusById('new-category-heading', 'new-category')
}

async function backUpNow() {
  if (canShareFiles) {
    const outcome = await shareBackup()
    if (outcome === 'shared') {
      showStatus('Backup gesichert.')
      moveFocusOn()
    }
    if (outcome !== 'failed') return
  }
  const downloaded = downloadBackup()
  showStatus(downloaded ? 'Backup heruntergeladen.' : 'Das Backup konnte nicht erstellt werden.')
  if (downloaded) moveFocusOn()
}

function later() {
  uiStore.snoozeReminder(new Date(Date.now() + SNOOZE_DAYS * DAY_MS))
  showStatus(`Erinnerung in ${SNOOZE_DAYS} Tagen.`)
  moveFocusOn()
}
</script>

<template>
  <div>
    <section
      v-if="visible"
      class="mb-6 rounded-xl border border-info-line bg-info p-4 text-sm text-fg"
      aria-labelledby="backup-reminder-heading"
    >
      <h2 id="backup-reminder-heading" class="font-semibold">
        {{
          baselineTime === null
            ? 'Du hast noch kein Backup erstellt.'
            : lastExportTime === baselineTime
              ? `Dein letztes Backup ist ${daysSinceBackup} Tage alt.`
              : `Seit dem letzten Import sind ${daysSinceBackup} Tage vergangen.`
        }}
      </h2>
      <p class="mt-1 text-fg-muted">
        Deine Trainingsdaten liegen nur auf diesem Gerät. Ein Backup schützt sie, falls der Browser
        Daten löscht oder du das Gerät wechselst.
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-11 rounded-lg bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          @click="backUpNow"
        >
          {{ canShareFiles ? 'Backup teilen' : 'Backup herunterladen' }}
        </button>
        <button
          type="button"
          class="min-h-11 rounded-lg border border-line-strong bg-surface px-4 font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          @click="later"
        >
          Später
        </button>
      </div>
    </section>
    <p class="sr-only" aria-live="polite">{{ status }}</p>
  </div>
</template>
