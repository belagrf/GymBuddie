<script setup lang="ts">
import { formatDateKey, formatWeight } from '@/domain/format'
import { roundEstimate, type ProgressPoint } from '@/domain/stats'
import { computed, ref } from 'vue'

const props = defineProps<{
  chartId: string
  exerciseName: string
  metric: 'estimate' | 'reps'
  points: ProgressPoint[]
}>()

const WIDTH = 320
const HEIGHT = 150
const PAD = { top: 14, right: 14, bottom: 24, left: 40 }
const DAY_MS = 24 * 60 * 60 * 1000

const selectedIndex = ref<number | null>(null)
const showTable = ref(false)

function dayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / DAY_MS
}

function formatValue(value: number) {
  return props.metric === 'estimate' ? `${formatWeight(roundEstimate(value))} kg` : `${value} Wdh.`
}

function niceStep(range: number) {
  const steps = props.metric === 'estimate' ? [1, 2.5, 5, 10, 20, 25, 50, 100] : [1, 2, 5, 10, 20]
  return steps.find((step) => range / step <= 4) ?? 100
}

const scale = computed(() => {
  const days = props.points.map((point) => dayNumber(point.date))
  const values = props.points.map((point) => point.value)
  const firstDay = Math.min(...days)
  const lastDay = Math.max(...days)
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const step = niceStep(Math.max(maxValue - minValue, props.metric === 'estimate' ? 5 : 2))
  const yMin = Math.max(0, Math.floor(minValue / step) * step)
  const yMax = Math.max(yMin + step, Math.ceil(maxValue / step) * step)
  const innerWidth = WIDTH - PAD.left - PAD.right
  const innerHeight = HEIGHT - PAD.top - PAD.bottom

  return {
    yMin,
    yMax,
    x: (day: number) =>
      PAD.left +
      (lastDay === firstDay
        ? innerWidth / 2
        : ((day - firstDay) / (lastDay - firstDay)) * innerWidth),
    y: (value: number) => PAD.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight,
  }
})

const coordinates = computed(() =>
  props.points.map((point) => ({
    x: scale.value.x(dayNumber(point.date)),
    y: scale.value.y(point.value),
  })),
)

