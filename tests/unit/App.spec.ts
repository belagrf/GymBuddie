import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App.vue'
import { createGymDataEnvelope } from '@/domain/gymData'
import router from '@/router'
import { GYM_STORAGE_KEY } from '@/stores/gymStore'

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear()
    await router.push('/')
    await router.isReady()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the GymBuddie application shell', () => {
    const wrapper = mount(App, {
      global: {
        plugins: [createPinia(), router],
      },
    })

    expect(wrapper.get('h1').text()).toBe('GymBuddie')
    expect(wrapper.text()).toContain('Training')
    wrapper.unmount()
  })

  it.each(['/index.html', '/does/not/exist'])(
    'redirects %s to the app instead of a blank page',
    async (path) => {
      await router.push(path)
      await flushPromises()

      expect(router.currentRoute.value.name).toBe('home')
      const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
      expect(wrapper.get('h1').text()).toBe('GymBuddie')
      wrapper.unmount()
    },
  )

  it('stops counting yesterday’s sets as today’s after midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 13, 23, 59, 0))
    localStorage.setItem(
      GYM_STORAGE_KEY,
      JSON.stringify(
        createGymDataEnvelope([
          {
            id: 'push',
            name: 'Push',
            exercises: [
              {
                id: 'bench',
                name: 'Bankdrücken',
                history: [{ date: '2026-07-13', sets: [{ id: 's1', weight: 60, reps: 8 }] }],
              },
            ],
          },
        ]),
      ),
    )
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] } })
    expect(wrapper.get('header').text()).toContain('1 Satz absolviert')

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    expect(wrapper.get('header').text()).toContain('Zeit, ins Training zu starten!')
    wrapper.unmount()
  })
})
