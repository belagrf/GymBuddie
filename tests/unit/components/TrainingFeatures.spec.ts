import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import BackupReminder from '@/components/BackupReminder.vue'
import DataManagement from '@/components/DataManagement.vue'
import ExerciseCard from '@/components/ExerciseCard.vue'
import ProgressChart from '@/components/ProgressChart.vue'
import ReorderList from '@/components/ReorderList.vue'
import RestTimerBar from '@/components/RestTimerBar.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { useTheme } from '@/composables/useTheme'
import { createGymDataEnvelope, type Category, type WorkoutSession } from '@/domain/gymData'
import { progressSeries } from '@/domain/stats'
import { GYM_STORAGE_KEY, LAST_EXPORT_KEY, useGymStore } from '@/stores/gymStore'
import { useRestTimerStore } from '@/stores/restTimerStore'
import { useSettingsStore } from '@/stores/settingsStore'
import { useUiStore } from '@/stores/uiStore'
import { defineComponent, h } from 'vue'

const TODAY = '2026-07-13'

const history: WorkoutSession[] = [
  {
    date: '2026-07-10',
    sets: [
      { id: 'b3', weight: 62.5, reps: 6 },
      { id: 'b2', weight: 62.5, reps: 7 },
      { id: 'b1', weight: 60, reps: 8 },
    ],
  },
  { date: '2026-07-06', sets: [{ id: 'a1', weight: 57.5, reps: 8 }] },
]

function seed(categories: Category[], updatedAt = '2026-07-12T10:00:00.000Z') {
  localStorage.setItem(
    GYM_STORAGE_KEY,
    JSON.stringify(createGymDataEnvelope(categories, updatedAt)),
  )
}

function benchCategory(exerciseHistory: WorkoutSession[] = history): Category {
  return {
    id: 'push',
    name: 'Push',
    exercises: [{ id: 'bench', name: 'Bankdrücken', history: exerciseHistory }],
  }
}

function button(wrapper: VueWrapper, text: string | RegExp) {
  const match = wrapper
    .findAll('button')
    .find((candidate) =>
      typeof text === 'string' ? candidate.text() === text : text.test(candidate.text()),
    )
  if (!match) throw new Error(`No button ${text}`)
  return match
}

let wrapper: VueWrapper | undefined

beforeEach(() => {
  localStorage.clear()
  setActivePinia(createPinia())
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 6, 13, 18, 0))
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.documentElement.classList.remove('dark')
})

function mountCard() {
  const exercise = useGymStore().categories[0]?.exercises[0]
  if (!exercise) throw new Error('Expected exercise')
  return mount(ExerciseCard, {
    props: { categoryId: 'push', exercise, today: TODAY },
    attachTo: document.body,
  })
}

describe('compact exercise cards', () => {
  it('start collapsed with a summary, and remember an explicit choice', async () => {
    seed([benchCategory()])
    wrapper = mountCard()

    const toggle = wrapper.get('#exercise-toggle-bench')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.text()).toContain('Zuletzt 10.07.2026: 62,5 kg × 6 · Rekord 62,5 kg')
    expect(wrapper.find('#weight-bench').exists()).toBe(false)

    await toggle.trigger('click')
    expect(wrapper.find('#weight-bench').exists()).toBe(true)
    expect(useUiStore().exerciseOpenChoice('bench')).toBe(true)
  })

  it('open by themselves while the exercise is trained today', () => {
    seed([benchCategory([{ date: TODAY, sets: [{ id: 't1', weight: 60, reps: 8 }] }, ...history])])
    wrapper = mountCard()
    expect(wrapper.get('#exercise-toggle-bench').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('#exercise-toggle-bench').text()).toContain('Heute 1 Satz')
  })
})

