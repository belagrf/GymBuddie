import { describe, expect, it } from 'vitest'

import {
  GYM_DATA_VERSION,
  MAX_REPS,
  MAX_VIDEO_URL_LENGTH,
  MAX_WEIGHT_KG,
  createGymDataEnvelope,
  createGymDataExport,
  isCalendarDateKey,
  isSafeId,
  isValidSetValues,
  normalizeVideoUrl,
  parseBackupFile,
  parseGymData,
  summarizeCategories,
  toLocalDateKey,
  type Category,
} from '@/domain/gymData'

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'category-1',
    name: 'Push',
    exercises: [
      {
        id: 'exercise-1',
        name: 'Bankdrücken',
        history: [
          {
            date: '2026-07-12',
            sets: [
              { id: 'set-1', weight: 60, reps: 8 },
              { id: 'set-2', weight: 62.5, reps: 6 },
            ],
          },
        ],
      },
    ],
    ...overrides,
  }
}

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
    expect(normalizeVideoUrl(' JavaScript:alert(1)')).toBeNull()
    expect(normalizeVideoUrl('data:text/html,test')).toBeNull()
    expect(normalizeVideoUrl('mailto:coach@example.com')).toBeNull()
    expect(normalizeVideoUrl('localhost:3000')).toBeNull()
    expect(normalizeVideoUrl('/relative/video')).toBeNull()
    expect(normalizeVideoUrl('video')).toBeNull()
    expect(normalizeVideoUrl(42)).toBeNull()
  })

  it('adds https:// to scheme-less links that start with a host name', () => {
    expect(normalizeVideoUrl('youtube.com/watch?v=abc')).toBe('https://youtube.com/watch?v=abc')
    expect(normalizeVideoUrl('www.example.com')).toBe('https://www.example.com/')
    expect(normalizeVideoUrl('youtube.com:443/watch')).toBe('https://youtube.com/watch')
  })

  it('checks the length of the canonical URL, so normalizing twice gives the same result', () => {
    // Each space becomes %20, so this input is short but its canonical form is too long.
    const spaced = `https://example.com/${' x'.repeat(700)}`
    expect(spaced.length).toBeLessThan(MAX_VIDEO_URL_LENGTH)
    expect(normalizeVideoUrl(spaced)).toBeNull()

    const fitting = normalizeVideoUrl(`https://example.com/${'a'.repeat(1_900)}`)
    expect(fitting).not.toBeNull()
    expect(normalizeVideoUrl(fitting)).toBe(fitting)
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
    expect(parseGymData('{')).toMatchObject({ ok: false, reason: 'invalid-json' })
    expect(parseGymData(JSON.stringify({ version: 999, categories: [] }))).toMatchObject({
      ok: false,
      reason: 'unsupported-version',
      error: expect.stringContaining('Datenversion 999'),
    })
    // A foreign version value is never echoed back into the UI.
    const textVersion = parseGymData(JSON.stringify({ version: '<b>evil</b>', categories: [] }))
    expect(textVersion.ok).toBe(false)
    if (!textVersion.ok) expect(textVersion.error).not.toContain('evil')
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

  it('keeps only IDs with a safe charset and regenerates the rest silently', () => {
    expect(isSafeId('8f14e45f-ceea-4e7a-9b1d-1f2e3d4c5b6a')).toBe(true)
    expect(isSafeId('1720000000000')).toBe(true)
    expect(isSafeId('__proto__')).toBe(false)
    expect(isSafeId('constructor')).toBe(false)
    expect(isSafeId('has space')).toBe(false)
    expect(isSafeId('x'.repeat(129))).toBe(false)

    const result = parseGymData(
      JSON.stringify([
        { id: '__proto__', name: 'Push', exercises: [] },
        { id: 'constructor', name: 'Pull', exercises: [] },
        { id: 'with space', name: 'Legs', exercises: [] },
        { id: ' trimmed ', name: 'Core', exercises: [] },
      ]),
    )

    expect(result.ok).toBe(true)
    if (!result.ok) return
    const ids = result.categories.map((entry) => entry.id)
    expect(ids.slice(0, 3).every(isSafeId)).toBe(true)
    expect(ids).not.toContain('__proto__')
    expect(ids).not.toContain('constructor')
    expect(ids[3]).toBe('trimmed')
    expect(result.issues).toEqual([])
    expect(result.needsRewrite).toBe(true)
    expect(Object.prototype).not.toHaveProperty('name')
  })

  it('summarizes categories, exercises, and sets', () => {
    expect(summarizeCategories([category(), category({ id: 'empty', exercises: [] })])).toEqual({
      categories: 2,
      exercises: 1,
      sets: 2,
    })
  })

  describe('backup files', () => {
    it('accepts a GymBuddie backup and reports its summary and export date', () => {
      const exported = createGymDataExport([category()], '2026-07-13T10:00:00.000Z')
      expect(parseBackupFile(JSON.stringify(exported))).toMatchObject({
        ok: true,
        summary: { categories: 1, exercises: 1, sets: 2 },
        exportedAt: '2026-07-13T10:00:00.000Z',
        issues: [],
      })
    })

    it.each([
      ['an empty array', '[]'],
      ['a raw legacy array', JSON.stringify([category()])],
      ['another app with a categories list', JSON.stringify({ app: 'Other', categories: [] })],
      ['an object without an app marker', JSON.stringify({ version: 2, categories: [category()] })],
      ['an empty GymBuddie backup', JSON.stringify(createGymDataEnvelope([]))],
      [
        'a GymBuddie backup without usable categories',
        JSON.stringify({ ...createGymDataEnvelope([]), categories: [{ title: 'x' }, 3] }),
      ],
      ['invalid JSON', '{nope'],
      ['a newer data version', JSON.stringify({ app: 'GymBuddie', version: 3, categories: [] })],
    ])('rejects %s', (_label, contents) => {
      expect(parseBackupFile(contents).ok).toBe(false)
    })

    it('ignores an export date that is not a date', () => {
      const backup = { ...createGymDataEnvelope([category()]), exportedAt: 'yesterday' }
      expect(parseBackupFile(JSON.stringify(backup))).toMatchObject({ ok: true, exportedAt: null })
    })
  })
})
