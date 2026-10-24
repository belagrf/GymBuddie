import { onBeforeUnmount, onMounted, watch } from 'vue'

import { useSettingsStore } from '@/stores/settingsStore'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Applies the theme preference (System/Hell/Dunkel) to <html> and follows system changes. */
export function useTheme() {
  const settingsStore = useSettingsStore()
  let media: MediaQueryList | null = null

  function apply() {
    const preference = settingsStore.settings.theme
    const systemDark = media?.matches ?? false
    const dark = preference === 'dark' || (preference === 'system' && systemDark)
    document.documentElement.classList.toggle('dark', dark)
    // Match the browser and status bar to the page.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', dark ? '#020617' : '#0f172a')
  }

  onMounted(() => {
    media = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
    media?.addEventListener('change', apply)
    apply()
  })

  onBeforeUnmount(() => media?.removeEventListener('change', apply))

  watch(() => settingsStore.settings.theme, apply)
}
