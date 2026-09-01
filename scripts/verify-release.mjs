import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isReleaseVersion } from './release-version.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fail(message) {
  throw new Error(`Release verification failed: ${message}`)
}

function valueAfter(args, index, option) {
  const value = args[index + 1]
  if (!value || value.startsWith('--')) fail(`${option} requires a value`)
  return value
}

function parseArguments(argv) {
  const options = {
    tag: process.env.RELEASE_TAG || process.env.GITHUB_REF_NAME || '',
    artifact: '',
    outputDirectory: join(repositoryRoot, 'dist', 'release'),
    requireGitTag: false,
    requireLicense: false,
    requireImage: false,
    imageReference: ''
  }

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--') continue
    if (argument === '--tag') {
      options.tag = valueAfter(argv, index, argument)
      index += 1
    } else if (argument === '--artifact') {
      options.artifact = valueAfter(argv, index, argument)
      index += 1
    } else if (argument === '--output-directory') {
      options.outputDirectory = resolve(repositoryRoot, valueAfter(argv, index, argument))
      index += 1
    } else if (argument === '--require-git-tag') {
      options.requireGitTag = true
    } else if (argument === '--require-license') {
      options.requireLicense = true
    } else if (argument === '--require-image') {
      options.requireImage = true
    } else if (argument === '--image-reference') {
      options.imageReference = valueAfter(argv, index, argument)
      index += 1
    } else {
      fail(`unknown argument ${argument}`)
    }
  }
  return options
}

