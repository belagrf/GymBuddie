<script setup lang="ts">
import { useTransientMessage } from '@/composables/useTransientMessage'
import { toLocalDateKey, useGymStore } from '@/stores/gymStore'
import { ref } from 'vue'

const gymStore = useGymStore()

const importInput = ref<HTMLInputElement | null>(null)
const pendingImport = ref<{ name: string; contents: string } | null>(null)
const { message: dataStatus, show: showDataStatus, clear: clearDataStatus } = useTransientMessage()
const dataError = ref('')

function resetMessages() {
  clearDataStatus()
  dataError.value = ''
  gymStore.clearPersistenceError()
}

function handleExport() {
  resetMessages()

  try {
    const contents = gymStore.exportData()
    const blob = new Blob([contents], { type: 'application/json;charset=utf-8' })
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = `gymbuddie-backup-${toLocalDateKey()}.json`
    link.click()
    URL.revokeObjectURL(objectUrl)
    showDataStatus('Backup wurde erstellt.')
  } catch {
    dataError.value = 'Das Backup konnte nicht erstellt werden.'
  }
}

async function handleImportSelection(event: Event) {
  resetMessages()
  pendingImport.value = null

  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (file.size > 5 * 1024 * 1024) {
    dataError.value = 'Die Datei ist größer als 5 MB und kann nicht importiert werden.'
    input.value = ''
    return
  }

  try {
    pendingImport.value = { name: file.name, contents: await file.text() }
  } catch {
    dataError.value = 'Die Datei konnte nicht gelesen werden.'
    input.value = ''
  }
}

function cancelImport() {
  pendingImport.value = null
  if (importInput.value) importInput.value.value = ''
}

function confirmImport() {
  if (!pendingImport.value) return

  resetMessages()
  const imported = gymStore.importData(pendingImport.value.contents)

  if (imported) {
    showDataStatus('Backup wurde importiert.')
    cancelImport()
    return
  }

  if (!gymStore.persistenceError) {
    dataError.value = 'Die Datei enthält kein gültiges GymBuddie-Backup.'
  }
}
</script>

<template>
  <section
    class="mt-10 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
    aria-labelledby="data-heading"
  >
    <div>
      <h2 id="data-heading" class="text-lg font-bold text-gray-900">Daten sichern</h2>
      <p class="text-sm text-gray-600">Deine Trainingsdaten bleiben auf diesem Gerät.</p>
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
        class="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-4 font-semibold text-gray-800 transition-colors hover:bg-gray-100 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-600"
      >
        Backup importieren
        <input
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
      aria-label="Import bestätigen"
    >
      <p class="font-semibold">„{{ pendingImport.name }}“ importieren?</p>
      <p class="mt-1">Dabei werden die derzeitigen Trainingsdaten auf diesem Gerät ersetzt.</p>
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
          class="min-h-11 rounded-lg border border-gray-300 bg-white px-4 font-semibold text-gray-800 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          @click="cancelImport"
        >
          Abbrechen
        </button>
      </div>
    </div>

    <div
      v-if="gymStore.persistenceError"
      class="mt-4 flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <p>{{ gymStore.persistenceError }}</p>
      <button
        type="button"
        class="min-h-11 shrink-0 rounded-lg border border-red-300 bg-white px-3 font-semibold hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        @click="gymStore.clearPersistenceError()"
      >
        Hinweis schließen
      </button>
    </div>

    <p v-if="dataError" class="mt-3 text-sm text-red-700" role="alert">{{ dataError }}</p>
    <p v-if="dataStatus" class="mt-3 text-sm text-green-700" aria-live="polite">{{ dataStatus }}</p>
  </section>
</template>
