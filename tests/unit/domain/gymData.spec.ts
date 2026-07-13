import { describe, expect, it } from 'vitest'

import {
  GYM_DATA_VERSION,
  MAX_REPS,
  MAX_WEIGHT_KG,
  createGymDataExport,
  isCalendarDateKey,
  isValidSetValues,
  normalizeVideoUrl,
  parseGymData,
  toLocalDateKey,
} from '@/domain/gymData'

describe('gym data domain', () => {
  it('creates date keys from local calendar fields rather than UTC serialization', () => {
    const localCalendarDate = {
      getFullYear: () => 2026,
      getMonth: () => 0,
      getDate: () => 2,
      toISOString: () => '2026-01-01T23:30:00.000Z',
    } as Date

    expect(toLocalDateKey(localCalendarDate)).toBe('2026-01-02')
    expect(isCalendarDateKey('2024-02-29')).toBe(true)
    expect(isCalendarDateKey('2025-02-29')).toBe(false)
    expect(isCalendarDateKey('2026-13-01')).toBe(false)
  })

  it('enforces finite weight and bounded integer repetitions', () => {
    expect(isValidSetValues(0, 1)).toBe(true)
    expect(isValidSetValues(MAX_WEIGHT_KG, MAX_REPS)).toBe(true)
    expect(isValidSetValues(Number.NaN, 10)).toBe(false)
    expect(isValidSetValues(Number.POSITIVE_INFINITY, 10)).toBe(false)
    expect(isValidSetValues(MAX_WEIGHT_KG + 0.01, 10)).toBe(false)
    expect(isValidSetValues(20, 3.5)).toBe(false)
    expect(isValidSetValues(20, 0)).toBe(false)
    expect(isValidSetValues(20, MAX_REPS + 1)).toBe(false)
    expect(isValidSetValues('20', 10)).toBe(false)
  })

  it('only accepts and canonicalizes HTTP(S) video URLs', () => {
    expect(normalizeVideoUrl(' https://example.com/demo?q=1 ')).toBe('https://example.com/demo?q=1')
    expect(normalizeVideoUrl('http://example.com')).toBe('http://example.com/')
    expect(normalizeVideoUrl('')).toBe('')
    expect(normalizeVideoUrl(undefined)).toBe('')
    expect(normalizeVideoUrl('javascript:alert(1)')).toBeNull()
    expect(normalizeVideoUrl('data:text/html,test')).toBeNull()
    expect(normalizeVideoUrl('/relative/video')).toBeNull()
  })

  it('migrates mixed v1/v2 history and groups all sessions from the same day', () => {
    const mixedData = [
      {
        id: 'category-1',
        name: ' Push ',
        exercises: [
          {
            id: 'exercise-1',
            name: 'Bankdrücken',
            videoUrl: 'https://example.com/video',
            history: [
              { date: '2026-07-12', weight: 60, reps: 8, sets: 2 },
              {
                date: '2026-07-13',
                sets: [{ id: 'new-set', weight: 62.5, reps: 6 }],
              },
              {
                date: '2026-07-12',
                sets: [{ id: 'existing-set', weight: 65, reps: 5 }],
              },
              { date: '2026-07-12', weight: 55, reps: 10, sets: 1 },
            ],
          },
        ],
      },
    ]

    const result = parseGymData(JSON.stringify(mixedData))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.migrated).toBe(true)
    expect(result.needsRewrite).toBe(true)
    expect(result.categories[0]?.name).toBe('Push')
    const history = result.categories[0]?.exercises[0]?.history
    expect(history?.map((session) => session.date)).toEqual(['2026-07-13', '2026-07-12'])
    expect(history?.[0]?.sets).toEqual([{ id: 'new-set', weight: 62.5, reps: 6 }])
    expect(history?.[1]?.sets).toHaveLength(4)
    expect(history?.[1]?.sets.map((set) => [set.weight, set.reps])).toEqual([
      [60, 8],
      [60, 8],
      [65, 5],
      [55, 10],
    ])
    expect(new Set(history?.[1]?.sets.map((set) => set.id)).size).toBe(4)
  })

  it('sanitizes malformed nested records without rejecting the usable data', () => {
    const result = parseGymData(
      JSON.stringify({
        app: 'GymBuddie',
        version: GYM_DATA_VERSION,
        categories: [
          {
            id: 'same-id',
            name: 'Valid',
            exercises: [
              {
                id: 'exercise',
                name: 'Valid exercise',
                videoUrl: 'file:///private/video',
                history: [
                  {
                    date: '2026-07-13',
                    sets: [
                      { id: 'duplicate-set', weight: 20, reps: 10 },
                      { id: 'duplicate-set', weight: 25, reps: 8 },
                      { id: 'invalid-number', weight: '30', reps: 8 },
                    ],
                  },
                  { date: '2026-02-30', sets: [] },
                ],
              },
            ],
          },
          { id: 'same-id', name: 'Second', exercises: [] },
          { id: 'bad', name: '   ', exercises: [] },
          null,
        ],
      }),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.categories).toHaveLength(2)
    expect(result.categories[0]?.id).not.toBe(result.categories[1]?.id)
    const exercise = result.categories[0]?.exercises[0]
    expect(exercise?.videoUrl).toBeUndefined()
    expect(exercise?.history).toHaveLength(1)
    expect(exercise?.history[0]?.sets).toHaveLength(2)
    expect(exercise?.history[0]?.sets[0]?.id).not.toBe(exercise?.history[0]?.sets[1]?.id)
    expect(result.issues.length).toBeGreaterThan(0)
    expect(result.needsRewrite).toBe(true)
  })

  it('rejects malformed JSON, unsupported versions, and invalid roots', () => {
    expect(parseGymData('{').ok).toBe(false)
    expect(parseGymData(JSON.stringify({ version: 999, categories: [] }))).toMatchObject({
      ok: false,
    })
    expect(
      parseGymData(JSON.stringify({ version: GYM_DATA_VERSION, categories: {} })),
    ).toMatchObject({ ok: false })
    expect(parseGymData('null').ok).toBe(false)
  })

  it('round-trips the versioned export envelope', () => {
    const exported = createGymDataExport([], '2026-07-13T10:00:00.000Z')
    expect(exported).toMatchObject({
      app: 'GymBuddie',
      version: GYM_DATA_VERSION,
      updatedAt: '2026-07-13T10:00:00.000Z',
      exportedAt: '2026-07-13T10:00:00.000Z',
      categories: [],
    })
    expect(parseGymData(JSON.stringify(exported))).toMatchObject({
      ok: true,
      categories: [],
    })
  })
})