describe('last time, repeat and steppers', () => {
  beforeEach(() => {
    seed([benchCategory()])
    useUiStore().setExerciseOpen('bench', true)
  })

  it('shows last time in workout order and repeats the set at the same position', async () => {
    wrapper = mountCard()
    expect(wrapper.text()).toContain('Letztes Mal (10.07.2026): 60 × 8 · 62,5 × 7 · 62,5 × 6')

    await button(wrapper, /^Wiederholen: 60 kg × 8/).trigger('click')
    expect((wrapper.get('#weight-bench').element as HTMLInputElement).value).toBe('60')
    expect((wrapper.get('#reps-bench').element as HTMLInputElement).value).toBe('8')

    await wrapper.get('form:not([id])').trigger('submit')
    // After one set today, the suggestion moves on to last time's second set.
    expect(button(wrapper, /^Wiederholen:/).text()).toContain('62,5 kg × 7')
  })

  it('steps weight by the configured amount and repetitions by one, within limits', async () => {
    useSettingsStore().update({ weightStep: 1.25 })
    wrapper = mountCard()
    const plusWeight = wrapper.get('[aria-label="Gewicht um 1,25 kg erhöhen"]')
    const minusWeight = wrapper.get('[aria-label="Gewicht um 1,25 kg verringern"]')

    // Empty field: start from the suggested weight.
    await plusWeight.trigger('click')
    expect((wrapper.get('#weight-bench').element as HTMLInputElement).value).toBe('61,25')
    await wrapper.get('#weight-bench').setValue('0,5')
    await minusWeight.trigger('click')
    expect((wrapper.get('#weight-bench').element as HTMLInputElement).value).toBe('0')

    await wrapper.get('[aria-label="Wiederholungen um 1 erhöhen"]').trigger('click')
    expect((wrapper.get('#reps-bench').element as HTMLInputElement).value).toBe('9')
    await wrapper.get('#reps-bench').setValue('1')
    await wrapper.get('[aria-label="Wiederholungen um 1 verringern"]').trigger('click')
    expect((wrapper.get('#reps-bench').element as HTMLInputElement).value).toBe('1')
  })
})

describe('records and rest timer after saving', () => {
  beforeEach(() => {
    seed([benchCategory()])
    useUiStore().setExerciseOpen('bench', true)
  })

  async function logSet(weight: string, reps: string) {
    await wrapper!.get('#weight-bench').setValue(weight)
    await wrapper!.get('#reps-bench').setValue(reps)
    await wrapper!.get('form:not([id])').trigger('submit')
    await flushPromises()
  }

  it('celebrates a new record and marks it in the history', async () => {
    wrapper = mountCard()
    await logSet('65', '5')

    expect(wrapper.text()).toContain('Neuer Rekord: 65 kg × 5 – so schwer wie noch nie!')
    const newSet = useGymStore().categories[0]?.exercises[0]?.history[0]?.sets[0]
    expect(wrapper.get(`#set-edit-btn-${newSet?.id}`).element.closest('li')?.textContent).toContain(
      '(Rekord)',
    )
  })

  it('stays quiet for an ordinary set', async () => {
    wrapper = mountCard()
    await logSet('50', '5')
    expect(wrapper.text()).not.toContain('Neuer Rekord')
  })

  it('starts the rest timer after saving, unless switched off', async () => {
    wrapper = mountCard()
    await logSet('50', '5')
    expect(useRestTimerStore().running).toBe(true)
    useRestTimerStore().stop()

    useSettingsStore().update({ restAutoStart: false })
    await logSet('50', '5')
    expect(useRestTimerStore().running).toBe(false)
    await button(wrapper, 'Pause starten').trigger('click')
    expect(useRestTimerStore().running).toBe(true)
  })

  it('offers the progress chart once there are two training days', async () => {
    wrapper = mountCard()
    expect(wrapper.find('figure').exists()).toBe(false)
    await wrapper.get('#chart-toggle-bench').trigger('click')
    expect(wrapper.find('figure svg path').exists()).toBe(true)
  })
})

describe('progress chart', () => {
  it('summarizes the trend, reads out points by keyboard, and offers a table', async () => {
    const series = progressSeries(history)
    wrapper = mount(ProgressChart, {
      props: { chartId: 'c', exerciseName: 'Bankdrücken', ...series },
      attachTo: document.body,
    })

    const svg = wrapper.get('svg')
    expect(svg.attributes('aria-label')).toContain(
      'von 73 kg am 06.07.2026 auf 77 kg am 10.07.2026',
    )
    await svg.trigger('focus')
    expect(wrapper.get('#c-readout').text()).toContain('10.07.2026: 77 kg (62,5 kg × 7 Wdh.)')
    await svg.trigger('keydown', { key: 'ArrowLeft' })
    expect(wrapper.get('#c-readout').text()).toContain('06.07.2026')

    await button(wrapper, 'Als Tabelle anzeigen').trigger('click')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })
})

