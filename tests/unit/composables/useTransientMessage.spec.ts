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

  it('re-inserts an identical message so screen readers announce it again', async () => {
    vi.useFakeTimers()
    const wrapper = mount(MessageHarness)
    const texts: string[] = []
    const observer = new MutationObserver(() => texts.push(wrapper.get('p').text()))
    observer.observe(wrapper.get('p').element, {
      childList: true,
      characterData: true,
      subtree: true,
    })

    await wrapper.get('button').trigger('click')
    await wrapper.get('button').trigger('click')
    await vi.advanceTimersByTimeAsync(0)

    expect(wrapper.get('p').text()).toBe('Gespeichert.')
    expect(texts).toContain('')
    expect(texts.filter((text) => text === 'Gespeichert.').length).toBeGreaterThanOrEqual(2)

    observer.disconnect()
    wrapper.unmount()
  })
})
