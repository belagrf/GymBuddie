import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import StorageNotice from '@/components/StorageNotice.vue'
import { GYM_STORAGE_KEY, RECOVERY_BACKUP_KEY, useGymStore } from '@/stores/gymStore'

function button(wrapper: VueWrapper, text: string) {
  const match = wrapper.findAll('button').find((candidate) => candidate.text() === text)
  if (!match) throw new Error(`No button "${text}"`)
  return match
}

describe('StorageNotice', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    localStorage.clear()
    // All recovery slots are taken, so the unreadable payload cannot be preserved.
    localStorage.setItem(RECOVERY_BACKUP_KEY, 'copy 1')
    localStorage.setItem(`${RECOVERY_BACKUP_KEY}:2`, 'copy 2')
    localStorage.setItem(`${RECOVERY_BACKUP_KEY}:3`, 'copy 3')
    localStorage.setItem(GYM_STORAGE_KEY, '{unreadable')
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('asks for confirmation before discarding unreadable data', async () => {
    wrapper = mount(StorageNotice, { attachTo: document.body })
    const store = useGymStore()

    await button(wrapper, 'Verwerfen und weitermachen').trigger('click')
    await flushPromises()
    expect(store.writeBlock).toBe('unpreserved-data')
    expect(document.activeElement?.id).toBe('discard-unreadable-cancel')

    await button(wrapper, 'Abbrechen').trigger('click')
    await flushPromises()
    expect(store.writeBlock).toBe('unpreserved-data')
    expect(document.activeElement?.id).toBe('discard-unreadable-button')

    await button(wrapper, 'Verwerfen und weitermachen').trigger('click')
    await button(wrapper, 'Endgültig verwerfen').trigger('click')
    expect(store.writeBlock).toBeNull()
    expect(wrapper.text()).toBe('')
  })

  it('lifts the block after the raw data was downloaded', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:raw')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    wrapper = mount(StorageNotice, { attachTo: document.body })

    await button(wrapper, 'Rohdaten herunterladen').trigger('click')

    expect(click).toHaveBeenCalledTimes(1)
    expect(useGymStore().writeBlock).toBeNull()
  })

  it('only offers a reload when the data comes from a newer version', () => {
    localStorage.setItem(GYM_STORAGE_KEY, '{"app":"GymBuddie","version":3,"categories":[]}')
    setActivePinia(createPinia())
    wrapper = mount(StorageNotice)

    expect(wrapper.text()).toContain('neueren GymBuddie-Version')
    expect(wrapper.findAll('button').map((candidate) => candidate.text())).toEqual([
      'App neu laden',
    ])
  })
})
