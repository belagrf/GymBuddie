import { nextTick, onBeforeUnmount, ref } from 'vue'

const DEFAULT_DURATION_MS = 4_000

export function useTransientMessage(durationMs = DEFAULT_DURATION_MS) {
  const message = ref('')
  let timeout: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  // Kept across clear(), because callers often clear() right before showing the same text again.
  let lastShown = ''

  function cancelTimeout() {
    if (timeout === undefined) return

    clearTimeout(timeout)
    timeout = undefined
  }

  function startTimeout() {
    timeout = setTimeout(() => {
      message.value = ''
      timeout = undefined
    }, durationMs)
  }

  function clear() {
    generation += 1
    cancelTimeout()
    message.value = ''
  }

  function show(value: string) {
    generation += 1
    cancelTimeout()

    if (value && value === lastShown) {
      // Live regions only announce DOM changes, so an identical message is removed and
      // re-inserted after a render to make screen readers repeat it.
      const current = generation
      message.value = ''
      void nextTick(() => {
        if (current !== generation) return
        message.value = value
        startTimeout()
      })
      return
    }

    lastShown = value
    message.value = value
    if (value) startTimeout()
  }

  onBeforeUnmount(() => {
    generation += 1
    cancelTimeout()
  })

  return { message, show, clear }
}
