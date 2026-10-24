import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { REST_TIMER_KEY, useRestTimerStore } from '@/stores/restTimerStore'
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  sanitizeSettings,
  useSettingsStore,
} from '@/stores/settingsStore'
import { UI_STATE_KEY, useUiStore } from '@/stores/uiStore'

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('settings store', () => {
  it('uses the panel defaults: system theme, 90 s rest, alerts and wake lock on, 2,5 kg steps', () => {
    expect(useSettingsStore().settings).toEqual({
      theme: 'system',
      restSeconds: 90,
      restAutoStart: true,
      restAlert: true,
      keepAwake: true,
      weightStep: 2.5,
    })
  })

  it('persists changes and ignores invalid values', () => {
    const store = useSettingsStore()
    store.update({ theme: 'dark', restSeconds: 120, weightStep: 1.25 })
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).toMatchObject({
      theme: 'dark',
      restSeconds: 120,
      weightStep: 1.25,
    })

    expect(
      sanitizeSettings({ theme: 'neon', restSeconds: 4, weightStep: 3, keepAwake: 'yes' }),
    ).toEqual(DEFAULT_SETTINGS)
  })

  it('reads saved settings and survives unreadable ones', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ theme: 'light', restAutoStart: false }))
    expect(useSettingsStore().settings).toMatchObject({ theme: 'light', restAutoStart: false })

    setActivePinia(createPinia())
    localStorage.setItem(SETTINGS_KEY, '{broken')
    expect(useSettingsStore().settings).toEqual(DEFAULT_SETTINGS)
  })
})

describe('UI state store', () => {
  it('remembers collapsed categories and exercise choices across reloads', () => {
    const store = useUiStore()
    store.toggleCategory('push')
    store.setExerciseOpen('bench', true)
    store.setExerciseOpen('dips', false)

    setActivePinia(createPinia())
    const reloaded = useUiStore()
    expect(reloaded.isCategoryCollapsed('push')).toBe(true)
    expect(reloaded.exerciseOpenChoice('bench')).toBe(true)
    expect(reloaded.exerciseOpenChoice('dips')).toBe(false)
    expect(reloaded.exerciseOpenChoice('rows')).toBeUndefined()
  })

  it('prunes entries of deleted categories and exercises', () => {
    const store = useUiStore()
    store.toggleCategory('gone')
    store.setExerciseOpen('gone-exercise', true)
    store.setExerciseOpen('bench', true)

    store.prune(new Set(['push']), new Set(['bench']))

    expect(JSON.parse(localStorage.getItem(UI_STATE_KEY) ?? '{}')).toEqual({
      collapsedCategories: [],
      exerciseOpen: { bench: true },
      reminderSnoozedUntil: null,
    })
  })

  it('cannot be confused by IDs that look like object internals', () => {
    expect(useUiStore().exerciseOpenChoice('constructor')).toBeUndefined()
    expect(useUiStore().exerciseOpenChoice('toString')).toBeUndefined()
  })
})

describe('rest timer store', () => {
  it('counts down from the configured duration and announces the end', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 18, 0, 0))
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    const timer = useRestTimerStore()

    timer.start()
    expect(timer.running).toBe(true)
    expect(timer.remainingSeconds).toBe(90)
    expect(JSON.parse(localStorage.getItem(REST_TIMER_KEY) ?? '{}')).toHaveProperty('endsAt')

    await vi.advanceTimersByTimeAsync(30_000)
    expect(timer.remainingSeconds).toBe(60)
    expect(timer.progress).toBeCloseTo(1 / 3, 2)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(timer.running).toBe(false)
    expect(timer.finishedAt).not.toBeNull()
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200])
    expect(localStorage.getItem(REST_TIMER_KEY)).toBeNull()

    await vi.advanceTimersByTimeAsync(15_000)
    expect(timer.finishedAt).toBeNull()
  })

  it('can be extended, shortened, and stopped', async () => {
    vi.useFakeTimers()
    const timer = useRestTimerStore()
    timer.start(60)
    timer.adjust(30)
    expect(timer.remainingSeconds).toBe(90)
    timer.adjust(-15)
    expect(timer.remainingSeconds).toBe(75)
    timer.adjust(-600)
    expect(timer.running).toBe(false)
    expect(timer.finishedAt).not.toBeNull()

    timer.start(60)
    timer.stop()
    expect(timer.running).toBe(false)
    expect(timer.finishedAt).toBeNull()
  })

  it('stays silent when alerts are switched off', async () => {
    vi.useFakeTimers()
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { ...navigator, vibrate })
    useSettingsStore().update({ restAlert: false })
    const timer = useRestTimerStore()

    timer.start(10)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(timer.finishedAt).not.toBeNull()
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('keeps the screen awake while it runs, if allowed', async () => {
    vi.useFakeTimers()
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() })
    vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } })
    const timer = useRestTimerStore()

    timer.start(20)
    await vi.advanceTimersByTimeAsync(0)
    expect(request).toHaveBeenCalledWith('screen')
    timer.stop()
    expect(release).toHaveBeenCalled()

    useSettingsStore().update({ keepAwake: false })
    timer.start(20)
    await vi.advanceTimersByTimeAsync(0)
    expect(request).toHaveBeenCalledTimes(1)
  })

  it('resumes a running timer after a reload', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 18, 0, 0))
    useRestTimerStore().start(120)

    vi.setSystemTime(new Date(2026, 6, 13, 18, 0, 50))
    setActivePinia(createPinia())
    const reloaded = useRestTimerStore()
    expect(reloaded.running).toBe(true)
    expect(reloaded.remainingSeconds).toBe(70)
  })

  it('drops a saved timer that already ended', () => {
    localStorage.setItem(
      REST_TIMER_KEY,
      JSON.stringify({ endsAt: Date.now() - 1_000, totalMs: 60_000 }),
    )
    expect(useRestTimerStore().running).toBe(false)
    expect(localStorage.getItem(REST_TIMER_KEY)).toBeNull()
  })
})
