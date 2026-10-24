import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import PwaPrompt from '@/components/PwaPrompt.vue'

import { registerSW } from '../mocks/pwa-register'

function fakeRegistration(waiting: boolean) {
  return {
    waiting: waiting ? {} : null,
    update: vi.fn().mockResolvedValue(undefined),
  } as unknown as ServiceWorkerRegistration
}

describe('PwaPrompt', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('brings back a postponed update and checks for updates when the app is resumed', async () => {
    const wrapper = mount(PwaPrompt)
    const registration = fakeRegistration(true)
    registerSW.options?.onRegisteredSW?.('sw.js', registration)

    expect(wrapper.text()).not.toContain('neue Version')
    document.dispatchEvent(new Event('visibilitychange'))
    await flushPromises()

    expect(wrapper.text()).toContain('Eine neue Version ist verfügbar.')
    expect(registration.update).toHaveBeenCalledTimes(1)

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Später')
      ?.trigger('click')
    expect(wrapper.text()).not.toContain('neue Version')
    wrapper.unmount()

    document.dispatchEvent(new Event('visibilitychange'))
    expect(registration.update).toHaveBeenCalledTimes(1)
  })

  it('ignores failed update checks on flaky connections', async () => {
    vi.useFakeTimers()
    const wrapper = mount(PwaPrompt)
    const registration = fakeRegistration(false)
    vi.mocked(registration.update).mockRejectedValue(new Error('offline'))
    registerSW.options?.onRegisteredSW?.('sw.js', registration)

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000)

    expect(registration.update).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toBe('')
    wrapper.unmount()
  })

  it('keeps its live region in the DOM while no message is shown', () => {
    const wrapper = mount(PwaPrompt)
    expect(wrapper.get('[role="status"]').attributes('aria-live')).toBe('polite')
    wrapper.unmount()
  })
})
