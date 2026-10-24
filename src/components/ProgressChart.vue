<script setup lang="ts">
import { formatDateKey, formatWeight } from '@/domain/format'
import { roundEstimate, type ProgressPoint } from '@/domain/stats'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{
  chartId: string
  exerciseName: string
  metric: 'estimate' | 'reps'
  points: ProgressPoint[]
}>()

const HEIGHT = 150
const PAD = { top: 12, right: 14, bottom: 24, left: 40 }
const DAY_MS = 24 * 60 * 60 * 1000

// The viewBox follows the rendered width, so one unit is one CSS pixel and labels keep their size.
const container = ref<HTMLElement | null>(null)
const width = ref(320)
let resizeObserver: ResizeObserver | null = null

const selectedIndex = ref<number | null>(null)
const showTable = ref(false)
let focusFromPointer = false

onMounted(() => {
  const element = container.value
  if (!element) return
  if (element.clientWidth > 0) width.value = element.clientWidth
  if (typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(([entry]) => {
    const next = Math.round(entry?.contentRect.width ?? 0)
    if (next > 0) width.value = next
  })
  resizeObserver.observe(element)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

function dayNumber(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) / DAY_MS
}

function formatValue(value: number) {
  return props.metric === 'estimate' ? `${formatWeight(roundEstimate(value))} kg` : `${value} Wdh.`
}

function niceStep(range: number) {
  const steps =
    props.metric === 'estimate' ? [1, 2.5, 5, 10, 20, 25, 50, 100] : [1, 2, 5, 10, 20, 50]
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
  const innerWidth = Math.max(1, width.value - PAD.left - PAD.right)
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
  const middle = (yMin + yMax) / 2
  // Repetitions are whole numbers; a "8,5" tick would be meaningless.
  const values =
    props.metric === 'reps' && !Number.isInteger(middle) ? [yMin, yMax] : [yMin, middle, yMax]
  return values.map((value) => ({ value, y: scale.value.y(value) }))
})

const metricLabel = computed(() =>
  props.metric === 'estimate'
    ? 'Geschätztes Maximum (bester Satz pro Tag)'
    : 'Wiederholungen mit Körpergewicht (bester Satz pro Tag)',
)

const summary = computed(() => {
  const first = props.points[0]
  const last = props.points.at(-1)
  if (!first || !last) return ''
  return `${metricLabel.value} für ${props.exerciseName}: von ${formatValue(first.value)} am ${formatDateKey(first.date)} auf ${formatValue(last.value)} am ${formatDateKey(last.date)}, ${props.points.length} Trainingstage.`
})

const shownIndex = computed(() => selectedIndex.value ?? props.points.length - 1)
const shown = computed(() => props.points[shownIndex.value] ?? null)
const shownCoordinates = computed(() => coordinates.value[shownIndex.value] ?? null)

function describe(point: ProgressPoint) {
  return `${formatDateKey(point.date)}: ${formatValue(point.value)} (${formatWeight(point.weight)} kg × ${point.reps} Wdh.)`
}

const readout = computed(() => {
  const point = selectedIndex.value === null ? null : props.points[selectedIndex.value]
  return point ? describe(point) : ''
})

function selectNearest(event: PointerEvent) {
  const svg = event.currentTarget as SVGSVGElement
  const box = svg.getBoundingClientRect()
  if (box.width === 0) return
  const x = ((event.clientX - box.left) / box.width) * width.value
  let nearest = 0
  coordinates.value.forEach((point, index) => {
    if (Math.abs(point.x - x) < Math.abs((coordinates.value[nearest]?.x ?? 0) - x)) nearest = index
  })
  selectedIndex.value = nearest
}

function handlePointerDown(event: PointerEvent) {
  focusFromPointer = true
  selectNearest(event)
}

function handlePointerLeave(event: PointerEvent) {
  // Touch fires pointerleave right after every tap; keep a tapped point until the next tap.
  if (event.pointerType === 'mouse') selectedIndex.value = null
}

function handleFocus() {
  if (!focusFromPointer) selectedIndex.value ??= props.points.length - 1
  focusFromPointer = false
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

    <!-- A fixed readout instead of a floating tooltip: it can never be clipped on narrow screens. -->
    <p v-if="shown" class="mt-1 min-h-6 text-sm text-fg" aria-hidden="true">
      <strong class="font-semibold tabular-nums">{{ formatValue(shown.value) }}</strong>
      <span class="text-fg-subtle">
        · {{ formatWeight(shown.weight) }} kg × {{ shown.reps }} · {{ formatDateKey(shown.date) }}
      </span>
    </p>

    <div ref="container" class="mt-1">
      <svg
        :viewBox="`0 0 ${width} ${HEIGHT}`"
        :height="HEIGHT"
        class="block w-full touch-pan-y rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        role="img"
        tabindex="0"
        :aria-label="summary"
        :aria-describedby="`${chartId}-readout`"
        @pointermove="selectNearest"
        @pointerdown="handlePointerDown"
        @pointerleave="handlePointerLeave"
        @focus="handleFocus"
        @blur="selectedIndex = null"
        @keydown="handleKeydown"
      >
        <g aria-hidden="true">
          <line
            v-for="tick in ticks"
            :key="tick.value"
            :x1="PAD.left"
            :x2="width - PAD.right"
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
            class="fill-fg-subtle text-[11px] tabular-nums"
          >
            {{ formatWeight(tick.value) }}
          </text>
          <text :x="PAD.left" :y="HEIGHT - 6" class="fill-fg-subtle text-[11px]">
            {{ formatDateKey(points[0]?.date ?? '') }}
          </text>
          <text
            :x="width - PAD.right"
            :y="HEIGHT - 6"
            text-anchor="end"
            class="fill-fg-subtle text-[11px]"
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
            v-if="selectedIndex !== null && shownCoordinates"
            :x1="shownCoordinates.x"
            :x2="shownCoordinates.x"
            :y1="PAD.top"
            :y2="HEIGHT - PAD.bottom"
            class="stroke-fg-subtle"
            stroke-width="1"
          />
          <circle
            v-if="shownCoordinates"
            :cx="shownCoordinates.x"
            :cy="shownCoordinates.y"
            r="4.5"
            class="fill-chart-line stroke-surface"
            stroke-width="2"
          />
        </g>
      </svg>
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
    <div
      v-if="showTable"
      :id="`${chartId}-table`"
      class="max-h-64 overflow-y-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      role="region"
      tabindex="0"
      :aria-label="`Fortschrittstabelle ${exerciseName}`"
    >
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
        <tbody class="text-fg tabular-nums">
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
