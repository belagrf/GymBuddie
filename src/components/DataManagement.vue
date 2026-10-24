<script setup lang="ts">
import { downloadTextFile } from '@/composables/download'
import { focusById } from '@/composables/focus'
import { useTransientMessage } from '@/composables/useTransientMessage'
import {
  MAX_IMPORT_BYTES,
  summarizeCategories,
  type BackupParseResult,
  type GymDataSummary,
} from '@/domain/gymData'
import { toLocalDateKey, useGymStore, type RecoveryCopy } from '@/stores/gymStore'
import { computed, ref } from 'vue'

type ImportSource = { kind: 'file'; contents: string } | { kind: 'copy'; key: string }

interface PendingImport {
  name: string
  source: ImportSource
  summary: GymDataSummary
  skipped: number
  corrections: number
  savedAt: string | null
}

const gymStore = useGymStore()

const importInput = ref<HTMLInputElement | null>(null)
const pendingImport = ref<PendingImport | null>(null)
const {
  message: dataStatus,
  show: showDataStatus,
  clear: clearDataStatus,
} = useTransientMessage(8_000)
const dataError = ref('')
const confirmDeleteCopyKey = ref<string | null>(null)

const maxImportMegabytes = MAX_IMPORT_BYTES / 1024 / 1024
const dateTimeFormatter = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const currentSummary = computed(() => summarizeCategories(gymStore.categories))

const lastExportText = computed(() => {
  if (!gymStore.lastExportAt) return 'Noch kein Backup auf diesem Gerät erstellt.'
  const date = new Date(gymStore.lastExportAt)
  return Number.isNaN(date.getTime())
    ? 'Letztes Backup: unbekannt.'
    : `Letztes Backup: ${dateTimeFormatter.format(date)}.`
})

const storageText = computed(() => {
  const size = formatSize(gymStore.storedSize)
  if (gymStore.storagePersisted === true) {
    return `Die Daten (${size}) sind dauerhaft gespeichert und werden vom Browser nicht automatisch gelöscht.`
  }
  if (gymStore.storagePersisted === false) {
    return `Der Browser kann die Daten (${size}) bei Speichermangel oder längerer Nichtnutzung löschen. Exportiere regelmäßig ein Backup.`
  }
  return `Die Daten (${size}) liegen nur in diesem Browser. Exportiere regelmäßig ein Backup.`
})

function formatSize(characters: number) {
  if (characters < 1024) return `${characters} Zeichen`
  return `ca. ${Math.max(1, Math.round(characters / 1024)).toLocaleString('de-DE')} KB`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function describeSkipped(skipped: number, future: boolean) {
  const verb = future ? (skipped === 1 ? 'wird' : 'werden') : skipped === 1 ? 'wurde' : 'wurden'
  return `${skipped.toLocaleString('de-DE')} ${skipped === 1 ? 'ungültiger Eintrag' : 'ungültige Einträge'} ${verb} übersprungen.`
}

function describeSummary(summary: GymDataSummary) {
  const plural = (count: number, one: string, many: string) =>
    `${count.toLocaleString('de-DE')} ${count === 1 ? one : many}`
  return [
    plural(summary.categories, 'Kategorie', 'Kategorien'),
    plural(summary.exercises, 'Übung', 'Übungen'),
    plural(summary.sets, 'Satz', 'Sätze'),
  ].join(', ')
}

function resetMessages() {
  clearDataStatus()
  dataError.value = ''
}

function resetFileInput() {
  if (importInput.value) importInput.value.value = ''
}

function handleExport() {
  resetMessages()

  try {
    downloadTextFile(`gymbuddie-backup-${toLocalDateKey()}.json`, gymStore.exportData())
  } catch {
    dataError.value = 'Das Backup konnte nicht erstellt werden.'
    return
  }
  gymStore.markExported()
  showDataStatus('Backup wurde erstellt. Bewahre die Datei an einem sicheren Ort auf.')
}

function openImportReview(name: string, preview: BackupParseResult, source: ImportSource) {
  if (!preview.ok) {
    dataError.value = `„${name}“ kann nicht importiert werden: ${preview.error}`
    resetFileInput()
    return
  }

  pendingImport.value = {
    name,
    source,
    summary: preview.summary,
    skipped: preview.skipped,
    corrections: preview.issues.length,
    savedAt: preview.savedAt,
  }
  void focusById('import-review-heading')
}

async function handleImportSelection(event: Event) {
  resetMessages()
  pendingImport.value = null

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > MAX_IMPORT_BYTES) {
    dataError.value = `Die Datei ist größer als ${maxImportMegabytes} MB und kann nicht importiert werden.`
    resetFileInput()
    return
  }

  let contents: string
  try {
    contents = await file.text()
  } catch {
    dataError.value = 'Die Datei konnte nicht gelesen werden.'
    resetFileInput()
    return
  }
  openImportReview(file.name, gymStore.previewBackup(contents), { kind: 'file', contents })
}

