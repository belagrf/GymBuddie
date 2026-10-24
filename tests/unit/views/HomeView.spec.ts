import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createGymDataEnvelope } from '@/domain/gymData'
import { GYM_STORAGE_KEY } from '@/stores/gymStore'
import HomeView from '@/views/HomeView.vue'

describe('HomeView', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(
      GYM_STORAGE_KEY,
      JSON.stringify(
        createGymDataEnvelope([
          {
            id: 'push',
            name: 'Push',
            exercises: [
              { id: 'bench', name: 'Bankdrücken', history: [] },
              { id: 'dips', name: 'Dips', history: [] },
            ],
          },
        ]),
      ),
    )
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('keeps focus in the category when an exercise is deleted while the add form is open', async () => {
    wrapper = mount(HomeView, { attachTo: document.body })

    await wrapper.get('#add-exercise-btn-push').trigger('click')
    await flushPromises()
    expect(document.activeElement?.id).toBe('new-exercise-name-push')

    await wrapper.get('#delete-exercise-btn-dips').trigger('click')
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Endgültig löschen')
      ?.trigger('click')
    await flushPromises()

    expect(document.activeElement?.id).toBe('new-exercise-name-push')
  })

  it('gives fieldsets room to shrink so long names cannot widen the form', async () => {
    wrapper = mount(HomeView, { attachTo: document.body })
    await wrapper.get('#add-exercise-btn-push').trigger('click')

    expect(wrapper.get('fieldset').classes()).toContain('min-w-0')
    expect(wrapper.get('legend').classes()).toContain('break-words')
  })
})
