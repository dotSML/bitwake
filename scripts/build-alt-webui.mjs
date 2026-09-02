import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeDeterministicZip } from './deterministic-zip.mjs'
import { generateThirdPartyNotices } from './generate-third-party-notices.mjs'
import { isReleaseVersion } from './release-version.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const stage = join(dist, 'alt-stage')
const output = join(dist, 'alt-webui')
const packageMetadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const version = packageMetadata.version
if (!isReleaseVersion(version)) {
  throw new Error('package.json must contain a release-compatible semantic version')
}
const archive = join(dist, `bitwake-alt-webui-v${version}.zip`)
const legacyArchive = join(dist, 'qbittorrent-modern-webui.zip')
const distributionMetadataFiles = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'COPYING',
  'NOTICE',
  'NOTICE.md',
  'NOTICE.txt'
]

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`)
}

async function exists(path) {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function walk(directory) {
  const entries = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isSymbolicLink())
      throw new Error(`Alternative WebUI must not contain symlinks: ${path}`)
    if (entry.isDirectory()) entries.push(...(await walk(path)))
    else if (entry.isFile()) entries.push(path)
  }
  return entries
}

async function moveMatching(fromDirectory, toDirectory, predicate) {
  for (const name of await readdir(fromDirectory)) {
    if (!predicate(name)) continue
    const source = join(fromDirectory, name)
    const target = join(toDirectory, name)
    await rm(target, { force: true, recursive: true })
    await rename(source, target)
  }
}

await rm(stage, { recursive: true, force: true })
await rm(output, { recursive: true, force: true })
await rm(archive, { force: true })
await rm(legacyArchive, { force: true })

run('corepack', ['pnpm', 'exec', 'vite', 'build', '--mode', 'alt-public'])
run('corepack', ['pnpm', 'exec', 'vite', 'build', '--mode', 'alt-private'])

await mkdir(output, { recursive: true })
await cp(join(stage, 'public'), join(output, 'public'), { recursive: true })
await cp(join(stage, 'private'), join(output, 'private'), { recursive: true })
await rename(join(output, 'public', 'public-entry.html'), join(output, 'public', 'index.html'))
// Keep the generated private entry at its precached URL and add the filename
// qBittorrent requires. The two files are byte-identical and deterministic.
await cp(join(output, 'private', 'private-entry.html'), join(output, 'private', 'index.html'))
for (const name of distributionMetadataFiles) {
  const source = join(root, name)
  if (await exists(source)) await cp(source, join(output, name))
}
await generateThirdPartyNotices(join(output, 'THIRD_PARTY_NOTICES.txt'))

await moveMatching(
  join(output, 'private'),
  join(output, 'public'),
  (name) =>
    name === 'manifest.webmanifest' ||
    name === 'sw.js' ||
    name === 'sw.js.map' ||
    name.startsWith('workbox-')
)
await rm(join(output, 'private', 'icons'), { recursive: true, force: true })
await rm(join(output, 'public', 'mockServiceWorker.js'), { force: true })
await rm(join(output, 'private', 'mockServiceWorker.js'), { force: true })

for (const required of [
  join(output, 'public', 'index.html'),
  join(output, 'private', 'index.html'),
  join(output, 'public', 'manifest.webmanifest'),
  join(output, 'public', 'sw.js')
]) {
  if (!(await exists(required)))
    throw new Error(`Required Alternative WebUI file is missing: ${required}`)
}

const alternativeWorker = await readFile(join(output, 'public', 'sw.js'), 'utf8')
if (
  /url:["'][^"']+\.html(?:[?"'])/u.test(alternativeWorker) ||
  /NavigationRoute/u.test(alternativeWorker)
) {
  throw new Error(
    'Alternative WebUI service worker must not precache authenticated HTML or install a navigation fallback'
  )
}

const files = (await walk(output)).sort((left, right) => left.localeCompare(right, 'en'))
for (const file of files) {
  const metadata = await stat(file)
  if (file.endsWith('.map')) {
    throw new Error(`Production source map found in ${relative(output, file)}`)
  }
  if (metadata.size >= 10 * 1024 * 1024) {
    throw new Error(`qBittorrent rejects files of 10 MiB or larger: ${relative(output, file)}`)
  }
  if (!/\.(?:html|css|js|webmanifest)$/u.test(file)) continue
  const contents = await readFile(file, 'utf8')
  const forbidden = [
    /(?:src|href)=["']\/(?!\/)/u,
    /(?:src|href)=["'][^"']*\.\.\//u,
    /["'`]\/api\/v2\//u
  ]
  if (forbidden.some((pattern) => pattern.test(contents))) {
    throw new Error(`Root-relative or parent-relative URL found in ${relative(output, file)}`)
  }
}

const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH
let archiveTimestamp = 315_532_800
if (sourceDateEpoch !== undefined) {
  if (!/^\d+$/u.test(sourceDateEpoch)) {
    throw new Error('SOURCE_DATE_EPOCH must be a non-negative integer')
  }
  archiveTimestamp = Number(sourceDateEpoch)
  if (!Number.isSafeInteger(archiveTimestamp) || archiveTimestamp < 315_532_800) {
    throw new Error('SOURCE_DATE_EPOCH must be a safe Unix timestamp on or after 1980-01-01')
  }
}

await writeDeterministicZip({
  archive,
  root: output,
  paths: files.map((file) => relative(output, file)),
  epochSeconds: archiveTimestamp
})
await rm(stage, { recursive: true, force: true })

console.log(`Alternative WebUI: ${output}`)
console.log(`Distributable archive: ${archive}`)
