import { onBeforeUnmount, onMounted, ref } from 'vue'

import { toLocalDateKey } from '@/domain/gymData'

/**
 * A reactive local date key that rolls over at midnight and after the device wakes up,
 * so "today" counters do not keep showing yesterday's numbers in a long-open app.
 */
export function useToday() {
  const today = ref(toLocalDateKey())
  let timeout: ReturnType<typeof setTimeout> | undefined

  function refresh() {
    const current = toLocalDateKey()
    if (current !== today.value) today.value = current
    schedule()
  }

  function schedule() {
    if (timeout !== undefined) clearTimeout(timeout)
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    // A small margin keeps the timer from firing a few milliseconds before midnight.
    timeout = setTimeout(refresh, nextMidnight.getTime() - now.getTime() + 1_000)
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') refresh()
  }

  onMounted(() => {
    schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)
  })

  onBeforeUnmount(() => {
    if (timeout !== undefined) clearTimeout(timeout)
    document.removeEventListener('visibilitychange', handleVisibilityChange)
  })

  return today
}
