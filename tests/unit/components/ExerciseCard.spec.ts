import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ExerciseCard from '@/components/ExerciseCard.vue'
import { createGymDataEnvelope, type Category, type WorkoutSession } from '@/domain/gymData'
import { GYM_STORAGE_KEY, useGymStore } from '@/stores/gymStore'
import { useUiStore } from '@/stores/uiStore'

function sessions(count: number): WorkoutSession[] {
  return Array.from({ length: count }, (_, index) => ({
    date: `2026-06-${String(30 - index).padStart(2, '0')}`,
    sets: [{ id: `set-${index}`, weight: 60 + index / 2, reps: 8 }],
  }))
}

function seed(history: WorkoutSession[] = sessions(1)): Category {
  const category: Category = {
    id: 'category-1',
    name: 'Push',
    exercises: [{ id: 'exercise-1', name: 'Bankdrücken', history }],
  }
  localStorage.setItem(GYM_STORAGE_KEY, JSON.stringify(createGymDataEnvelope([category])))
  return category
}

function mountCard({ open = true }: { open?: boolean } = {}) {
  const store = useGymStore()
  const exercise = store.categories[0]?.exercises[0]
  if (!exercise) throw new Error('Expected exercise')
  if (open) useUiStore().setExerciseOpen(exercise.id, true)
  return mount(ExerciseCard, {
    props: { categoryId: 'category-1', exercise, today: '2026-07-13' },
    attachTo: document.body,
  })
}

function activeId() {
  return document.activeElement === document.body ? 'BODY' : document.activeElement?.id
}

