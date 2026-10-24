import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

async function analyzeAccessibility(page: Page) {
  // Never measure contrast mid-transition, when elements are still partly transparent.
  await page.waitForFunction(
    () => !document.querySelector('[class*="-enter-active"], [class*="-leave-active"]'),
  )
  return new AxeBuilder({ page }).analyze()
}

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    const serviceWorker = (navigator as unknown as { serviceWorker: { ready: Promise<unknown> } })
      .serviceWorker
    await serviceWorker.ready
  })
}

test('loads the application without detectable accessibility violations', async ({ page }) => {
  await page.goto('./')

  await expect(page.getByRole('heading', { level: 1, name: 'GymBuddie' })).toBeVisible()
  await waitForServiceWorker(page)
  await expect(page.getByRole('status')).toContainText('offline verfügbar')

  const accessibilityScanResults = await analyzeAccessibility(page)
  expect(accessibilityScanResults.violations).toEqual([])
})

test('registers its service worker and reloads offline', async ({ context, page }) => {
  await page.goto('./')

  await waitForServiceWorker(page)
  await page.reload()

  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (navigator as unknown as { serviceWorker: { controller: unknown } }).serviceWorker
            .controller,
        ),
      ),
    )
    .toBe(true)

  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { level: 1, name: 'GymBuddie' })).toBeVisible()
})

test('supports the core workout flow at a 320px viewport without overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await page.goto('./')

  await page.getByLabel('Name', { exact: true }).fill('Push')
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await page.getByRole('button', { name: 'Übung hinzufügen' }).click()
  await page.getByLabel('Name der Übung').fill('Bankdrücken')
  await page.getByRole('button', { name: 'Übung speichern' }).click()
  await page.getByLabel('Gewicht (kg)', { exact: true }).fill('62,5')
  await page.getByLabel('Wiederholungen', { exact: true }).fill('8')
  await page.getByRole('button', { name: 'Satz speichern' }).click()

  await expect(page.getByText(/^Satz gespeichert/)).toHaveClass(/sr-only/)
  await expect(page.getByRole('button', { name: /Trainingshistorie/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(page.getByText('62,5 kg × 8 Wdh.', { exact: true })).toBeVisible()

  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(pageWidth).toEqual({ clientWidth: 320, scrollWidth: 320 })

  const accessibilityScanResults = await analyzeAccessibility(page)
  expect(accessibilityScanResults.violations).toEqual([])
})

test('migrates legacy local data and preserves an exact backup', async ({ page }) => {
  await page.goto('./')

  const legacyRaw = await page.evaluate(() => {
    const now = new Date()
    const date = [
      now.getFullYear().toString().padStart(4, '0'),
      (now.getMonth() + 1).toString().padStart(2, '0'),
      now.getDate().toString().padStart(2, '0'),
    ].join('-')
    const raw = JSON.stringify([
      {
        id: 'legacy-category',
        name: 'Push',
        exercises: [
          {
            id: 'legacy-exercise',
            name: 'Bankdrücken',
            history: [{ date, weight: 60, reps: 8, sets: 3 }],
          },
        ],
      },
    ])

    localStorage.removeItem('gymbuddie:data:v2')
    localStorage.setItem('gymData', raw)
    return raw
  })

  await page.reload()

  await expect(page.getByText(/3 Sätze absolviert/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Trainingshistorie/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
  await expect(page.getByText('60 kg × 8 Wdh.', { exact: true })).toHaveCount(3)

  const migratedStorage = await page.evaluate(() => ({
    backup: localStorage.getItem('gymbuddie:backup:gymData:v1'),
    current: JSON.parse(localStorage.getItem('gymbuddie:data:v2') ?? '{}') as {
      version?: number
    },
    legacy: localStorage.getItem('gymData'),
  }))

  expect(migratedStorage.backup).toBe(legacyRaw)
  expect(migratedStorage.current.version).toBe(2)
  expect(migratedStorage.legacy).toBeNull()
})

async function addCategoryWithExercise(page: Page) {
  await page.getByLabel('Name', { exact: true }).fill('Push')
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).click()
  await page.getByRole('button', { name: 'Übung hinzufügen' }).click()
  await page.getByLabel('Name der Übung').fill('Bankdrücken')
  await page.getByRole('button', { name: 'Übung speichern' }).click()
}

async function focusedElement(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement
    if (!element || element === document.body) return 'BODY'
    return element.id || element.getAttribute('aria-label') || element.textContent?.trim() || ''
  })
}

test('keeps keyboard focus on a meaningful control through a keyboard-only flow', async ({
  page,
}) => {
  await page.goto('./')

  await page.getByLabel('Name', { exact: true }).focus()
  await page.keyboard.type('Push')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Übung hinzufügen' }).focus()
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toMatch(/^new-exercise-name-/)

  await page.keyboard.type('Bankdrücken')
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toMatch(/^add-exercise-btn-/)

  await page.getByLabel('Gewicht (kg)', { exact: true }).focus()
  await page.keyboard.type('62,5')
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toMatch(/^reps-/)
  await page.keyboard.type('8')
  await page.keyboard.press('Enter')
  await expect(page.getByText('62,5 kg × 8 Wdh.', { exact: true })).toBeVisible()

  const editButton = page.getByRole('button', { name: /^Satz 1 vom .* bearbeiten$/ })
  await editButton.focus()
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toMatch(/^set-edit-weight-/)
  await page.keyboard.press('Escape')
  expect(await focusedElement(page)).toMatch(/^set-edit-btn-/)

  await page.getByRole('button', { name: /^Satz 1 vom .* löschen$/ }).focus()
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toMatch(/^set-delete-cancel-/)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).not.toBe('BODY')

  await page.getByRole('button', { name: 'Übung Bankdrücken löschen' }).focus()
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toMatch(/^delete-exercise-cancel-/)
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toMatch(/^add-exercise-btn-/)

  await page.getByRole('button', { name: 'Kategorie Push löschen' }).focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toBe('new-category')
})

