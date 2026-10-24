<script setup lang="ts">
import { downloadTextFile } from '@/composables/download'
import { focusById } from '@/composables/focus'
import { toLocalDateKey, useGymStore, writeBlockMessage } from '@/stores/gymStore'
import { ref } from 'vue'

const gymStore = useGymStore()
const confirmDiscard = ref(false)
const downloadError = ref('')

function downloadUnreadableData() {
  downloadError.value = ''
  const raw = gymStore.readUnreadableData()
  if (raw === null) {
    downloadError.value = 'Die gespeicherten Rohdaten konnten nicht gelesen werden.'
    return
  }

  try {
    downloadTextFile(`gymbuddie-rohdaten-${toLocalDateKey()}.json`, raw)
  } catch {
    downloadError.value = 'Die Rohdaten konnten nicht heruntergeladen werden.'
    return
  }
  gymStore.releaseWriteBlock()
  void focusById('new-category')
}

function askToDiscard() {
  confirmDiscard.value = true
  void focusById('discard-unreadable-cancel')
}

function cancelDiscard() {
  confirmDiscard.value = false
  void focusById('discard-unreadable-button')
}

function discardUnreadableData() {
  confirmDiscard.value = false
  gymStore.releaseWriteBlock()
  void focusById('new-category')
}

function reloadApp() {
  window.location.reload()
}
</script>

<template>
  <div class="mb-6 space-y-3 empty:hidden">
    <div
      v-if="gymStore.writeBlock"
      class="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950"
      role="alert"
    >
      <p class="font-semibold">Änderungen werden derzeit nicht gespeichert.</p>
      <p class="mt-1">{{ writeBlockMessage(gymStore.writeBlock) }}</p>

      <div
        v-if="gymStore.writeBlock === 'unpreserved-data' && !confirmDiscard"
        class="mt-3 flex flex-wrap gap-2"
      >
        <button
          type="button"
          class="min-h-11 rounded-lg bg-red-800 px-4 font-semibold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
          @click="downloadUnreadableData"
        >
          Rohdaten herunterladen
        </button>
        <button
          id="discard-unreadable-button"
          type="button"
          class="min-h-11 rounded-lg border border-red-300 bg-white px-4 font-semibold hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
          @click="askToDiscard"
        >
          Verwerfen und weitermachen
        </button>
      </div>

      <div v-else-if="gymStore.writeBlock === 'unpreserved-data'" class="mt-3">
        <p>
          Die unlesbaren Daten werden bei der nächsten Änderung überschrieben und lassen sich danach
          nicht wiederherstellen.
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="min-h-11 rounded-lg bg-red-800 px-4 font-semibold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
            @click="discardUnreadableData"
          >
            Endgültig verwerfen
          </button>
          <button
            id="discard-unreadable-cancel"
            type="button"
            class="min-h-11 rounded-lg border border-red-300 bg-white px-4 font-semibold hover:bg-red-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
            @click="cancelDiscard"
          >
            Abbrechen
          </button>
        </div>
      </div>

      <div v-else class="mt-3">
        <button
          type="button"
          class="min-h-11 rounded-lg bg-red-800 px-4 font-semibold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-800"
          @click="reloadApp"
        >
          App neu laden
        </button>
      </div>

      <p v-if="downloadError" class="mt-2 font-semibold">{{ downloadError }}</p>
    </div>

    <div
      v-if="gymStore.persistenceError && !gymStore.writeBlock"
      class="flex flex-col gap-2 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <p>{{ gymStore.persistenceError }}</p>
      <button
        type="button"
        class="min-h-11 shrink-0 rounded-lg border border-amber-400 bg-white px-3 font-semibold hover:bg-amber-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800"
        @click="gymStore.clearPersistenceError()"
      >
        Hinweis schließen
      </button>
    </div>
  </div>
</template>