describe('ExerciseCard', () => {
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
  })

  it('shows weights with a German decimal comma', () => {
    seed([{ date: '2026-07-12', sets: [{ id: 'set-1', weight: 62.5, reps: 8 }] }])
    wrapper = mountCard()

    expect(wrapper.text()).toContain('62,5 kg × 8 Wdh.')
    expect(wrapper.text()).toContain('Zuletzt 12.07.2026: 62,5 kg × 8')
    expect(wrapper.text()).not.toContain('62.5')
  })

  it('moves from weight to repetitions on Enter instead of submitting', async () => {
    seed()
    wrapper = mountCard()

    await wrapper.get('#weight-exercise-1').setValue('42,5')
    await wrapper.get('#weight-exercise-1').trigger('keydown', { key: 'Enter' })
    await flushPromises()

    expect(activeId()).toBe('reps-exercise-1')
    expect(wrapper.find('[aria-invalid="true"]').exists()).toBe(false)
  })

  it('marks only the invalid field and links its message', async () => {
    seed()
    wrapper = mountCard()

    await wrapper.get('#weight-exercise-1').setValue('42,5')
    await wrapper.get('#reps-exercise-1').setValue('8,5')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.get('#weight-exercise-1').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#reps-exercise-1').attributes('aria-invalid')).toBe('true')
    expect(wrapper.get('#reps-exercise-1').attributes('aria-describedby')).toBe(
      'reps-error-exercise-1',
    )
    expect(wrapper.get('#reps-error-exercise-1').text()).toContain('ganze Wiederholungen')
    expect(activeId()).toBe('reps-exercise-1')
  })

  it('logs a set once and ignores an immediate double tap', async () => {
    seed()
    wrapper = mountCard()
    const store = useGymStore()

    await wrapper.get('#weight-exercise-1').setValue('70')
    await wrapper.get('#reps-exercise-1').setValue('5')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(store.categories[0]?.exercises[0]?.history[0]?.sets).toHaveLength(1)
    expect(wrapper.find('#reps-error-exercise-1').exists()).toBe(false)
    expect(wrapper.text()).toContain('Satz gespeichert: 70 kg × 5 Wdh.')

    // After the window a real submit with empty repetitions shows the error again.
    vi.setSystemTime(new Date(2026, 6, 13, 18, 0, 5))
    await wrapper.get('form').trigger('submit')
    expect(wrapper.find('#reps-error-exercise-1').exists()).toBe(true)
  })

  it('shows the storage error next to the form and keeps the input when saving fails', async () => {
    seed()
    wrapper = mountCard()
    const original = window.localStorage.setItem.bind(window.localStorage)
    vi.spyOn(window.localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === GYM_STORAGE_KEY) throw new DOMException('Full', 'QuotaExceededError')
      original(key, value)
    })

    await wrapper.get('#weight-exercise-1').setValue('70')
    await wrapper.get('#reps-exercise-1').setValue('5')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.get('[role="alert"]').text()).toContain('nicht gespeichert')
    expect(wrapper.text()).not.toContain('Satz gespeichert')
    expect((wrapper.get('#reps-exercise-1').element as HTMLInputElement).value).toBe('5')
    expect(wrapper.text()).not.toContain('70 kg × 5')
  })

  it('renders the three newest sessions and reveals older ones on request', async () => {
    seed(sessions(15))
    wrapper = mountCard()

    expect(wrapper.findAll('h6')).toHaveLength(3)
    const showMore = wrapper
      .findAll('button')
      .find((button) => button.text().startsWith('Ältere Einheiten anzeigen'))!
    expect(showMore.text()).toContain('12 weitere')

    await showMore.trigger('click')
    await flushPromises()
    expect(wrapper.findAll('h6')).toHaveLength(13)
    expect(activeId()).toBe('session-exercise-1-2026-06-27')
    expect(wrapper.text()).toContain('2 weitere')
  })

  it('names set buttons with their date and returns focus after editing', async () => {
    seed([{ date: '2026-07-12', sets: [{ id: 'set-1', weight: 60, reps: 8 }] }])
    wrapper = mountCard()

    const editButton = wrapper.get('#set-edit-btn-set-1')
    expect(editButton.attributes('aria-label')).toBe('Satz 1 vom 12.07.2026 bearbeiten')

    await editButton.trigger('click')
    await flushPromises()
    expect(activeId()).toBe('set-edit-weight-set-1')

    await wrapper.get('#set-edit-weight-set-1').setValue('62,5')
    await wrapper
      .get('#set-edit-weight-set-1')
      .element.closest('form')
      ?.dispatchEvent(new Event('submit'))
    await flushPromises()
    expect(activeId()).toBe('set-edit-btn-set-1')
    expect(wrapper.text()).toContain('62,5 kg × 8 Wdh.')
  })

  it('edits the exercise name and link without touching its history', async () => {
    seed()
    wrapper = mountCard()
    const store = useGymStore()

    await wrapper.get('#edit-exercise-btn-exercise-1').trigger('click')
    await flushPromises()
    expect(activeId()).toBe('edit-exercise-name-exercise-1')

    await wrapper.get('#edit-exercise-name-exercise-1').setValue('Schrägbankdrücken')
    await wrapper.get('#edit-exercise-url-exercise-1').setValue('javascript:alert(1)')
    await wrapper.get('#edit-exercise-form-exercise-1').trigger('submit')
    expect(wrapper.get('#edit-exercise-url-exercise-1').attributes('aria-invalid')).toBe('true')

    await wrapper.get('#edit-exercise-url-exercise-1').setValue('youtube.com/watch?v=1')
    await wrapper.get('#edit-exercise-form-exercise-1').trigger('submit')
    await flushPromises()

    const exercise = store.categories[0]?.exercises[0]
    expect(exercise?.name).toBe('Schrägbankdrücken')
    expect(exercise?.videoUrl).toBe('https://youtube.com/watch?v=1')
    expect(exercise?.history).toHaveLength(1)
    expect(activeId()).toBe('edit-exercise-btn-exercise-1')
  })

  it('confirms set deletion with focus on the safe choice and keeps focus afterwards', async () => {
    seed()
    wrapper = mountCard()

    await wrapper.get('#set-delete-btn-set-0').trigger('click')
    await flushPromises()
    expect(activeId()).toBe('set-delete-cancel-set-0')

    const confirm = wrapper.findAll('button').find((button) => button.text() === 'Löschen')
    await confirm?.trigger('click')
    await flushPromises()
    expect(activeId()).toBe('weight-exercise-1')
  })

  it('saves a quick second set when its repetitions are filled in', async () => {
    seed()
    wrapper = mountCard()
    const store = useGymStore()

    await wrapper.get('#weight-exercise-1').setValue('70')
    await wrapper.get('#reps-exercise-1').setValue('5')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('#reps-exercise-1').setValue('4')
    await wrapper.get('form').trigger('submit')

    expect(store.categories[0]?.exercises[0]?.history[0]?.sets.map((set) => set.reps)).toEqual([
      4, 5,
    ])
  })

  it('submits on Enter in the weight field when repetitions are already filled', async () => {
    seed()
    wrapper = mountCard()
    const store = useGymStore()

    await wrapper.get('#reps-exercise-1').setValue('5')
    await wrapper.get('#weight-exercise-1').setValue('70')
    const event = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })
    wrapper.get('#weight-exercise-1').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    await wrapper.get('form').trigger('submit')
    expect(store.categories[0]?.exercises[0]?.history[0]?.sets).toHaveLength(1)
  })

  it('announces an identical status again', async () => {
    seed()
    wrapper = mountCard()
    const region = wrapper.get('form [aria-live="polite"]').element
    const texts: string[] = []
    const observer = new MutationObserver(() => texts.push(region.textContent ?? ''))
    observer.observe(region, { childList: true, characterData: true, subtree: true })

    for (let attempt = 0; attempt < 2; attempt += 1) {
      vi.setSystemTime(new Date(2026, 6, 13, 18, attempt))
      await wrapper.get('#weight-exercise-1').setValue('60')
      await wrapper.get('#reps-exercise-1').setValue('10')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
    }

    observer.disconnect()
    const announced = texts.filter((text) => text.startsWith('Satz gespeichert'))
    expect(announced.length).toBeGreaterThanOrEqual(2)
  })
})
