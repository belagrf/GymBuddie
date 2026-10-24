<script setup lang="ts">
import { formatWeight } from '@/domain/format'
import {
  REST_DURATIONS,
  WEIGHT_STEPS,
  useSettingsStore,
  type ThemePreference,
} from '@/stores/settingsStore'

const settingsStore = useSettingsStore()

const themes: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Wie das Gerät' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
]

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const optionClass =
  'flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-sm font-medium text-fg has-[:checked]:border-focus has-[:checked]:bg-info has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus'
const checkboxRowClass = 'flex min-h-11 cursor-pointer items-center gap-3 text-sm text-fg'
</script>

<template>
  <section
    class="mt-10 rounded-xl border border-line bg-surface p-4 shadow-sm"
    aria-labelledby="settings-heading"
  >
    <h2 id="settings-heading" class="text-lg font-bold text-fg">Einstellungen</h2>
    <p class="mt-1 text-sm text-fg-subtle">
      Gelten nur für dieses Gerät und sind nicht Teil von Backups.
    </p>

    <fieldset class="mt-4 min-w-0">
      <legend class="text-sm font-semibold text-fg-muted">Darstellung</legend>
      <div class="mt-2 flex flex-wrap gap-2">
        <label v-for="theme in themes" :key="theme.value" :class="optionClass">
          <input
            type="radio"
            name="theme"
            class="accent-blue-600"
            :value="theme.value"
            :checked="settingsStore.settings.theme === theme.value"
            @change="settingsStore.update({ theme: theme.value })"
          />
          {{ theme.label }}
        </label>
      </div>
    </fieldset>

    <fieldset class="mt-5 min-w-0">
      <legend class="text-sm font-semibold text-fg-muted">Pausentimer</legend>
      <div class="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Pausendauer">
        <label v-for="seconds in REST_DURATIONS" :key="seconds" :class="optionClass">
          <input
            type="radio"
            name="rest-duration"
            class="accent-blue-600"
            :value="seconds"
            :checked="settingsStore.settings.restSeconds === seconds"
            @change="settingsStore.update({ restSeconds: seconds })"
          />
          {{ formatDuration(seconds) }} Min.
        </label>
      </div>
      <div class="mt-2 space-y-1">
        <label :class="checkboxRowClass">
          <input
            type="checkbox"
            class="h-5 w-5 accent-blue-600"
            :checked="settingsStore.settings.restAutoStart"
            @change="
              settingsStore.update({ restAutoStart: ($event.target as HTMLInputElement).checked })
            "
          />
          Nach jedem gespeicherten Satz automatisch starten
        </label>
        <label :class="checkboxRowClass">
          <input
            type="checkbox"
            class="h-5 w-5 accent-blue-600"
            :checked="settingsStore.settings.restAlert"
            @change="
              settingsStore.update({ restAlert: ($event.target as HTMLInputElement).checked })
            "
          />
          Am Ende Ton und Vibration
        </label>
        <label :class="checkboxRowClass">
          <input
            type="checkbox"
            class="h-5 w-5 accent-blue-600"
            :checked="settingsStore.settings.keepAwake"
            @change="
              settingsStore.update({ keepAwake: ($event.target as HTMLInputElement).checked })
            "
          />
          Bildschirm während der Pause eingeschaltet lassen
        </label>
      </div>
    </fieldset>

    <fieldset class="mt-5 min-w-0">
      <legend class="text-sm font-semibold text-fg-muted">Gewichtsschritt für + und −</legend>
      <div class="mt-2 flex flex-wrap gap-2">
        <label v-for="step in WEIGHT_STEPS" :key="step" :class="optionClass">
          <input
            type="radio"
            name="weight-step"
            class="accent-blue-600"
            :value="step"
            :checked="settingsStore.settings.weightStep === step"
            @change="settingsStore.update({ weightStep: step })"
          />
          {{ formatWeight(step) }} kg
        </label>
      </div>
    </fieldset>
  </section>
</template>
