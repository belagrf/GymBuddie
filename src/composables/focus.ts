import { nextTick } from 'vue'

/**
 * Moves keyboard focus to the first of the given elements that exists once the DOM has
 * updated. Used whenever a v-if swaps out the control that had focus, so focus never falls
 * back to <body>.
 */
export async function focusById(...ids: string[]) {
  await nextTick()
  for (const id of ids) {
    const element = document.getElementById(id)
    if (element) {
      element.focus()
      return
    }
  }
}