function cancelImport() {
  pendingImport.value = null
  resetFileInput()
  void focusById('import-input')
}

function confirmImport() {
  const pending = pendingImport.value
  if (!pending) return

  resetMessages()
  const result =
    pending.source.kind === 'file'
      ? gymStore.importBackup(pending.source.contents)
      : gymStore.restoreRecoveryCopy(pending.source.key)
  if (!result.ok) {
    dataError.value = result.error
    return
  }

  pendingImport.value = null
  resetFileInput()
  const notes = [
    result.skipped > 0 ? describeSkipped(result.skipped, false) : '',
    result.snapshot === 'saved' ? 'Der vorherige Datenstand ist unten als Kopie gesichert.' : '',
    result.snapshot === 'failed'
      ? 'Der vorherige Datenstand konnte nicht als Kopie gesichert werden.'
      : '',
  ].filter(Boolean)
  const action = pending.source.kind === 'file' ? 'Backup importiert' : 'Kopie wiederhergestellt'
  showDataStatus(`${action}: ${describeSummary(result.summary)}. ${notes.join(' ')}`.trim())
  void focusById('import-input')
}

function copyFileName(copy: RecoveryCopy) {
  const slug = copy.key.replace(/^gymbuddie:backup:/, '').replace(/[^a-z0-9]+/gi, '-')
  return `gymbuddie-kopie-${slug}-${toLocalDateKey()}.json`
}

function downloadCopy(copy: RecoveryCopy) {
  resetMessages()
  const contents = gymStore.readRecoveryCopy(copy.key)
  if (contents === null) {
    dataError.value = 'Die Kopie konnte nicht gelesen werden.'
    return
  }
  try {
    downloadTextFile(copyFileName(copy), contents)
  } catch {
    dataError.value = 'Die Kopie konnte nicht heruntergeladen werden.'
    return
  }
  showDataStatus('Kopie wurde heruntergeladen.')
}

function restoreCopy(copy: RecoveryCopy) {
  resetMessages()
  openImportReview(copy.label, gymStore.previewRecoveryCopy(copy.key), {
    kind: 'copy',
    key: copy.key,
  })
}

function askToDeleteCopy(copy: RecoveryCopy) {
  confirmDeleteCopyKey.value = copy.key
  void focusById(`delete-copy-cancel-${copyDomId(copy)}`)
}

function cancelDeleteCopy(copy: RecoveryCopy) {
  confirmDeleteCopyKey.value = null
  void focusById(`delete-copy-btn-${copyDomId(copy)}`)
}

function deleteCopy(copy: RecoveryCopy) {
  resetMessages()
  confirmDeleteCopyKey.value = null
  if (!gymStore.deleteRecoveryCopy(copy.key)) {
    dataError.value = 'Die Kopie konnte nicht gelöscht werden.'
    return
  }
  showDataStatus('Kopie wurde gelöscht.')
  void focusById('data-heading')
}

function copyDomId(copy: RecoveryCopy) {
  return copy.key.replace(/[^a-z0-9]+/gi, '-')
}
</script>

