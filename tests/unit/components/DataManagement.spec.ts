import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import DataManagement from '@/components/DataManagement.vue'
import {
  createGymDataEnvelope,
  createGymDataExport,
  MAX_IMPORT_BYTES,
  type Category,
} from '@/domain/gymData'
import { GYM_STORAGE_KEY, PRE_IMPORT_BACKUP_KEY, useGymStore } from '@/stores/gymStore'

const current: Category = { id: 'push', name: 'Push', exercises: [] }
const incoming: Category = {
  id: 'pull',
  name: 'Pull',
  exercises: [
    {
      id: 'rows',
      name: 'Rudern',
      history: [{ date: '2026-07-12', sets: [{ id: 's1', weight: 50, reps: 10 }] }],
    },
  ],
}

async function selectFile(wrapper: VueWrapper, contents: string, name = 'backup.json') {
  const input = wrapper.get('#import-input')
  const file = new File([contents], name, { type: 'application/json' })
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await flushPromises()
}

describe('DataManagement', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem(GYM_STORAGE_KEY, JSON.stringify(createGymDataEnvelope([current])))
    setActivePinia(createPinia())
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
  })

  it('rejects a file that is not a GymBuddie backup before asking anything', async () => {
    wrapper = mount(DataManagement, { attachTo: document.body })

    await selectFile(wrapper, '[]', 'other.json')

    expect(wrapper.get('[role="alert"]').text()).toContain(
      '„other.json“ kann nicht importiert werden',
    )
    expect(wrapper.text()).not.toContain('Daten ersetzen')
    expect(useGymStore().categories.map((category) => category.name)).toEqual(['Push'])
  })

  it('rejects files above the import limit', async () => {
    wrapper = mount(DataManagement, { attachTo: document.body })
    const input = wrapper.get('#import-input')
    const file = new File(['{}'], 'huge.json')
    Object.defineProperty(file, 'size', { value: MAX_IMPORT_BYTES + 1 })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

    await input.trigger('change')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('größer als 20 MB')
  })

  it('shows a summary of the backup and the current data before replacing anything', async () => {
    wrapper = mount(DataManagement, { attachTo: document.body })

    await selectFile(
      wrapper,
      JSON.stringify(createGymDataExport([incoming], '2026-07-13T10:00:00.000Z')),
    )

    const review = wrapper.get('[aria-labelledby="import-review-heading"]')
    expect(review.text()).toContain('1 Kategorie, 1 Übung, 1 Satz')
    expect(review.text()).toContain('Aktuell:1 Kategorie, 0 Übungen, 0 Sätze')
    expect(document.activeElement?.id).toBe('import-review-heading')

    const replace = wrapper.findAll('button').find((button) => button.text() === 'Daten ersetzen')
    await replace?.trigger('click')
    await flushPromises()

    expect(useGymStore().categories.map((category) => category.name)).toEqual(['Pull'])
    expect(localStorage.getItem(PRE_IMPORT_BACKUP_KEY)).not.toBeNull()
    expect(wrapper.text()).toContain('Backup importiert: 1 Kategorie, 1 Übung, 1 Satz.')
    expect(wrapper.text()).toContain('Datenstand vor dem letzten Import')
    expect(document.activeElement?.id).toBe('import-input')
  })

  it('exports a backup through a temporary link and records the export', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:backup')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined)
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    vi.useFakeTimers()
    wrapper = mount(DataManagement, { attachTo: document.body })

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Backup exportieren')
      ?.trigger('click')

    expect(click).toHaveBeenCalledTimes(1)
    // Revoking right after the click cancels downloads in some browsers.
    expect(revoke).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(revoke).toHaveBeenCalledWith('blob:backup')
    expect(useGymStore().lastExportAt).not.toBeNull()
    expect(wrapper.text()).toContain('Letztes Backup:')
    vi.useRealTimers()
  })
})
