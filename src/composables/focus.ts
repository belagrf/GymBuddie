import { nextTick } from 'vue'

/**
 * Moves keyboard focus to an element once the DOM has updated. Used whenever a v-if swaps
 * out the control that had focus, so focus never falls back to <body>.
 */
export async function focusById(id: string) {
  await nextTick()
  document.getElementById(id)?.focus()
}
