import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

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
  await expect(page.getByRole('status')).toBeVisible()

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
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

  await expect(page.getByText('Satz gespeichert.')).toBeVisible()
  await page.getByRole('button', { name: /Trainingshistorie/ }).click()
  await expect(page.getByText('62.5 kg × 8 Wdh.')).toBeVisible()

  const pageWidth = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))
  expect(pageWidth).toEqual({ clientWidth: 320, scrollWidth: 320 })

  const accessibilityScanResults = await new AxeBuilder({ page }).analyze()
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
  await page.getByRole('button', { name: /Trainingshistorie/ }).click()
  await expect(page.getByText('60 kg × 8 Wdh.')).toHaveCount(3)

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
