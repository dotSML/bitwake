import { cp, mkdir, readdir, readFile, rename, rm, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
const stage = join(dist, 'alt-stage')
const output = join(dist, 'alt-webui')
const archive = join(dist, 'qbittorrent-modern-webui.zip')

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

run('corepack', ['pnpm', 'exec', 'vite', 'build', '--mode', 'alt-public'])
run('corepack', ['pnpm', 'exec', 'vite', 'build', '--mode', 'alt-private'])

await mkdir(output, { recursive: true })
await cp(join(stage, 'public'), join(output, 'public'), { recursive: true })
await cp(join(stage, 'private'), join(output, 'private'), { recursive: true })
await rename(join(output, 'public', 'public-entry.html'), join(output, 'public', 'index.html'))
await rename(join(output, 'private', 'private-entry.html'), join(output, 'private', 'index.html'))

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

const files = await walk(output)
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

run('zip', ['-q', '-r', archive, '.'], output)
await rm(stage, { recursive: true, force: true })

console.log(`Alternative WebUI: ${output}`)
console.log(`Distributable archive: ${archive}`)
