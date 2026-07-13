import { access, readFile, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'

const dist = resolve('dist')
const requiredFiles = ['index.html', 'manifest.webmanifest', 'sw.js']

for (const file of requiredFiles) {
  const path = resolve(dist, file)
  await access(path, constants.R_OK)

  if ((await stat(path)).size === 0) {
    throw new Error(`Expected ${file} to be non-empty`)
  }
}

const workboxFiles = (await readdir(dist)).filter(
  (file) => file.startsWith('workbox-') && file.endsWith('.js'),
)

if (workboxFiles.length === 0) {
  throw new Error('No generated workbox-*.js file found in dist')
}

const indexHtml = await readFile(resolve(dist, 'index.html'), 'utf8')
if (!/<link[^>]+rel=["']manifest["']/i.test(indexHtml)) {
  throw new Error('The production HTML does not link to the web app manifest')
}

const assetsDirectory = resolve(dist, 'assets')
const applicationScripts = (await readdir(assetsDirectory)).filter((file) => file.endsWith('.js'))
const applicationCode = (
  await Promise.all(
    applicationScripts.map((file) => readFile(resolve(assetsDirectory, file), 'utf8')),
  )
).join('\n')

if (!applicationCode.includes('serviceWorker') || !applicationCode.includes('sw.js')) {
  throw new Error('The production JavaScript does not contain service-worker registration code')
}

console.log(`Verified PWA build artifacts (${workboxFiles.join(', ')})`)
