import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const allowedProductionLicenses = new Set([
  '0BSD',
  'Apache-2.0',
  'BSD',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MIT',
  '(MPL-2.0 OR Apache-2.0)'
])

function safeRepository(packageMetadata) {
  const repository = packageMetadata.repository
  const value = typeof repository === 'string' ? repository : repository?.url
  const normalized = typeof value === 'string' ? value.replace(/^git\+/u, '') : ''
  if (/^https:\/\//u.test(normalized)) return normalized.replace(/\.git$/u, '')
  return typeof packageMetadata.homepage === 'string' &&
    /^https:\/\//u.test(packageMetadata.homepage)
    ? packageMetadata.homepage
    : 'Not declared'
}

async function directLicenseFile(packagePath) {
  const candidates = (await readdir(packagePath))
    .filter((name) => /^(?:license|licence|copying)(?:[._-].*)?$/iu.test(name))
    .sort((left, right) => left.localeCompare(right, 'en'))
  return candidates.length > 0 ? resolve(packagePath, candidates[0]) : null
}

async function licenseFile(packagePath, packageMetadata) {
  const direct = await directLicenseFile(packagePath)
  if (direct) return { path: direct, source: null }

  // Some npm tarballs omit a monorepo-root license. Prefer another installed
  // version of the exact same package and declared license instead of silently
  // dropping the dependency from the notice.
  const virtualStore = resolve(repositoryRoot, 'node_modules', '.pnpm')
  for (const entry of (await readdir(virtualStore)).sort((left, right) =>
    left.localeCompare(right, 'en')
  )) {
    const candidatePackage = resolve(virtualStore, entry, 'node_modules', packageMetadata.name)
    if (candidatePackage === packagePath) continue
    try {
      const candidateMetadata = JSON.parse(
        await readFile(resolve(candidatePackage, 'package.json'), 'utf8')
      )
      if (
        candidateMetadata.name !== packageMetadata.name ||
        candidateMetadata.license !== packageMetadata.license
      ) {
        continue
      }
      const candidateLicense = await directLicenseFile(candidatePackage)
      if (candidateLicense) {
        return {
          path: candidateLicense,
          source: `${candidateMetadata.name}@${candidateMetadata.version}`
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  throw new Error(
    `Production dependency ${packageMetadata.name}@${packageMetadata.version} has no reviewable license file`
  )
}

async function installedPackage(path) {
  const packagePath = await realpath(path)
  const nodeModulesRoot = resolve(repositoryRoot, 'node_modules') + sep
  if (!packagePath.startsWith(nodeModulesRoot)) {
    throw new Error(`Production dependency resolves outside node_modules: ${path}`)
  }
  const packageMetadata = JSON.parse(await readFile(resolve(packagePath, 'package.json'), 'utf8'))
  if (typeof packageMetadata.name !== 'string' || typeof packageMetadata.version !== 'string') {
    throw new Error(`Production dependency at ${packagePath} has invalid package metadata`)
  }
  return { packageMetadata, packagePath }
}

async function resolveDependency(parentPath, name, optional) {
  const packageParent = dirname(parentPath)
  const dependencyRoot = basename(packageParent).startsWith('@')
    ? dirname(packageParent)
    : packageParent
  for (const candidate of [
    resolve(dependencyRoot, name),
    resolve(repositoryRoot, 'node_modules', name)
  ]) {
    try {
      return await installedPackage(candidate)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  if (optional) return null
  throw new Error(
    `Installed production dependency ${name} could not be resolved from ${parentPath}`
  )
}

async function productionDependencies() {
  const rootMetadata = JSON.parse(await readFile(resolve(repositoryRoot, 'package.json'), 'utf8'))
  const queue = []
  for (const name of Object.keys(rootMetadata.dependencies ?? {}).sort()) {
    queue.push(await installedPackage(resolve(repositoryRoot, 'node_modules', name)))
  }

  const dependencies = []
  const seenPaths = new Set()
  while (queue.length > 0) {
    const dependency = queue.shift()
    if (seenPaths.has(dependency.packagePath)) continue
    seenPaths.add(dependency.packagePath)
    dependencies.push(dependency)

    const required = dependency.packageMetadata.dependencies ?? {}
    const optional = dependency.packageMetadata.optionalDependencies ?? {}
    for (const name of [...new Set([...Object.keys(required), ...Object.keys(optional)])].sort()) {
      const child = await resolveDependency(
        dependency.packagePath,
        name,
        !Object.prototype.hasOwnProperty.call(required, name)
      )
      if (child) queue.push(child)
    }
  }
  return dependencies
}

export async function generateThirdPartyNotices(outputPath) {
  const dependencies = []
  const seen = new Set()
  for (const { packageMetadata, packagePath } of await productionDependencies()) {
    const license = packageMetadata.license
    if (!allowedProductionLicenses.has(license)) {
      throw new Error(
        `Production dependency ${packageMetadata.name}@${packageMetadata.version} has an unreviewed license: ${license}`
      )
    }
    const key = `${packageMetadata.name}@${packageMetadata.version}`
    if (seen.has(key)) continue
    seen.add(key)
    dependencies.push({ key, license, packageMetadata, packagePath })
  }
  dependencies.sort(({ key: left }, { key: right }) => left.localeCompare(right, 'en'))

  if (dependencies.length === 0) throw new Error('No production dependencies were inventoried')
  const sections = []
  for (const { key, license, packageMetadata, packagePath } of dependencies) {
    const licenseSource = await licenseFile(packagePath, packageMetadata)
    const licenseText = (await readFile(licenseSource.path, 'utf8')).replaceAll('\r\n', '\n').trim()
    if (!licenseText || licenseText.length > 1024 * 1024) {
      throw new Error(`Production dependency ${key} has a missing or oversized license text`)
    }
    sections.push(
      [
        `## ${key}`,
        `Declared license: ${license}`,
        `Source: ${safeRepository(packageMetadata)}`,
        ...(licenseSource.source
          ? [
              `License text supplied by installed ${licenseSource.source} (same package and license).`
            ]
          : []),
        '',
        licenseText
      ].join('\n')
    )
  }

  const contents = [
    'NeoTorrent third-party notices',
    '',
    'This deterministic inventory covers the complete pnpm production dependency graph.',
    'NeoTorrent itself is governed by the repository license, when one is present.',
    '',
    ...sections,
    ''
  ].join('\n')
  if (outputPath) {
    const resolvedOutput = resolve(repositoryRoot, outputPath)
    await mkdir(dirname(resolvedOutput), { recursive: true })
    await writeFile(resolvedOutput, contents)
  }
  return { count: dependencies.length, contents }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const outputIndex = process.argv.indexOf('--output')
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined
  if (outputIndex >= 0 && !output) throw new Error('--output requires a path')
  const result = await generateThirdPartyNotices(output)
  console.log(
    `Reviewed ${result.count} production dependency licenses${
      output ? `; wrote ${relative(repositoryRoot, resolve(repositoryRoot, output))}` : ''
    }.`
  )
}
