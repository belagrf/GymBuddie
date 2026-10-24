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
      class="rounded-xl border border-danger-line bg-danger-tint p-4 text-sm text-danger-strong"
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
          class="min-h-11 rounded-lg bg-red-800 px-4 font-semibold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-danger"
          @click="downloadUnreadableData"
        >
          Rohdaten herunterladen
        </button>
        <button
          id="discard-unreadable-button"
          type="button"
          class="min-h-11 rounded-lg border border-danger-line bg-surface px-4 font-semibold hover:bg-danger-tint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-danger"
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
            class="min-h-11 rounded-lg bg-red-800 px-4 font-semibold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-danger"
            @click="discardUnreadableData"
          >
            Endgültig verwerfen
          </button>
          <button
            id="discard-unreadable-cancel"
            type="button"
            class="min-h-11 rounded-lg border border-danger-line bg-surface px-4 font-semibold hover:bg-danger-tint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-danger"
            @click="cancelDiscard"
          >
            Abbrechen
          </button>
        </div>
      </div>

      <div v-else class="mt-3">
        <button
          type="button"
          class="min-h-11 rounded-lg bg-red-800 px-4 font-semibold text-white hover:bg-red-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-danger"
          @click="reloadApp"
        >
          App neu laden
        </button>
      </div>

      <p v-if="downloadError" class="mt-2 font-semibold">{{ downloadError }}</p>
    </div>

    <div
      v-if="gymStore.persistenceError && !gymStore.writeBlock"
      class="flex flex-col gap-2 rounded-xl border border-warn-line bg-warn-tint p-4 text-sm text-warn-fg sm:flex-row sm:items-center sm:justify-between"
      role="alert"
    >
      <p>{{ gymStore.persistenceError }}</p>
      <button
        type="button"
        class="min-h-11 shrink-0 rounded-lg border border-warn-line bg-surface px-3 font-semibold hover:bg-warn-tint-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-warn"
        @click="gymStore.clearPersistenceError()"
      >
        Hinweis schließen
      </button>
    </div>
  </div>
</template>
