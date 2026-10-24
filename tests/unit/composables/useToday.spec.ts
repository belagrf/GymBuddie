import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useToday } from '@/composables/useToday'

const TodayHarness = defineComponent({
  setup() {
    return { today: useToday() }
  },
  template: '<p>{{ today }}</p>',
})

describe('useToday', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('rolls over to the next local date after midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 24, 23, 59, 0))
    const wrapper = mount(TodayHarness)
    expect(wrapper.text()).toBe('2026-10-24')

    await vi.advanceTimersByTimeAsync(2 * 60 * 1000)
    expect(wrapper.text()).toBe('2026-10-25')

    wrapper.unmount()
  })

  it('refreshes when the page becomes visible again', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 24, 12, 0, 0))
    const wrapper = mount(TodayHarness)

    // Timers do not run while a phone sleeps; simulate waking up two days later.
    vi.setSystemTime(new Date(2026, 9, 26, 8, 0, 0))
    document.dispatchEvent(new Event('visibilitychange'))
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toBe('2026-10-26')

    wrapper.unmount()
  })
})
