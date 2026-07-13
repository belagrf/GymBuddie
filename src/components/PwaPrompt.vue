<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRegisterSW } from 'virtual:pwa-register/vue'

const registrationError = ref('')
let updateTimer: number | undefined
let offlineReadyTimer: number | undefined

const { offlineReady, needRefresh, updateServiceWorker } = useRegisterSW({
  onRegisteredSW(_serviceWorkerUrl, registration) {
    if (!registration) return

    updateTimer = window.setInterval(
      () => {
        if (navigator.onLine) void registration.update()
      },
      60 * 60 * 1000,
    )
  },
  onRegisterError(error) {
    registrationError.value = error instanceof Error ? error.message : String(error)
  },
})

const isVisible = computed(
  () => offlineReady.value || needRefresh.value || Boolean(registrationError.value),
)

watch([offlineReady, needRefresh, registrationError], ([isOfflineReady, refreshNeeded, error]) => {
  if (offlineReadyTimer !== undefined) {
    window.clearTimeout(offlineReadyTimer)
    offlineReadyTimer = undefined
  }

  if (isOfflineReady && !refreshNeeded && !error) {
    offlineReadyTimer = window.setTimeout(() => {
      offlineReady.value = false
      offlineReadyTimer = undefined
    }, 6_000)
  }
})

function dismiss() {
  offlineReady.value = false
  needRefresh.value = false
  registrationError.value = ''
}

onBeforeUnmount(() => {
  if (updateTimer !== undefined) window.clearInterval(updateTimer)
  if (offlineReadyTimer !== undefined) window.clearTimeout(offlineReadyTimer)
})
</script>

<template>
  <Transition name="pwa-message">
    <div
      v-if="isVisible"
      class="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-lg rounded-2xl bg-slate-900 p-4 text-white shadow-xl"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <p class="font-semibold">
        <template v-if="needRefresh">Eine neue Version ist verfügbar.</template>
        <template v-else-if="offlineReady">GymBuddie ist jetzt offline verfügbar.</template>
        <template v-else>Der Offline-Modus konnte nicht aktiviert werden.</template>
      </p>
      <p v-if="registrationError" class="mt-1 text-sm text-slate-300">
        Bitte lade die App mit einer aktiven Internetverbindung erneut.
      </p>
      <div class="mt-3 flex flex-wrap justify-end gap-2">
        <button
          v-if="needRefresh"
          type="button"
          class="min-h-11 rounded-xl bg-blue-500 px-4 font-semibold hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          @click="updateServiceWorker(true)"
        >
          Jetzt aktualisieren
        </button>
        <button
          type="button"
          class="min-h-11 rounded-xl px-4 font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          @click="dismiss"
        >
          {{ needRefresh ? 'Später' : 'Schließen' }}
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pwa-message-enter-active,
.pwa-message-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.pwa-message-enter-from,
.pwa-message-leave-to {
  opacity: 0;
  transform: translateY(1rem);
}
</style>