function git(...args) {
  const result = spawnSync('git', args, { cwd: repositoryRoot, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error((result.stderr || result.error?.message || 'git failed').trim())
  }
  return result.stdout.trim()
}

function escapeRegularExpression(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function changelogEntry(changelog, version) {
  const heading = new RegExp(
    `^## \\[${escapeRegularExpression(version)}\\] - (\\d{4}-\\d{2}-\\d{2})$`,
    'mu'
  )
  const match = heading.exec(changelog)
  if (!match) fail(`CHANGELOG.md needs a dated "## [${version}] - YYYY-MM-DD" section`)
  const start = match.index + match[0].length
  const remainder = changelog.slice(start)
  const nextHeading = /^## \[/mu.exec(remainder)
  const body = remainder.slice(0, nextHeading?.index ?? remainder.length).trim()
  if (!body) fail(`CHANGELOG.md section ${version} is empty`)
  return { body, date: match[1] }
}

async function readableFile(path) {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

async function verifyLicense(required, packageMetadata) {
  const candidates = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING']
  const present = []
  for (const candidate of candidates) {
    if (await readableFile(join(repositoryRoot, candidate))) present.push(candidate)
  }
  if (required && present.length === 0) {
    fail(
      'no license file is present; the project owner must choose and add a license before publishing a release'
    )
  }
  if (present.length === 0) {
    console.warn('Release warning: no license file is present; public release remains blocked.')
  }
  const expression = packageMetadata.license
  if (present.length > 0 || required) {
    if (
      typeof expression !== 'string' ||
      expression === 'UNLICENSED' ||
      expression === 'NOASSERTION' ||
      !/^[A-Za-z0-9.+()-]+(?: (?:AND|OR|WITH) [A-Za-z0-9.+()-]+)*$/u.test(expression)
    ) {
      fail('package.json needs a reviewed SPDX license expression matching the repository license')
    }
  }
  return { expression: typeof expression === 'string' ? expression : 'UNLICENSED', files: present }
}

function verifyImageReference(options) {
  if (!options.imageReference) {
    if (options.requireImage) fail('an immutable container image reference is required')
    return null
  }
  if (!/^ghcr\.io\/dotsml\/neotorrent@sha256:[0-9a-f]{64}$/u.test(options.imageReference)) {
    fail('container image reference must be the NeoTorrent GHCR image pinned by a sha256 digest')
  }
  return options.imageReference
}

function verifyTagAtHead(tag) {
  let taggedCommit
  try {
    taggedCommit = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`)
  } catch {
    fail(`Git tag ${tag} does not exist locally`)
  }
  const head = git('rev-parse', 'HEAD')
  if (taggedCommit !== head) fail(`Git tag ${tag} points to ${taggedCommit}, not HEAD ${head}`)
}

async function archiveEntries(artifact) {
  const bytes = await readFile(artifact)
  const minimumEndRecordSize = 22
  if (bytes.length < minimumEndRecordSize) fail('release archive is too small to be a ZIP file')
  const firstPossibleEndRecord = Math.max(0, bytes.length - 65_557)
  let endRecordOffset = -1
  for (
    let offset = bytes.length - minimumEndRecordSize;
    offset >= firstPossibleEndRecord;
    offset -= 1
  ) {
    if (bytes.readUInt32LE(offset) === 0x06054b50) {
      endRecordOffset = offset
      break
    }
  }
  if (endRecordOffset < 0) fail('release archive has no ZIP end-of-central-directory record')

  const entryCount = bytes.readUInt16LE(endRecordOffset + 10)
  const directorySize = bytes.readUInt32LE(endRecordOffset + 12)
  const directoryOffset = bytes.readUInt32LE(endRecordOffset + 16)
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    fail('ZIP64 release archives are not supported')
  }
  if (directoryOffset + directorySize > endRecordOffset) {
    fail('release archive central directory points outside the file')
  }

  const entries = []
  let offset = directoryOffset
  for (let index = 0; index < entryCount; index += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) {
      fail(`release archive central entry ${index} has an invalid signature`)
    }
    const flags = bytes.readUInt16LE(offset + 8)
    if ((flags & 0x1) !== 0) fail('release archive must not contain encrypted entries')
    const fileNameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const entryEnd = offset + 46 + fileNameLength + extraLength + commentLength
    if (entryEnd > directoryOffset + directorySize) {
      fail(`release archive central entry ${index} is truncated`)
    }
    const fileName = bytes.subarray(offset + 46, offset + 46 + fileNameLength).toString('utf8')
    if (fileName.includes('\u0000')) fail('release archive contains a NUL byte in an entry name')
    entries.push(fileName)
    offset = entryEnd
  }
  if (offset !== directoryOffset + directorySize) {
    fail('release archive central directory size does not match its entries')
  }
  return entries
}

async function sha256(path) {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex')
}

async function verifyAndDescribeArtifact(
  options,
  version,
  tag,
  changelog,
  license,
  imageReference
) {
  const artifact = resolve(repositoryRoot, options.artifact)
  const expectedName = `neotorrent-alt-webui-v${version}.zip`
  if (basename(artifact) !== expectedName) {
    fail(`release archive must be named ${expectedName}, received ${basename(artifact)}`)
  }
  const artifactStat = await stat(artifact).catch(() => null)
  if (!artifactStat?.isFile() || artifactStat.size === 0)
    fail(`release archive is missing: ${artifact}`)

  const entries = await archiveEntries(artifact)
  const uniqueEntries = new Set(entries)
  const allowedRootMetadata = new Set([
    'LICENSE',
    'LICENSE.md',
    'LICENSE.txt',
    'LICENCE',
    'COPYING',
    'NOTICE',
    'NOTICE.md',
    'NOTICE.txt',
    'THIRD_PARTY_NOTICES.txt'
  ])
  if (uniqueEntries.size !== entries.length) fail('release archive contains duplicate paths')
  for (const entry of entries) {
    if (entry.startsWith('/') || entry.split('/').includes('..')) {
      fail(`release archive contains an unsafe path: ${entry}`)
    }
    if (
      !entry.startsWith('public/') &&
      !entry.startsWith('private/') &&
      !allowedRootMetadata.has(entry)
    ) {
      fail(`release archive contains an unexpected top-level path: ${entry}`)
    }
    if (entry.endsWith('.map') || entry.endsWith('/mockServiceWorker.js')) {
      fail(`release archive contains a development-only file: ${entry}`)
    }
  }
  for (const required of [
    'public/index.html',
    'private/index.html',
    'public/manifest.webmanifest',
    'public/sw.js',
    'THIRD_PARTY_NOTICES.txt'
  ]) {
    if (!uniqueEntries.has(required)) fail(`release archive is missing ${required}`)
  }
  for (const licenseFile of license.files) {
    if (!uniqueEntries.has(licenseFile)) {
      fail(`release archive is missing repository license file ${licenseFile}`)
    }
  }

  const artifactDigest = await sha256(artifact)
  const revision = git('rev-parse', 'HEAD')
  const metadata = {
    schemaVersion: 2,
    name: 'NeoTorrent Alternative WebUI',
    version,
    tag,
    revision,
    artifact: expectedName,
    artifactSizeBytes: artifactStat.size,
    sha256: artifactDigest,
    licenseExpression: license.expression,
    licenseFiles: license.files,
    thirdPartyNotices: 'THIRD_PARTY_NOTICES.txt',
    image: imageReference
  }
  await mkdir(options.outputDirectory, { recursive: true })
  const metadataPath = join(options.outputDirectory, 'release-metadata.json')
  const notesPath = join(options.outputDirectory, 'release-notes.md')
  const checksumsPath = join(options.outputDirectory, 'SHA256SUMS')
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
  await writeFile(
    notesPath,
    `# NeoTorrent ${tag}\n\n${changelog.body}\n\nContainer: ${imageReference ?? 'not included in this verification'}\n`
  )
  const metadataDigest = await sha256(metadataPath)
  const notesDigest = await sha256(notesPath)
  await writeFile(
    checksumsPath,
    [
      `${artifactDigest}  ${expectedName}`,
      `${metadataDigest}  ${basename(metadataPath)}`,
      `${notesDigest}  ${basename(notesPath)}`,
      ''
    ].join('\n')
  )

  return { artifact, checksumsPath, metadataPath, notesPath }
}

const options = parseArguments(process.argv.slice(2))
const packageMetadata = JSON.parse(await readFile(join(repositoryRoot, 'package.json'), 'utf8'))
const version = packageMetadata.version
if (!isReleaseVersion(version)) {
  fail(
    `package.json version is not release SemVer without build metadata: ${JSON.stringify(version)}`
  )
}
const expectedTag = `v${version}`
if (!options.tag) fail(`a release tag is required; expected ${expectedTag}`)
if (options.tag !== expectedTag) {
  fail(`release tag ${options.tag} does not match package.json version ${version}`)
}
if (options.requireGitTag) verifyTagAtHead(options.tag)

const changelog = changelogEntry(
  await readFile(join(repositoryRoot, 'CHANGELOG.md'), 'utf8'),
  version
)
const license = await verifyLicense(options.requireLicense, packageMetadata)
const imageReference = verifyImageReference(options)
const artifactOutputs = options.artifact
  ? await verifyAndDescribeArtifact(
      options,
      version,
      options.tag,
      changelog,
      license,
      imageReference
    )
  : null

console.log(`Release source verified: ${options.tag} (${changelog.date})`)
if (artifactOutputs) {
  console.log(`Release archive verified: ${artifactOutputs.artifact}`)
  console.log(`Release checksums: ${artifactOutputs.checksumsPath}`)
  console.log(`Release metadata: ${artifactOutputs.metadataPath}`)
  console.log(`Release notes: ${artifactOutputs.notesPath}`)
}
