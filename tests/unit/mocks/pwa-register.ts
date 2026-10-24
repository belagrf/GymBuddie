import { ref } from 'vue'
import { vi } from 'vitest'

interface RegisterOptions {
  onRegisteredSW?: (url: string, registration: ServiceWorkerRegistration | undefined) => void
  onRegisterError?: (error: unknown) => void
}

/** The options of the most recent useRegisterSW call, so tests can simulate registration. */
export const registerSW: { options?: RegisterOptions } = {}

export function useRegisterSW(options: RegisterOptions = {}) {
  registerSW.options = options
  return {
    needRefresh: ref(false),
    offlineReady: ref(false),
    updateServiceWorker: vi.fn(async () => undefined),
  }
}
