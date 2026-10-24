import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref } from 'vue'

import { useSettingsStore } from '@/stores/settingsStore'

export const REST_TIMER_KEY = 'gymbuddie:rest-timer:v1'

const TICK_MS = 250
const FINISHED_NOTICE_MS = 15_000
const MIN_SECONDS = 5
const MAX_SECONDS = 15 * 60

type AudioContextConstructor = typeof AudioContext

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * The rest timer between sets. It counts down to a timestamp rather than counting ticks, so it
 * stays right when the browser throttles timers in the background, and it survives a reload.
 */
export const useRestTimerStore = defineStore('restTimer', () => {
  const settingsStore = useSettingsStore()

  const endsAt = ref<number | null>(null)
  const totalMs = ref(0)
  const finishedAt = ref<number | null>(null)
  const now = ref(Date.now())

  let interval: ReturnType<typeof setInterval> | undefined
  let finishedTimeout: ReturnType<typeof setTimeout> | undefined
  let wakeLock: WakeLockSentinel | null = null
  let audio: AudioContext | null = null

  const running = computed(() => endsAt.value !== null)
  const remainingMs = computed(() =>
    endsAt.value === null ? 0 : Math.max(0, endsAt.value - now.value),
  )
  const remainingSeconds = computed(() => Math.ceil(remainingMs.value / 1000))
  const progress = computed(() =>
    totalMs.value > 0 ? Math.min(1, 1 - remainingMs.value / totalMs.value) : 0,
  )

  function persist() {
    try {
      if (endsAt.value === null) storage()?.removeItem(REST_TIMER_KEY)
      else
        storage()?.setItem(
          REST_TIMER_KEY,
          JSON.stringify({ endsAt: endsAt.value, totalMs: totalMs.value }),
        )
    } catch {
      // The timer still runs for this page.
    }
  }

  async function requestWakeLock() {
    if (!settingsStore.settings.keepAwake || wakeLock || typeof navigator === 'undefined') return
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return
    try {
      wakeLock = await navigator.wakeLock.request('screen')
      wakeLock.addEventListener('release', () => {
        wakeLock = null
      })
    } catch {
      // Denied (e.g. battery saver); the timer works without it.
    }
  }

  function releaseWakeLock() {
    void wakeLock?.release().catch(() => undefined)
    wakeLock = null
  }

  /** Creates or wakes the audio context while we are inside the user's tap. */
  function primeAudio() {
    if (!settingsStore.settings.restAlert || typeof window === 'undefined') return
    const AudioContextClass: AudioContextConstructor | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext
    if (!AudioContextClass) return
    try {
      audio ??= new AudioContextClass()
      void audio.resume().catch(() => undefined)
    } catch {
      audio = null
    }
  }

  function signalEnd() {
    if (!settingsStore.settings.restAlert) return
    try {
      navigator.vibrate?.([200, 100, 200])
    } catch {
      // Vibration is not available everywhere (iOS has none).
    }
    if (!audio) return
    try {
      // Three short, soft beeps.
      const start = audio.currentTime + 0.05
      for (let beep = 0; beep < 3; beep += 1) {
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        const at = start + beep * 0.25
        oscillator.frequency.value = 880
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.15)
        oscillator.connect(gain).connect(audio.destination)
        oscillator.start(at)
        oscillator.stop(at + 0.16)
      }
    } catch {
      // Sound is a bonus; vibration and the visible notice remain.
    }
  }

  function stopTicking() {
    if (interval !== undefined) clearInterval(interval)
    interval = undefined
  }

  function tick() {
    now.value = Date.now()
    if (endsAt.value !== null && now.value >= endsAt.value) finish()
  }

  function startTicking() {
    stopTicking()
    tick()
    interval = setInterval(tick, TICK_MS)
  }

  function finish() {
    endsAt.value = null
    totalMs.value = 0
    stopTicking()
    persist()
    releaseWakeLock()
    signalEnd()
    finishedAt.value = Date.now()
    if (finishedTimeout !== undefined) clearTimeout(finishedTimeout)
    finishedTimeout = setTimeout(() => {
      finishedAt.value = null
    }, FINISHED_NOTICE_MS)
  }

  function start(seconds = settingsStore.settings.restSeconds) {
    const clamped = Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, Math.round(seconds)))
    primeAudio()
    finishedAt.value = null
    totalMs.value = clamped * 1000
    endsAt.value = Date.now() + totalMs.value
    persist()
    startTicking()
    void requestWakeLock()
  }

  function adjust(seconds: number) {
    if (endsAt.value === null) return
    const remaining = Math.max(0, endsAt.value - Date.now()) / 1000 + seconds
    if (remaining <= 0) {
      finish()
      return
    }
    const clamped = Math.min(MAX_SECONDS, remaining)
    endsAt.value = Date.now() + clamped * 1000
    totalMs.value = Math.max(totalMs.value, clamped * 1000)
    persist()
    tick()
  }

  function stop() {
    endsAt.value = null
    totalMs.value = 0
    finishedAt.value = null
    stopTicking()
    persist()
    releaseWakeLock()
  }

  function dismissFinished() {
    finishedAt.value = null
  }

  // Resume a timer that was running before a reload; one that ended meanwhile is dropped.
  try {
    const saved: unknown = JSON.parse(storage()?.getItem(REST_TIMER_KEY) ?? 'null')
    if (typeof saved === 'object' && saved !== null) {
      const { endsAt: savedEnd, totalMs: savedTotal } = saved as Record<string, unknown>
      if (
        typeof savedEnd === 'number' &&
        typeof savedTotal === 'number' &&
        savedEnd > Date.now() &&
        savedEnd - Date.now() <= MAX_SECONDS * 1000
      ) {
        endsAt.value = savedEnd
        totalMs.value = savedTotal
        startTicking()
      } else {
        storage()?.removeItem(REST_TIMER_KEY)
      }
    }
  } catch {
    // Ignore an unreadable saved timer.
  }

  if (typeof document !== 'undefined') {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || endsAt.value === null) return
      tick()
      // The browser releases wake locks when the page is hidden; take it again.
      if (endsAt.value !== null) void requestWakeLock()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    onScopeDispose(() => {
      document.removeEventListener('visibilitychange', handleVisibility)
      stopTicking()
      if (finishedTimeout !== undefined) clearTimeout(finishedTimeout)
      releaseWakeLock()
      void audio?.close().catch(() => undefined)
    })
  }

  return {
    endsAt,
    finishedAt,
    running,
    remainingMs,
    remainingSeconds,
    progress,
    start,
    adjust,
    stop,
    dismissFinished,
  }
})