<template>
  <section
    class="mt-10 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    aria-labelledby="data-heading"
  >
    <div>
      <h2
        id="data-heading"
        class="text-lg font-bold text-gray-900 focus:outline-none"
        tabindex="-1"
      >
        Daten sichern
      </h2>
      <p class="mt-1 text-sm text-gray-600">{{ storageText }}</p>
      <p class="mt-1 text-sm text-gray-600">{{ lastExportText }}</p>
    </div>

    <div class="mt-4 flex flex-wrap gap-2">
      <button
        type="button"
        class="min-h-11 rounded-lg bg-gray-900 px-4 font-semibold text-white transition-colors hover:bg-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
        @click="handleExport"
      >
        Backup exportieren
      </button>

      <label
        class="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-gray-500 bg-white px-4 font-semibold text-gray-800 transition-colors hover:bg-gray-100 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600"
      >
        Backup importieren
        <input
          id="import-input"
          ref="importInput"
          type="file"
          accept="application/json,.json"
          class="sr-only"
          @change="handleImportSelection"
        />
      </label>
    </div>

    <div
      v-if="pendingImport"
      class="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
      role="group"
      aria-labelledby="import-review-heading"
    >
      <h3
        id="import-review-heading"
        class="font-semibold break-words focus:outline-none"
        tabindex="-1"
      >
        „{{ pendingImport.name }}“
        {{ pendingImport.source.kind === 'file' ? 'importieren' : 'wiederherstellen' }}?
      </h3>
      <dl class="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt class="font-medium">
          {{ pendingImport.source.kind === 'file' ? 'Backup' : 'Kopie' }}:
        </dt>
        <dd>{{ describeSummary(pendingImport.summary) }}</dd>
        <template v-if="pendingImport.savedAt">
          <dt class="font-medium">Stand:</dt>
          <dd>{{ formatDateTime(pendingImport.savedAt) }}</dd>
        </template>
        <dt class="font-medium">Aktuell:</dt>
        <dd>{{ describeSummary(currentSummary) }}</dd>
      </dl>
      <p v-if="pendingImport.skipped > 0" class="mt-2">
        {{ describeSkipped(pendingImport.skipped, true) }}
      </p>
      <p v-else-if="pendingImport.corrections > 0" class="mt-2">
        Einige Angaben, etwa ungültige Links, werden beim Übernehmen korrigiert.
      </p>
      <p class="mt-2">
        Die derzeitigen Trainingsdaten auf diesem Gerät werden vollständig ersetzt. Eine Kopie des
        aktuellen Stands wird vorher gesichert, sofern genug Speicher frei ist.
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-11 rounded-lg bg-amber-800 px-4 font-semibold text-white hover:bg-amber-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
          @click="confirmImport"
        >
          Daten ersetzen
        </button>
        <button
          type="button"
          class="min-h-11 rounded-lg border border-amber-700 bg-white px-4 font-semibold text-amber-950 hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
          @click="handleExport"
        >
          Aktuelle Daten zuerst exportieren
        </button>
        <button
          type="button"
          class="min-h-11 rounded-lg border border-gray-500 bg-white px-4 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          @click="cancelImport"
        >
          Abbrechen
        </button>
      </div>
    </div>

    <p v-if="dataError" class="mt-3 text-sm text-red-700" role="alert">{{ dataError }}</p>
    <!-- Always rendered (never display:none) so screen readers announce new messages. -->
    <p class="text-sm text-green-800 [&:not(:empty)]:mt-3" aria-live="polite">{{ dataStatus }}</p>

    <div v-if="gymStore.recoveryCopies.length > 0" class="mt-6 border-t border-gray-100 pt-4">
      <h3 class="font-semibold text-gray-900">Gesicherte Kopien auf diesem Gerät</h3>
      <p class="mt-1 text-sm text-gray-600">
        GymBuddie legt diese Kopien automatisch an, bevor Daten ersetzt oder bereinigt werden.
      </p>
      <ul class="mt-3 space-y-3">
        <li
          v-for="copy in gymStore.recoveryCopies"
          :key="copy.key"
          class="rounded-lg border border-gray-200 p-3 text-sm"
        >
          <p class="font-medium break-words text-gray-900">{{ copy.label }}</p>
          <p class="text-gray-600">
            {{ formatSize(copy.size) }}
            <template v-if="copy.savedAt"> · Stand {{ formatDateTime(copy.savedAt) }}</template>
            <template v-if="!copy.restorable"> · nicht lesbar, nur zum Herunterladen</template>
          </p>

          <div
            v-if="confirmDeleteCopyKey === copy.key"
            class="mt-2"
            role="group"
            :aria-label="`Löschen von ${copy.label} bestätigen`"
          >
            <p class="text-red-950">Diese Kopie endgültig löschen?</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                class="min-h-11 rounded-lg bg-red-700 px-4 font-semibold text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
                @click="deleteCopy(copy)"
              >
                Löschen
              </button>
              <button
                :id="`delete-copy-cancel-${copyDomId(copy)}`"
                type="button"
                class="min-h-11 rounded-lg border border-gray-500 bg-white px-4 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                @click="cancelDeleteCopy(copy)"
              >
                Abbrechen
              </button>
            </div>
          </div>

          <div v-else class="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              class="min-h-11 rounded-lg border border-gray-500 bg-white px-3 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              :aria-label="`${copy.label} herunterladen`"
              @click="downloadCopy(copy)"
            >
              Herunterladen
            </button>
            <button
              v-if="copy.restorable"
              type="button"
              class="min-h-11 rounded-lg border border-gray-500 bg-white px-3 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              :aria-label="`${copy.label} wiederherstellen`"
              @click="restoreCopy(copy)"
            >
              Wiederherstellen
            </button>
            <button
              :id="`delete-copy-btn-${copyDomId(copy)}`"
              type="button"
              class="min-h-11 rounded-lg border border-red-300 bg-white px-3 font-semibold text-red-800 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
              :aria-label="`${copy.label} löschen`"
              @click="askToDeleteCopy(copy)"
            >
              Löschen
            </button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>
