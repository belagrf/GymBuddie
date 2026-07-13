import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useTransientMessage } from '@/composables/useTransientMessage'

const MessageHarness = defineComponent({
  setup() {
    return useTransientMessage(250)
  },
  template: `
    <button type="button" @click="show('Gespeichert.')">Anzeigen</button>
    <p>{{ message }}</p>
  `,
})

describe('useTransientMessage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('clears a success message after the configured duration', async () => {
    vi.useFakeTimers()
    const wrapper = mount(MessageHarness)

    await wrapper.get('button').trigger('click')
    expect(wrapper.get('p').text()).toBe('Gespeichert.')

    await vi.advanceTimersByTimeAsync(249)
    expect(wrapper.get('p').text()).toBe('Gespeichert.')

    await vi.advanceTimersByTimeAsync(1)
    expect(wrapper.get('p').text()).toBe('')

    wrapper.unmount()
  })
})
