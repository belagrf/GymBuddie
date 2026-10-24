import { getActivePinia } from 'pinia'
import { afterEach } from 'vitest'

const values = new Map<string, string>()

const localStorageMock: Storage = {
  get length() {
    return values.size
  },
  clear() {
    values.clear()
  },
  getItem(key) {
    return values.get(key) ?? null
  },
  key(index) {
    return [...values.keys()][index] ?? null
  },
  removeItem(key) {
    values.delete(key)
  },
  setItem(key, value) {
    values.set(key, String(value))
  },
}

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

// Dispose every store after each test so their window listeners do not leak into later tests.
afterEach(() => {
  const pinia = getActivePinia() as unknown as
    { _s: Map<string, { $dispose: () => void }> } | undefined
  pinia?._s.forEach((store) => store.$dispose())
})