const linePath = computed(() =>
  coordinates.value
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`)
    .join(' '),
)

const areaPath = computed(() => {
  const first = coordinates.value[0]
  const last = coordinates.value.at(-1)
  if (!first || !last) return ''
  const baseline = HEIGHT - PAD.bottom
  return `${linePath.value} L${last.x},${baseline} L${first.x},${baseline} Z`
})

const ticks = computed(() => {
  const { yMin, yMax } = scale.value
  return [yMin, (yMin + yMax) / 2, yMax].map((value) => ({ value, y: scale.value.y(value) }))
})

const metricLabel = computed(() =>
  props.metric === 'estimate'
    ? 'Geschätztes Maximum (bester Satz pro Tag)'
    : 'Wiederholungen (bester Satz pro Tag)',
)

const summary = computed(() => {
  const first = props.points[0]
  const last = props.points.at(-1)
  if (!first || !last) return ''
  return `${metricLabel.value} für ${props.exerciseName}: von ${formatValue(first.value)} am ${formatDateKey(first.date)} auf ${formatValue(last.value)} am ${formatDateKey(last.date)}, ${props.points.length} Trainingstage.`
})

const selected = computed(() =>
  selectedIndex.value === null ? null : (props.points[selectedIndex.value] ?? null),
)
const selectedCoordinates = computed(() =>
  selectedIndex.value === null ? null : (coordinates.value[selectedIndex.value] ?? null),
)
const readout = computed(() => {
  const point = selected.value
  if (!point) return ''
  return `${formatDateKey(point.date)}: ${formatValue(point.value)} (${formatWeight(point.weight)} kg × ${point.reps} Wdh.)`
})

function selectNearest(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const box = svg.getBoundingClientRect()
  if (box.width === 0) return
  const x = ((event.clientX - box.left) / box.width) * WIDTH
  let nearest = 0
  coordinates.value.forEach((point, index) => {
    if (Math.abs(point.x - x) < Math.abs((coordinates.value[nearest]?.x ?? 0) - x)) nearest = index
  })
  selectedIndex.value = nearest
}

function handleKeydown(event: KeyboardEvent) {
  const last = props.points.length - 1
  const current = selectedIndex.value ?? last
  const next =
    event.key === 'ArrowLeft'
      ? Math.max(0, current - 1)
      : event.key === 'ArrowRight'
        ? Math.min(last, current + 1)
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null
  if (next === null) return
  event.preventDefault()
  selectedIndex.value = next
}
</script>

<template>
  <figure class="mt-3" :aria-labelledby="`${chartId}-title`">
    <figcaption :id="`${chartId}-title`" class="text-sm font-semibold text-fg-muted">
      {{ metricLabel }}
    </figcaption>

    <div class="relative mt-1">
      <svg
        :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
        class="block h-auto w-full touch-pan-y rounded-lg focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        role="img"
        tabindex="0"
        :aria-label="summary"
        :aria-describedby="`${chartId}-readout`"
        @pointermove="selectNearest"
        @pointerdown="selectNearest"
        @pointerleave="selectedIndex = null"
        @focus="selectedIndex ??= points.length - 1"
        @blur="selectedIndex = null"
        @keydown="handleKeydown"
      >
        <g aria-hidden="true">
          <line
            v-for="tick in ticks"
            :key="tick.value"
            :x1="PAD.left"
            :x2="WIDTH - PAD.right"
            :y1="tick.y"
            :y2="tick.y"
            class="stroke-chart-grid"
            stroke-width="1"
          />
          <text
            v-for="tick in ticks"
            :key="`label-${tick.value}`"
            :x="PAD.left - 6"
            :y="tick.y + 4"
            text-anchor="end"
            class="fill-fg-subtle text-[10px] tabular-nums"
          >
            {{ metric === 'estimate' ? formatWeight(tick.value) : tick.value }}
          </text>
          <text :x="PAD.left" :y="HEIGHT - 6" class="fill-fg-subtle text-[10px]">
            {{ formatDateKey(points[0]?.date ?? '') }}
          </text>
          <text
            :x="WIDTH - PAD.right"
            :y="HEIGHT - 6"
            text-anchor="end"
            class="fill-fg-subtle text-[10px]"
          >
            {{ formatDateKey(points.at(-1)?.date ?? '') }}
          </text>

          <path :d="areaPath" class="fill-chart-line" fill-opacity="0.1" />
          <path
            :d="linePath"
            class="stroke-chart-line"
            fill="none"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />

          <line
            v-if="selectedCoordinates"
            :x1="selectedCoordinates.x"
            :x2="selectedCoordinates.x"
            :y1="PAD.top"
            :y2="HEIGHT - PAD.bottom"
            class="stroke-fg-subtle"
            stroke-width="1"
          />
          <circle
            v-for="(point, index) in selectedCoordinates
              ? [selectedCoordinates]
              : coordinates.slice(-1)"
            :key="index"
            :cx="point.x"
            :cy="point.y"
            r="4.5"
            class="fill-chart-line stroke-surface"
            stroke-width="2"
          />
        </g>
      </svg>

      <div
        v-if="selected && selectedCoordinates"
        class="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-2 py-1 text-xs whitespace-nowrap text-fg shadow-sm"
        :style="{ left: `${Math.min(85, Math.max(15, (selectedCoordinates.x / WIDTH) * 100))}%` }"
        aria-hidden="true"
      >
        <strong class="font-semibold">{{ formatValue(selected.value) }}</strong>
        <span class="text-fg-subtle">
          · {{ formatWeight(selected.weight) }} kg × {{ selected.reps }} ·
          {{ formatDateKey(selected.date) }}</span
        >
      </div>
    </div>

    <p :id="`${chartId}-readout`" class="sr-only" aria-live="polite">{{ readout }}</p>

    <button
      type="button"
      class="mt-1 min-h-11 rounded-lg px-2 text-sm font-semibold text-accent-fg hover:bg-info focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      :aria-expanded="showTable"
      :aria-controls="`${chartId}-table`"
      @click="showTable = !showTable"
    >
      {{ showTable ? 'Tabelle ausblenden' : 'Als Tabelle anzeigen' }}
    </button>
    <div v-if="showTable" :id="`${chartId}-table`" class="max-h-64 overflow-y-auto">
      <table class="w-full text-left text-sm">
        <caption class="sr-only">
          {{
            metricLabel
          }}
          für
          {{
            exerciseName
          }}
        </caption>
        <thead class="text-fg-subtle">
          <tr>
            <th scope="col" class="py-1 font-medium">Datum</th>
            <th scope="col" class="py-1 font-medium">Bester Satz</th>
            <th scope="col" class="py-1 text-right font-medium">
              {{ metric === 'estimate' ? 'Geschätzt' : 'Wdh.' }}
            </th>
          </tr>
        </thead>
        <tbody class="tabular-nums text-fg">
          <tr
            v-for="point in [...points].reverse()"
            :key="point.date"
            class="border-t border-line-subtle"
          >
            <td class="py-1">{{ formatDateKey(point.date) }}</td>
            <td class="py-1">{{ formatWeight(point.weight) }} kg × {{ point.reps }}</td>
            <td class="py-1 text-right">{{ formatValue(point.value) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </figure>
</template>
