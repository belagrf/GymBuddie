import { describe, expect, it } from 'vitest'

import type { WorkoutSession } from '@/domain/gymData'
import {
  chronologicalSets,
  earnedRecordIds,
  estimatedOneRepMax,
  exerciseRecords,
  progressSeries,
  recordsForNewSet,
  roundEstimate,
} from '@/domain/stats'

// Stored newest first, like the app does.
const history: WorkoutSession[] = [
  {
    date: '2026-07-12',
    sets: [
      { id: 'c2', weight: 62.5, reps: 6 },
      { id: 'c1', weight: 60, reps: 8 },
    ],
  },
  {
    date: '2026-07-08',
    sets: [
      { id: 'b2', weight: 62.5, reps: 5 },
      { id: 'b1', weight: 57.5, reps: 8 },
    ],
  },
]

describe('training statistics', () => {
  it('estimates the one-repetition maximum with Epley', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100)
    expect(estimatedOneRepMax(60, 10)).toBe(80)
    expect(roundEstimate(76.66)).toBe(76.5)
    expect(roundEstimate(76.8)).toBe(77)
  })

  it('lists sets oldest first', () => {
    expect(chronologicalSets(history).map((set) => set.id)).toEqual(['b1', 'b2', 'c1', 'c2'])
  })

  it('never calls the very first set a record', () => {
    expect(recordsForNewSet([], { weight: 100, reps: 5 })).toEqual([])
  })

  it('detects a heavier weight and a better estimate, but not ties', () => {
    expect(recordsForNewSet(history, { weight: 65, reps: 3 })).toEqual(['weight'])
    // Same weight as the best, more reps: only the estimate improves.
    expect(recordsForNewSet(history, { weight: 62.5, reps: 8 })).toEqual(['estimate'])
    expect(recordsForNewSet(history, { weight: 65, reps: 8 })).toEqual(['weight', 'estimate'])
    // A tie with the heaviest set is not a record.
    expect(recordsForNewSet(history, { weight: 62.5, reps: 6 })).toEqual([])
    expect(recordsForNewSet(history, { weight: 50, reps: 5 })).toEqual([])
  })

  it('compares bodyweight sets by repetitions only', () => {
    const bodyweight: WorkoutSession[] = [
      { date: '2026-07-10', sets: [{ id: 'p1', weight: 0, reps: 10 }] },
    ]
    expect(recordsForNewSet(bodyweight, { weight: 0, reps: 11 })).toEqual(['reps'])
    expect(recordsForNewSet(bodyweight, { weight: 0, reps: 10 })).toEqual([])
    // The first weighted set after only bodyweight work has nothing to beat.
    expect(recordsForNewSet(bodyweight, { weight: 10, reps: 5 })).toEqual([])
    // The first bodyweight set after weighted work has nothing to beat either.
    expect(recordsForNewSet(history, { weight: 0, reps: 20 })).toEqual([])
  })

  it('finds the earliest set holding each record', () => {
    const records = exerciseRecords(history)
    expect(records.heaviest?.id).toBe('b2')
    // 60 kg × 8 (≈ 76 kg) beats 62,5 kg × 6 (75 kg).
    expect(records.bestEstimate?.id).toBe('c1')
    expect(records.mostBodyweightReps).toBeNull()
  })

  it('marks only records that beat an earlier set', () => {
    expect([...earnedRecordIds(history)].sort()).toEqual(['b2', 'c1'])
    expect(
      earnedRecordIds([{ date: '2026-07-01', sets: [{ id: 'only', weight: 60, reps: 8 }] }]).size,
    ).toBe(0)
    // Three identical sets: the first holds the record trivially, nothing is marked.
    expect(
      earnedRecordIds([
        {
          date: '2026-07-01',
          sets: [
            { id: 's3', weight: 60, reps: 8 },
            { id: 's2', weight: 60, reps: 8 },
            { id: 's1', weight: 60, reps: 8 },
          ],
        },
      ]).size,
    ).toBe(0)
  })

  it('builds a progress series from the best set per day, oldest first', () => {
    const series = progressSeries(history)
    expect(series.metric).toBe('estimate')
    expect(series.points.map((point) => [point.date, point.weight, point.reps])).toEqual([
      ['2026-07-08', 62.5, 5],
      ['2026-07-12', 60, 8],
    ])
  })

  it('tracks repetitions for exercises without any weight', () => {
    const series = progressSeries([
      {
        date: '2026-07-12',
        sets: [
          { id: 'x2', weight: 0, reps: 12 },
          { id: 'x1', weight: 0, reps: 15 },
        ],
      },
      { date: '2026-07-10', sets: [{ id: 'w1', weight: 0, reps: 10 }] },
    ])
    expect(series).toEqual({
      metric: 'reps',
      points: [
        { date: '2026-07-10', value: 10, weight: 0, reps: 10 },
        { date: '2026-07-12', value: 15, weight: 0, reps: 15 },
      ],
    })
  })
})
