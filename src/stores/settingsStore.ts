import { defineStore } from 'pinia'
import { onScopeDispose, reactive } from 'vue'

export const SETTINGS_KEY = 'gymbuddie:settings:v1'

export type ThemePreference = 'system' | 'light' | 'dark'

export const REST_DURATIONS = [60, 90, 120, 180] as const
export const WEIGHT_STEPS = [1, 1.25, 2, 2.5, 5] as const

export interface Settings {
  theme: ThemePreference
  restSeconds: number
  restAutoStart: boolean
  restAlert: boolean
  keepAwake: boolean
  weightStep: number
}

export const DEFAULT_SETTINGS: Readonly<Settings> = Object.freeze({
  theme: 'system',
  restSeconds: 90,
  restAutoStart: true,
  restAlert: true,
  keepAwake: true,
  weightStep: 2.5,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Keeps only known settings with valid values; anything else falls back to the default. */
export function sanitizeSettings(value: unknown): Settings {
  const input = isRecord(value) ? value : {}
  const pick = <T>(candidate: unknown, valid: (v: unknown) => v is T, fallback: T): T =>
    valid(candidate) ? candidate : fallback

  return {
    theme: pick(
      input.theme,
      (v): v is ThemePreference => v === 'system' || v === 'light' || v === 'dark',
      DEFAULT_SETTINGS.theme,
    ),
    restSeconds: pick(
      input.restSeconds,
      (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 15 && v <= 600,
      DEFAULT_SETTINGS.restSeconds,
    ),
    restAutoStart: pick(
      input.restAutoStart,
      (v): v is boolean => typeof v === 'boolean',
      DEFAULT_SETTINGS.restAutoStart,
    ),
    restAlert: pick(
      input.restAlert,
      (v): v is boolean => typeof v === 'boolean',
      DEFAULT_SETTINGS.restAlert,
    ),
    keepAwake: pick(
      input.keepAwake,
      (v): v is boolean => typeof v === 'boolean',
      DEFAULT_SETTINGS.keepAwake,
    ),
    weightStep: pick(
      input.weightStep,
      (v): v is number => (WEIGHT_STEPS as readonly unknown[]).includes(v),
      DEFAULT_SETTINGS.weightStep,
    ),
  }
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function readSettings(): Settings {
  try {
    const raw = storage()?.getItem(SETTINGS_KEY)
    return sanitizeSettings(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * Device preferences. They live in their own key and are deliberately not part of backups:
 * a backup holds training data, while theme or timer choices belong to a device.
 */
export const useSettingsStore = defineStore('settings', () => {
  const settings = reactive<Settings>(readSettings())

  function update(changes: Partial<Settings>) {
    Object.assign(settings, sanitizeSettings({ ...settings, ...changes }))
    try {
      storage()?.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch {
      // Preferences still apply for this session.
    }
  }

  if (typeof window !== 'undefined') {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETTINGS_KEY || event.key === null) Object.assign(settings, readSettings())
    }
    window.addEventListener('storage', handleStorage)
    onScopeDispose(() => window.removeEventListener('storage', handleStorage))
  }

  return { settings, update }
})
