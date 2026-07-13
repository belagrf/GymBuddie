import { onBeforeUnmount, ref } from 'vue'

const DEFAULT_DURATION_MS = 4_000

export function useTransientMessage(durationMs = DEFAULT_DURATION_MS) {
  const message = ref('')
  let timeout: ReturnType<typeof setTimeout> | undefined

  function cancelTimeout() {
    if (timeout === undefined) return

    clearTimeout(timeout)
    timeout = undefined
  }

  function clear() {
    cancelTimeout()
    message.value = ''
  }

  function show(value: string) {
    cancelTimeout()
    message.value = value

    if (!value) return

    timeout = setTimeout(() => {
      message.value = ''
      timeout = undefined
    }, durationMs)
  }

  onBeforeUnmount(cancelTimeout)

  return { message, show, clear }
}
