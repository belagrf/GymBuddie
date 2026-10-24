<script setup lang="ts">
import { RouterView } from 'vue-router'
import PwaPrompt from '@/components/PwaPrompt.vue'
import RestTimerBar from '@/components/RestTimerBar.vue'
import { useTheme } from '@/composables/useTheme'

useTheme()
</script>

<template>
  <RouterView />
  <RestTimerBar />
  <PwaPrompt />
</template>
