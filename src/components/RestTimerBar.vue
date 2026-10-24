<script setup lang="ts">
import { focusById } from '@/composables/focus'
import { useTransientMessage } from '@/composables/useTransientMessage'
import { useRestTimerStore } from '@/stores/restTimerStore'
import { computed, nextTick, ref, watch } from 'vue'

const restTimer = useRestTimerStore()
const {
  message: announcement,
  show: announce,
  clear: clearAnnouncement,
} = useTransientMessage(10_000)
const bar = ref<HTMLElement | null>(null)
// Where keyboard focus goes back to when the bar disappears (usually "Satz speichern").
let returnFocusTo: HTMLElement | null = null

const visible = computed(() => restTimer.running || restTimer.finishedAt !== null)

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function spokenDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return [minutes ? `${minutes} Min.` : '', rest ? `${rest} Sek.` : ''].filter(Boolean).join(' ')
}

function focusIsInside() {
  return Boolean(bar.value?.contains(document.activeElement))
}

// Announce only the start and the end; role="timer" keeps the countdown itself silent.
watch(
  () => restTimer.endsAt,
  (endsAt, previous) => {
    if (endsAt === null || previous !== null) return
    if (!focusIsInside() && document.activeElement instanceof HTMLElement) {
      returnFocusTo = document.activeElement
    }
    announce(`Pause läuft: ${spokenDuration(restTimer.remainingSeconds)}`)
  },
)

// These run before the DOM changes, so they can tell whether focus was inside the bar.
watch(
  () => restTimer.running,
  (running, wasRunning) => {
    if (running || !wasRunning) return
    const hadFocus = focusIsInside()
    if (restTimer.finishedAt !== null) {
      announce('Pause vorbei – nächster Satz!')
      if (hadFocus) void focusById('rest-timer-close')
    } else {
      clearAnnouncement()
    }
  },
  { flush: 'pre' },
)

watch(
  visible,
  (isVisible, wasVisible) => {
    if (isVisible || !wasVisible || !focusIsInside()) return
    const target = returnFocusTo
    void nextTick(() => {
      if (target?.isConnected) target.focus()
      else void focusById('training-heading', 'new-category')
    })
  },
  { flush: 'pre' },
)

const buttonClass =
  'min-h-11 min-w-11 rounded-lg border border-line-strong bg-surface px-3 font-semibold text-fg hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus'
</script>

<template>
  <div>
    <p class="sr-only" aria-live="polite">{{ announcement }}</p>
    <section
      v-if="visible"
      ref="bar"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgb(0_0_0/0.08)]"
      aria-label="Pausentimer"
    >
      <div class="mx-auto flex max-w-4xl items-center gap-2">
        <template v-if="restTimer.running">
          <div class="min-w-0 flex-1">
            <p class="text-xs font-semibold text-fg-subtle">Pause</p>
            <p
              class="text-3xl leading-tight font-bold text-fg tabular-nums"
              role="timer"
              :aria-label="`Verbleibende Pause: ${spokenDuration(restTimer.remainingSeconds)}`"
            >
              {{ formatClock(restTimer.remainingSeconds) }}
            </p>
            <div class="mt-1 h-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <div
                class="h-full rounded-full bg-blue-600"
                :style="{ width: `${Math.round(restTimer.progress * 100)}%` }"
              />
            </div>
          </div>
          <button
            type="button"
            :class="buttonClass"
            aria-label="Pause um 15 Sekunden verkürzen"
            @click="restTimer.adjust(-15)"
          >
            −15
          </button>
          <button
            type="button"
            :class="buttonClass"
            aria-label="Pause um 30 Sekunden verlängern"
            @click="restTimer.adjust(30)"
          >
            +30
          </button>
          <button type="button" :class="buttonClass" @click="restTimer.stop()">Stopp</button>
        </template>
        <template v-else>
          <p class="min-w-0 flex-1 text-lg font-bold text-fg">Pause vorbei – nächster Satz!</p>
          <button
            id="rest-timer-close"
            type="button"
            :class="buttonClass"
            @click="restTimer.dismissFinished()"
          >
            Schließen
          </button>
        </template>
      </div>
    </section>
  </div>
</template>
