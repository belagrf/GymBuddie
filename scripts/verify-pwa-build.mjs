import { access, readFile, readdir, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import { resolve } from 'node:path'

import { resolveBasePath } from './base-path.ts'

const dist = resolve('dist')
const base = resolveBasePath()
const requiredFiles = ['index.html', 'manifest.webmanifest', 'sw.js']

function fail(message) {
  throw new Error(message)
}

for (const file of requiredFiles) {
  const path = resolve(dist, file)
  await access(path, constants.R_OK)

  if ((await stat(path)).size === 0) {
    fail(`Expected ${file} to be non-empty`)
  }
}

const workboxFiles = (await readdir(dist)).filter(
  (file) => file.startsWith('workbox-') && file.endsWith('.js'),
)

if (workboxFiles.length === 0) {
  fail('No generated workbox-*.js file found in dist')
}

const indexHtml = await readFile(resolve(dist, 'index.html'), 'utf8')
if (!/<link[^>]+rel=["']manifest["']/i.test(indexHtml)) {
  fail('The production HTML does not link to the web app manifest')
}

const manifest = JSON.parse(await readFile(resolve(dist, 'manifest.webmanifest'), 'utf8'))

// The id resolves against the origin, so it must be the app path, not "." or "/".
if (manifest.id !== base) {
  fail(`Expected manifest id ${JSON.stringify(base)}, got ${JSON.stringify(manifest.id)}`)
}
if (manifest.start_url !== '.' && manifest.start_url !== base) {
  fail(`Expected manifest start_url to stay inside ${base}, got ${manifest.start_url}`)
}
if (manifest.scope !== undefined && manifest.scope !== base && manifest.scope !== '.') {
  fail(`Expected manifest scope to be ${base}, got ${manifest.scope}`)
}
if ('orientation' in manifest) {
  fail('The manifest must not lock the screen orientation (WCAG 1.3.4)')
}
if (!manifest.icons?.some((icon) => icon.purpose?.split(' ').includes('maskable'))) {
  fail('The manifest needs a maskable icon')
}

for (const icon of manifest.icons) {
  const file = await readFile(resolve(dist, icon.src))
  if (icon.type !== 'image/png') continue

  // PNG width and height are big-endian integers at bytes 16-23 of the IHDR chunk.
  const size = `${file.readUInt32BE(16)}x${file.readUInt32BE(20)}`
  if (!icon.sizes.split(' ').includes(size)) {
    fail(`Icon ${icon.src} is ${size}, but the manifest declares ${icon.sizes}`)
  }
}

const serviceWorker = await readFile(resolve(dist, 'sw.js'), 'utf8')
if (!serviceWorker.includes('index.html')) {
  fail('The service worker does not precache or fall back to index.html')
}

const assetsDirectory = resolve(dist, 'assets')

// Safari before 16.4 ignores range media queries such as (width >= 40rem), which would silently
// drop every responsive layout on older iPhones. The build target must lower them to min-width.
for (const file of (await readdir(assetsDirectory)).filter((name) => name.endsWith('.css'))) {
  const css = await readFile(resolve(assetsDirectory, file), 'utf8')
  const rangeQuery = /@media[^{]*\((?:width|height)\s*[<>]/.exec(css)
  if (rangeQuery) {
    fail(`${file} contains a range media query (${rangeQuery[0]}), unsupported before Safari 16.4`)
  }
}
const applicationScripts = (await readdir(assetsDirectory)).filter((file) => file.endsWith('.js'))
const applicationCode = (
  await Promise.all(
    applicationScripts.map((file) => readFile(resolve(assetsDirectory, file), 'utf8')),
  )
).join('\n')

if (!applicationCode.includes('serviceWorker') || !applicationCode.includes('sw.js')) {
  fail('The production JavaScript does not contain service-worker registration code')
}

console.log(`Verified PWA build artifacts for ${base} (${workboxFiles.join(', ')})`)
