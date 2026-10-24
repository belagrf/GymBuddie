import type { SetEntry, WorkoutSession } from './gymData'

/** Estimated one-repetition maximum (Epley). A single repetition is its own maximum. */
export function estimatedOneRepMax(weight: number, reps: number): number {
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

/** Rounds an estimated value for display; estimates never deserve more than 0,5 kg precision. */
export function roundEstimate(value: number): number {
  return Math.round(value * 2) / 2
}

export interface DatedSet extends SetEntry {
  date: string
}

/** All sets oldest first: sessions are stored newest first, and so are the sets inside them. */
export function chronologicalSets(history: WorkoutSession[]): DatedSet[] {
  const sets: DatedSet[] = []
  for (let sessionIndex = history.length - 1; sessionIndex >= 0; sessionIndex -= 1) {
    const session = history[sessionIndex]
    if (!session) continue
    for (let setIndex = session.sets.length - 1; setIndex >= 0; setIndex -= 1) {
      const set = session.sets[setIndex]
      if (set) sets.push({ ...set, date: session.date })
    }
  }
  return sets
}

export type RecordKind = 'weight' | 'estimate' | 'reps'

/**
 * Which records a new set would set against every earlier set of the exercise. Records must be
 * strictly better, the very first set of an exercise is never a record, and bodyweight sets
 * (0 kg) compete on repetitions among themselves.
 */
export function recordsForNewSet(
  history: WorkoutSession[],
  candidate: { weight: number; reps: number },
): RecordKind[] {
  const earlier = chronologicalSets(history)
  if (earlier.length === 0) return []

  if (candidate.weight === 0) {
    const bodyweight = earlier.filter((set) => set.weight === 0)
    if (bodyweight.length === 0) return []
    return candidate.reps > Math.max(...bodyweight.map((set) => set.reps)) ? ['reps'] : []
  }

  const weighted = earlier.filter((set) => set.weight > 0)
  if (weighted.length === 0) return []

  const kinds: RecordKind[] = []
  if (candidate.weight > Math.max(...weighted.map((set) => set.weight))) kinds.push('weight')
  const bestEstimate = Math.max(...weighted.map((set) => estimatedOneRepMax(set.weight, set.reps)))
  if (estimatedOneRepMax(candidate.weight, candidate.reps) > bestEstimate) kinds.push('estimate')
  return kinds
}

export interface ExerciseRecords {
  /** The earliest set that reached the heaviest weight. */
  heaviest: DatedSet | null
  /** The earliest set with the best estimated maximum. */
  bestEstimate: (DatedSet & { estimate: number }) | null
  /** The earliest bodyweight set with the most repetitions. */
  mostBodyweightReps: DatedSet | null
}

export function exerciseRecords(history: WorkoutSession[]): ExerciseRecords {
  const records: ExerciseRecords = { heaviest: null, bestEstimate: null, mostBodyweightReps: null }

  // Oldest first with strict comparisons, so ties keep the set that got there first.
  for (const set of chronologicalSets(history)) {
    if (set.weight === 0) {
      if (!records.mostBodyweightReps || set.reps > records.mostBodyweightReps.reps) {
        records.mostBodyweightReps = set
      }
      continue
    }
    if (!records.heaviest || set.weight > records.heaviest.weight) records.heaviest = set
    const estimate = estimatedOneRepMax(set.weight, set.reps)
    if (!records.bestEstimate || estimate > records.bestEstimate.estimate) {
      records.bestEstimate = { ...set, estimate }
    }
  }
  return records
}

/**
 * IDs of the sets that hold a record and beat an earlier set. The very first set of an exercise
 * (or its first bodyweight set) holds a record trivially, so it is not marked.
 */
export function earnedRecordIds(history: WorkoutSession[]): Set<string> {
  const sets = chronologicalSets(history)
  const firstWeighted = sets.find((set) => set.weight > 0)?.id
  const firstBodyweight = sets.find((set) => set.weight === 0)?.id
  const records = exerciseRecords(history)
  return new Set(
    [records.heaviest, records.bestEstimate, records.mostBodyweightReps]
      .filter((set) => set !== null)
      .map((set) => set.id)
      .filter((id) => id !== firstWeighted && id !== firstBodyweight),
  )
}

export interface ProgressPoint {
  date: string
  value: number
  weight: number
  reps: number
}

export interface ProgressSeries {
  metric: 'estimate' | 'reps'
  points: ProgressPoint[]
}

/**
 * The best set per training day, oldest first: estimated maximum for weighted exercises, or
 * repetitions for exercises that only ever used bodyweight.
 */
export function progressSeries(history: WorkoutSession[]): ProgressSeries {
  const weighted = history.some((session) => session.sets.some((set) => set.weight > 0))
  const points: ProgressPoint[] = []

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const session = history[index]
    if (!session) continue
    let best: ProgressPoint | null = null
    for (const set of session.sets) {
      if (weighted && set.weight === 0) continue
      const value = weighted ? estimatedOneRepMax(set.weight, set.reps) : set.reps
      if (!best || value > best.value) {
        best = { date: session.date, value, weight: set.weight, reps: set.reps }
      }
    }
    if (best) points.push(best)
  }

  return { metric: weighted ? 'estimate' : 'reps', points }
}