describe('rest timer bar', () => {
  it('shows the countdown with adjust and stop controls, then a finished notice', async () => {
    vi.useFakeTimers()
    wrapper = mount(RestTimerBar)
    const timer = useRestTimerStore()
    timer.start(60)
    await flushPromises()

    expect(wrapper.get('[role="timer"]').text()).toBe('1:00')
    expect(wrapper.text()).toContain('Pause läuft: 1 Min.')
    await wrapper.get('[aria-label="Pause um 30 Sekunden verlängern"]').trigger('click')
    expect(wrapper.get('[role="timer"]').text()).toBe('1:30')

    await vi.advanceTimersByTimeAsync(90_000)
    expect(wrapper.text()).toContain('Pause vorbei – nächster Satz!')
    await button(wrapper, 'Schließen').trigger('click')
    expect(wrapper.find('section').exists()).toBe(false)
  })
})

describe('settings and theme', () => {
  it('switches the theme immediately and follows the system by default', async () => {
    const listeners: (() => void)[] = []
    let systemDark = true
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return systemDark
      },
      addEventListener: (_: string, listener: () => void) => listeners.push(listener),
      removeEventListener: vi.fn(),
    }))
    const Host = defineComponent({
      setup() {
        useTheme()
        return () => h(SettingsPanel)
      },
    })
    wrapper = mount(Host)
    await flushPromises()
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    systemDark = false
    listeners.forEach((listener) => listener())
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    await wrapper.get('input[value="dark"]').setValue(true)
    expect(useSettingsStore().settings.theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    await wrapper.get('input[value="120"]').setValue(true)
    expect(useSettingsStore().settings.restSeconds).toBe(120)
  })
})

describe('backup reminder', () => {
  it('appears after 14 days without a backup when data changed, and can be snoozed', async () => {
    seed([benchCategory()])
    localStorage.setItem(LAST_EXPORT_KEY, '2026-06-20T10:00:00.000Z')
    wrapper = mount(BackupReminder, { props: { today: TODAY } })
    expect(wrapper.text()).toContain('Dein letztes Backup ist 23 Tage alt.')

    await button(wrapper, 'Später').trigger('click')
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('stays hidden when nothing changed since the last backup or it is recent', () => {
    seed([benchCategory()], '2026-06-01T10:00:00.000Z')
    localStorage.setItem(LAST_EXPORT_KEY, '2026-06-02T10:00:00.000Z')
    wrapper = mount(BackupReminder, { props: { today: TODAY } })
    expect(wrapper.find('section').exists()).toBe(false)
    wrapper.unmount()

    setActivePinia(createPinia())
    seed([benchCategory()])
    localStorage.setItem(LAST_EXPORT_KEY, '2026-07-11T10:00:00.000Z')
    wrapper = mount(BackupReminder, { props: { today: TODAY } })
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('counts from the first set when there was never a backup, and uses the share sheet', async () => {
    seed([benchCategory([{ date: '2026-06-01', sets: [{ id: 'old', weight: 50, reps: 8 }] }])])
    const share = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share })
    wrapper = mount(BackupReminder, { props: { today: TODAY } })
    expect(wrapper.text()).toContain('Du hast noch kein Backup erstellt.')

    await button(wrapper, 'Backup teilen').trigger('click')
    await flushPromises()
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: 'GymBuddie-Backup' }))
    expect(useGymStore().lastExportAt).not.toBeNull()
  })
})

describe('sharing backups from the data section', () => {
  it('does not record an export when the share sheet is cancelled', async () => {
    seed([benchCategory()])
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    vi.stubGlobal('navigator', { ...navigator, canShare: () => true, share })
    wrapper = mount(DataManagement)

    await button(wrapper, 'Backup teilen').trigger('click')
    await flushPromises()
    expect(share).toHaveBeenCalled()
    expect(useGymStore().lastExportAt).toBeNull()
    expect(button(wrapper, 'Herunterladen').exists()).toBe(true)
  })
})

describe('reorder list', () => {
  it('moves items with the arrows, keeps focus, and ignores moves past the edge', async () => {
    seed([benchCategory([]), { id: 'pull', name: 'Pull', exercises: [] }])
    wrapper = mount(ReorderList, { attachTo: document.body })

    await wrapper.get('[aria-label="Kategorie Push nach oben"]').trigger('click')
    expect(useGymStore().categories.map((category) => category.id)).toEqual(['push', 'pull'])

    await wrapper.get('[aria-label="Kategorie Pull nach oben"]').trigger('click')
    await flushPromises()
    expect(useGymStore().categories.map((category) => category.id)).toEqual(['pull', 'push'])
    expect(document.activeElement?.id).toBe('move-category-up-pull')
    expect(wrapper.get('#move-category-up-pull').attributes('aria-disabled')).toBe('true')
  })
})