test('reviews, imports, and restores backups without accessibility violations', async ({
  page,
}, testInfo) => {
  await page.goto('./')
  await addCategoryWithExercise(page)
  await page.getByLabel('Gewicht (kg)', { exact: true }).fill('70')
  await page.getByLabel('Wiederholungen', { exact: true }).fill('5')
  await page.getByRole('button', { name: 'Satz speichern' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Backup exportieren' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^gymbuddie-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const backupPath = testInfo.outputPath('backup.json')
  await download.saveAs(backupPath)

  const wrongFile = testInfo.outputPath('wrong.json')
  await import('node:fs/promises').then((fs) => fs.writeFile(wrongFile, '[]'))
  await page.locator('#import-input').setInputFiles(wrongFile)
  await expect(page.getByRole('alert')).toContainText('kein GymBuddie-Backup')
  await expect(page.getByRole('button', { name: 'Daten ersetzen' })).toHaveCount(0)

  // Change the data so the restore is observable, then import the earlier backup.
  await page.getByRole('button', { name: 'Kategorie Push umbenennen' }).click()
  await page.getByLabel('Neuer Name der Kategorie').fill('Push Day')
  await page.getByRole('button', { name: 'Übung hinzufügen' }).click()
  await page.getByRole('button', { name: 'Übung Bankdrücken bearbeiten' }).click()

  const openFormsScan = await analyzeAccessibility(page)
  expect(openFormsScan.violations).toEqual([])

  await page.getByRole('button', { name: 'Namen speichern' }).click()
  await expect(page.getByRole('heading', { level: 3, name: 'Push Day' })).toBeVisible()

  await page.locator('#import-input').setInputFiles(backupPath)
  const review = page.getByRole('group', { name: /importieren\?/ })
  await expect(review).toContainText('1 Kategorie, 1 Übung, 1 Satz')
  await expect(page.locator('#import-review-heading')).toBeFocused()

  const reviewScan = await analyzeAccessibility(page)
  expect(reviewScan.violations).toEqual([])

  await page.getByRole('button', { name: 'Daten ersetzen' }).click()
  await expect(page.getByText(/^Backup importiert/)).toBeVisible()
  await expect(page.getByRole('heading', { level: 3, name: 'Push', exact: true })).toBeVisible()
  await expect(page.getByText('Datenstand vor dem letzten Import')).toBeVisible()

  await page
    .getByRole('button', { name: 'Datenstand vor dem letzten Import wiederherstellen' })
    .click()
  await page.getByRole('button', { name: 'Daten ersetzen' }).click()
  await expect(page.getByRole('heading', { level: 3, name: 'Push Day' })).toBeVisible()
})

test('opens the app from index.html and unknown paths instead of a blank page', async ({
  page,
}) => {
  await page.goto('./index.html')
  await expect(page.getByRole('heading', { level: 1, name: 'GymBuddie' })).toBeVisible()

  await waitForServiceWorker(page)
  await page.goto('./some/old/link')
  await expect(page.getByRole('heading', { level: 1, name: 'GymBuddie' })).toBeVisible()
})

function daysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return [
    date.getFullYear().toString().padStart(4, '0'),
    (date.getMonth() + 1).toString().padStart(2, '0'),
    date.getDate().toString().padStart(2, '0'),
  ].join('-')
}

async function seedTraining(page: Page) {
  const data = {
    app: 'GymBuddie',
    version: 2,
    updatedAt: new Date().toISOString(),
    categories: [
      {
        id: 'push',
        name: 'Push',
        exercises: [
          {
            id: 'bench',
            name: 'Bankdrücken',
            history: [
              {
                date: daysAgo(3),
                sets: [
                  { id: 'b2', weight: 62.5, reps: 6 },
                  { id: 'b1', weight: 60, reps: 8 },
                ],
              },
              { date: daysAgo(7), sets: [{ id: 'a1', weight: 57.5, reps: 8 }] },
            ],
          },
          { id: 'dips', name: 'Dips', history: [] },
        ],
      },
      { id: 'pull', name: 'Pull', exercises: [{ id: 'rows', name: 'Rudern', history: [] }] },
    ],
  }
  await page.goto('./')
  await page.evaluate((value) => {
    localStorage.setItem('gymbuddie:data:v2', JSON.stringify(value))
    // A recent backup keeps the reminder out of these scenarios.
    localStorage.setItem('gymbuddie:meta:last-export', new Date().toISOString())
  }, data)
  await page.reload()
}

for (const colorScheme of ['light', 'dark'] as const) {
  test(`training features pass axe in ${colorScheme} mode`, async ({ browser }) => {
    const context = await browser.newContext({ colorScheme, reducedMotion: 'reduce' })
    const page = await context.newPage()
    await seedTraining(page)
    expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(
      colorScheme === 'dark',
    )

    await page.locator('#exercise-toggle-bench').click()
    await expect(page.getByText(/Letztes Mal/)).toBeVisible()
    await page.getByRole('button', { name: /^Wiederholen: 60 kg × 8/ }).click()
    await page.getByRole('button', { name: /Gewicht um 2,5 kg erhöhen/ }).click()
    await page.getByRole('button', { name: /Gewicht um 2,5 kg erhöhen/ }).click()
    await page.getByRole('button', { name: 'Satz speichern' }).click()

    await expect(page.getByText(/Neuer Rekord: 65 kg × 8/)).toBeVisible()
    await expect(page.getByRole('timer')).toBeVisible()
    await page.locator('#chart-toggle-bench').click()
    await expect(page.locator('figure svg')).toBeVisible()

    const results = await analyzeAccessibility(page)
    expect(results.violations).toEqual([])
    await context.close()
  })
}

test('runs the rest timer after a set and stops it on request', async ({ page }) => {
  await seedTraining(page)
  await page.locator('#exercise-toggle-dips').click()
  await page.locator('#weight-dips').fill('0')
  await page.locator('#reps-dips').fill('12')
  await page.getByRole('button', { name: 'Satz speichern' }).click()

  const timer = page.getByRole('timer')
  await expect(timer).toHaveText('1:30')
  await page.getByRole('button', { name: 'Pause um 30 Sekunden verlängern' }).click()
  await expect(timer).toHaveText(/^(2:00|1:59)$/)
  await page.getByRole('button', { name: 'Stopp' }).click()
  await expect(page.getByRole('timer')).toHaveCount(0)
})

test('reorders categories by keyboard and keeps the order after a reload', async ({ page }) => {
  await seedTraining(page)
  await page.locator('#reorder-toggle').click()
  await page.getByRole('button', { name: 'Kategorie Pull nach oben' }).focus()
  await page.keyboard.press('Enter')
  expect(await focusedElement(page)).toBe('move-category-up-pull')
  await page.getByRole('button', { name: 'Übung Dips nach oben' }).click()
  await page.locator('#reorder-toggle').click()

  await page.reload()
  await expect(page.getByRole('heading', { level: 3 })).toHaveText(['Pull', 'Push'])
  await expect(page.locator('[id^="exercise-toggle-"]')).toContainText([
    'Rudern',
    'Dips',
    'Bankdrücken',
  ])
})

test('applies the chosen theme before the app loads and remembers open cards', async ({ page }) => {
  await seedTraining(page)
  await page.getByLabel('Dunkel').check()
  await page.locator('#exercise-toggle-bench').click()

  await page.reload()
  // Set by the inline script in index.html, before Vue mounts.
  expect(await page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(true)
  await expect(page.locator('#exercise-toggle-bench')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#exercise-toggle-dips')).toHaveAttribute('aria-expanded', 'false')
})
