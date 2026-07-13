import { ref } from 'vue'
import { vi } from 'vitest'

export function useRegisterSW() {
  return {
    needRefresh: ref(false),
    offlineReady: ref(false),
    updateServiceWorker: vi.fn(async () => undefined),
  }
}
