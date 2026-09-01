import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { URL } from 'node:url'
import { chromium } from '@playwright/test'

const baseUrl = process.env.BITWAKE_TEST_URL ?? process.env.NEOTORRENT_TEST_URL
const initialPassword = process.env.QBITTORRENT_TEST_PASSWORD
const qbitContainer = process.env.QBITTORRENT_TEST_CONTAINER
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH
const expectedApplicationVersion = process.env.QBITTORRENT_EXPECTED_VERSION ?? 'v5.2.3'
const expectedWebApiVersion = process.env.QBITTORRENT_EXPECTED_WEBAPI_VERSION ?? '2.15.1'

if (!baseUrl || !initialPassword || !qbitContainer) {
  throw new Error(
    'BITWAKE_TEST_URL (or deprecated NEOTORRENT_TEST_URL), QBITTORRENT_TEST_PASSWORD, and QBITTORRENT_TEST_CONTAINER are required'
  )
}

function invariant(condition, message) {
  if (!condition) throw new Error(message)
}

function bencodedString(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value)
  return Buffer.concat([Buffer.from(`${bytes.length}:`), bytes])
}

function createTorrent(name, content) {
  const pieceHash = createHash('sha1').update(content).digest()
  const info = Buffer.concat([
    Buffer.from('d6:lengthi'),
    Buffer.from(String(content.length)),
    Buffer.from('e4:name'),
    bencodedString(name),
    Buffer.from('12:piece lengthi16384e6:pieces'),
    bencodedString(pieceHash),
    Buffer.from('e')
  ])
  return {
    bytes: Buffer.concat([Buffer.from('d4:info'), info, Buffer.from('e')]),
    hash: createHash('sha1').update(info).digest('hex'),
    name,
    files: [{ path: name, content }]
  }
}

function createMultiFileTorrent(name, files) {
  invariant(files.length > 1, 'a multi-file fixture needs at least two files')
  const pieceLength = 16_384
  const content = Buffer.concat(files.map((file) => file.content))
  const pieceHashes = []
  for (let offset = 0; offset < content.length; offset += pieceLength) {
    pieceHashes.push(
      createHash('sha1')
        .update(content.subarray(offset, offset + pieceLength))
        .digest()
    )
  }
  const encodedFiles = files.map((file) => {
    const segments = file.path.split('/')
    invariant(
      segments.length > 0 &&
        segments.every((segment) => segment && segment !== '.' && segment !== '..'),
      `unsafe generated torrent fixture path ${file.path}`
    )
    return Buffer.concat([
      Buffer.from('d6:lengthi'),
      Buffer.from(String(file.content.length)),
      Buffer.from('e4:pathl'),
      ...segments.map(bencodedString),
      Buffer.from('ee')
    ])
  })
  const info = Buffer.concat([
    Buffer.from('d5:filesl'),
    ...encodedFiles,
    Buffer.from('e4:name'),
    bencodedString(name),
    Buffer.from(`12:piece lengthi${pieceLength}e6:pieces`),
    bencodedString(Buffer.concat(pieceHashes)),
    Buffer.from('e')
  ])
  return {
    bytes: Buffer.concat([Buffer.from('d4:info'), info, Buffer.from('e')]),
    hash: createHash('sha1').update(info).digest('hex'),
    name,
    files
  }
}

async function waitFor(description, operation, timeout = 20_000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const result = await operation()
      if (result) return result
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError}` : ''}`)
}

async function api(page, path, options = {}) {
  const result = await page.evaluate(
    async ({ path: requestPath, method, form, torrent }) => {
      const init = { method: method ?? 'GET', credentials: 'include' }
      if (form) {
        init.headers = { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }
        init.body = new URLSearchParams(form)
      } else if (torrent) {
        const binary = Uint8Array.from(atob(torrent.base64), (character) => character.charCodeAt(0))
        const body = new FormData()
        body.append(
          'torrents',
          new File([binary], torrent.filename, { type: 'application/x-bittorrent' })
        )
        for (const [key, value] of Object.entries(torrent.fields)) body.append(key, value)
        init.body = body
      }
      const response = await fetch(`api/v2/${requestPath}`, init)
      return {
        status: response.status,
        text: await response.text(),
        contentType: response.headers.get('content-type')
      }
    },
    {
      path,
      method: options.method,
      form: options.form,
      torrent: options.torrent
    }
  )

  const accepted = options.accepted ?? [200]
  invariant(
    accepted.includes(result.status),
    `${options.method ?? 'GET'} ${path} returned ${result.status}: ${result.text}`
  )
  return result
}

async function apiJson(page, path) {
  const response = await api(page, path)
  return JSON.parse(response.text)
}

async function form(page, path, values, accepted) {
  return api(page, path, {
    method: 'POST',
    form: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, String(value)])),
    accepted
  })
}

function webSeedParameter(url) {
  return new URL(url).href.replace(/%([0-9a-f]{2})/giu, '%25$1')
}

function trackerUrlsParameter(urls) {
  return urls.map((url) => encodeURIComponent(new URL(url).href)).join('|')
}

function versionAtLeast(actual, minimum) {
  const numeric = (value) => {
    const match = String(value).match(/^(?:v)?(\d+)\.(\d+)(?:\.(\d+))?/iu)
    return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)] : null
  }
  const left = numeric(actual)
  const right = numeric(minimum)
  if (!left || !right) return false
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index]
  }
  return true
}

async function torrentInfo(page, hash) {
  const torrents = await apiJson(page, `torrents/info?hashes=${encodeURIComponent(hash)}`)
  return torrents[0]
}

async function addTorrent(page, torrent, options = {}) {
  await api(page, 'torrents/add', {
    method: 'POST',
    torrent: {
      base64: torrent.bytes.toString('base64'),
      filename: `${torrent.name}.torrent`,
      fields: {
        savepath: options.savePath ?? '/downloads',
        stopped: 'true',
        ...(options.contentLayout ? { contentLayout: options.contentLayout } : {})
      }
    }
  })
}

function docker(...args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

function fileExistsInQbittorrent(path) {
  try {
    execFileSync('docker', ['exec', qbitContainer, 'test', '-f', path], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function normalizedPath(path) {
  return path === '/' ? path : path.replace(/\/+$/u, '')
}

function installLegalFile(directory, remotePath, content) {
  const localName = createHash('sha256').update(remotePath).digest('hex')
  const localPath = join(directory, localName)
  writeFileSync(localPath, content)
  // qBittorrent drops to UID/GID 1000 inside the official container. Creating
  // fixture directories through an ordinary `docker exec` leaves them owned by
  // root, so libtorrent can accept a rename request and then fail it
  // asynchronously when it touches the parent directory.
  docker('exec', '--user', '1000:1000', qbitContainer, 'mkdir', '-p', dirname(remotePath))
  docker('cp', localPath, `${qbitContainer}:${remotePath}`)
  docker('exec', qbitContainer, 'chown', '1000:1000', remotePath)
}

function assertLegalFile(remotePath, expectedContent) {
  invariant(fileExistsInQbittorrent(remotePath), `expected generated fixture at ${remotePath}`)
  const actualContent = execFileSync('docker', ['exec', qbitContainer, 'cat', remotePath])
  invariant(
    actualContent.equals(expectedContent),
    `generated fixture data changed at ${remotePath}`
  )
}

async function verifyTorrentData(page, torrent, remotePaths) {
  invariant(
    remotePaths.length === torrent.files.length,
    `fixture path count mismatch for ${torrent.name}`
  )
  torrent.files.forEach((file, index) => {
    const remotePath = remotePaths[index]
    invariant(remotePath, `missing fixture path ${index} for ${torrent.name}`)
    installLegalFile(fixtureDirectory, remotePath, file.content)
    assertLegalFile(remotePath, file.content)
  })

  await form(page, 'torrents/recheck', { hashes: torrent.hash })
  const verified = await waitFor(
    `qBittorrent to validate ${torrent.name}`,
    async () => {
      const info = await torrentInfo(page, torrent.hash)
      if (!info || info.progress !== 1) return false
      const files = await apiJson(page, `torrents/files?hash=${torrent.hash}`)
      return files.length === torrent.files.length && files.every((file) => file.progress === 1)
        ? { info, files }
        : false
    },
    30_000
  )
  invariant(
    verified.files.reduce((total, file) => total + file.size, 0) ===
      torrent.files.reduce((total, file) => total + file.content.length, 0),
    `qBittorrent reported an unexpected fixture size for ${torrent.name}`
  )
  return verified.info
}

async function removeTorrent(page, hash, deleteFiles = true) {
  await form(page, 'torrents/delete', { hashes: hash, deleteFiles })
  await waitFor(`torrent ${hash} removal`, async () => !(await torrentInfo(page, hash)))
}

async function exerciseContentLayouts(page) {
  const layouts = ['Original', 'Subfolder', 'NoSubfolder']
  const observations = []

  for (const layout of layouts) {
    const slug = layout.toLowerCase()
    const single = createTorrent(
      `layout-single-${slug}.txt`,
      Buffer.from(`Bitwake qBittorrent ${layout} single-file layout fixture\n`)
    )
    const singleSavePath = `/data/layout/single/${slug}`
    const singleContentPath =
      layout === 'Subfolder'
        ? `${singleSavePath}/${single.name.replace(/\.[^.]+$/u, '')}/${single.name}`
        : `${singleSavePath}/${single.name}`
    await addTorrent(page, single, { savePath: singleSavePath, contentLayout: layout })
    const singleInfo = await waitFor(`${layout} single-file torrent registration`, async () =>
      torrentInfo(page, single.hash)
    )
    invariant(
      normalizedPath(singleInfo.save_path) === singleSavePath,
      `${layout} single-file save_path was ${singleInfo.save_path}, expected ${singleSavePath}`
    )
    invariant(
      normalizedPath(singleInfo.content_path) === singleContentPath,
      `${layout} single-file content_path was ${singleInfo.content_path}, expected ${singleContentPath}`
    )
    await verifyTorrentData(page, single, [singleContentPath])
    observations.push({
      shape: 'single-file',
      layout,
      savePath: normalizedPath(singleInfo.save_path),
      contentPath: normalizedPath(singleInfo.content_path)
    })
    await removeTorrent(page, single.hash)

    const multi = createMultiFileTorrent(`layout-multi-${slug}`, [
      {
        path: 'episode-one.txt',
        content: Buffer.from(`Bitwake qBittorrent ${layout} multi-file fixture one\n`)
      },
      {
        path: 'extras/episode-two.txt',
        content: Buffer.from(`Bitwake qBittorrent ${layout} multi-file fixture two\n`)
      }
    ])
    const multiSavePath = `/data/layout/multi/${slug}`
    const multiContentPath =
      layout === 'NoSubfolder' ? multiSavePath : `${multiSavePath}/${multi.name}`
    await addTorrent(page, multi, { savePath: multiSavePath, contentLayout: layout })
    const multiInfo = await waitFor(`${layout} multi-file torrent registration`, async () =>
      torrentInfo(page, multi.hash)
    )
    invariant(
      normalizedPath(multiInfo.save_path) === multiSavePath,
      `${layout} multi-file save_path was ${multiInfo.save_path}, expected ${multiSavePath}`
    )
    invariant(
      normalizedPath(multiInfo.content_path) === multiContentPath,
      `${layout} multi-file content_path was ${multiInfo.content_path}, expected ${multiContentPath}`
    )
    await verifyTorrentData(
      page,
      multi,
      multi.files.map((file) => `${multiContentPath}/${file.path}`)
    )
    observations.push({
      shape: 'multi-file',
      layout,
      savePath: normalizedPath(multiInfo.save_path),
      contentPath: normalizedPath(multiInfo.content_path)
    })
    await removeTorrent(page, multi.hash)
  }

  return observations
}

function installLegalContent(directory, torrent, content) {
  const localPath = join(directory, torrent.name)
  writeFileSync(localPath, content)
  docker('cp', localPath, `${qbitContainer}:/downloads/${torrent.name}`)
  docker('exec', qbitContainer, 'chown', '1000:1000', `/downloads/${torrent.name}`)
}

function latestTemporaryPassword() {
  const logs = docker('logs', qbitContainer)
  const matches = [
    ...logs.matchAll(/temporary password is provided for this session:\s*([^\s]+)/gi)
  ]
  invariant(matches.length > 0, 'qBittorrent did not log a temporary password after restart')
  return matches.at(-1)[1]
}

const fixtureDirectory = mkdtempSync(join(tmpdir(), 'bitwake-qbit-fixtures-'))
const contentA = Buffer.from('Bitwake legal local integration fixture A\n')
const contentB = Buffer.from('Bitwake legal local integration fixture B\n')
const contentC = Buffer.from('Bitwake legal local active-download fixture\n')
const torrentA = createTorrent('bitwake-keep-content.txt', contentA)
const torrentB = createTorrent('bitwake-delete-content.txt', contentB)
const torrentC = createTorrent('bitwake-active-location.txt', contentC)
const suggestedTvTorrent = createTorrent(
  'Test.Series.2026.S01E01.mkv',
  Buffer.from('Bitwake legal suggested TV episode fixture\n')
)
const suggestedMovieTorrent = createTorrent(
  'Test.Movie.2026.mkv',
  Buffer.from('Bitwake legal suggested movie fixture\n')
)
const manualTvTorrent = createTorrent(
  'Manual.Series.2026.S04E01.mkv',
  Buffer.from('Bitwake legal manually placed TV episode fixture\n')
)
const manualMovieTorrent = createTorrent(
  'Manual.Test.Movie.2026.mkv',
  Buffer.from('Bitwake legal manually placed movie fixture\n')
)
const tvRootWarningTorrent = createTorrent(
  'TV.Root.Warning.S01E01.mkv',
  Buffer.from('Bitwake legal exact TV root warning fixture\n')
)
const moviesRootWarningTorrent = createTorrent(
  'Movies.Root.Warning.2026.mkv',
  Buffer.from('Bitwake legal exact Movies root warning fixture\n')
)
const setLocationTorrent = createTorrent(
  'Set.Location.Series.2026.S02E01.mkv',
  Buffer.from('Bitwake legal Set Location fixture\n')
)
const parityContentTorrent = createMultiFileTorrent('bitwake-parity-content', [
  {
    path: 'Season 01/episode-one.txt',
    content: Buffer.from('Bitwake legal content-rename fixture episode\n')
  },
  {
    path: 'poster.txt',
    content: Buffer.from('Bitwake legal content-rename fixture poster\n')
  }
])
installLegalContent(fixtureDirectory, torrentA, contentA)
installLegalContent(fixtureDirectory, torrentB, contentB)

const browser = await chromium.launch(
  chromePath
    ? { executablePath: chromePath, args: ['--disable-dev-shm-usage'] }
    : { args: ['--disable-dev-shm-usage'] }
)
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  // The role and status assertions below intentionally exercise the English UI.
  locale: 'en-US'
})
const page = await context.newPage()
const pageErrors = []
const apiResponses = []
let documentRequests = 0
page.on('pageerror', (error) => pageErrors.push(error.message))
page.on('response', (response) => {
  if (response.url().includes('/api/v2/')) {
    apiResponses.push({
      method: response.request().method(),
      status: response.status(),
      url: response.url()
    })
  }
})
page.on('request', (request) => {
  if (request.resourceType() === 'document') documentRequests += 1
})
let contentLayoutObservations
let mediaPlacementOperations
let parityEndpointObservations

async function login(password) {
  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  try {
    await page.locator('[data-private-shell]').waitFor({ timeout: 20_000 })
  } catch (error) {
    const alert = await page
      .getByRole('alert')
      .textContent()
      .catch(() => null)
    throw new Error(
      `Login did not reach the private shell: ${JSON.stringify({
        url: page.url(),
        alert,
        cookies: (await context.cookies()).map((cookie) => cookie.name),
        responses: apiResponses.slice(-12),
        pageErrors
      })}`,
      { cause: error }
    )
  }
}

async function exerciseParityEndpoints(webApiVersion) {
  const contentRoot = `/downloads/${parityContentTorrent.name}`
  await addTorrent(page, parityContentTorrent, {
    savePath: '/downloads',
    contentLayout: 'Original'
  })
  await waitFor(`${parityContentTorrent.name} registration`, async () =>
    torrentInfo(page, parityContentTorrent.hash)
  )
  await verifyTorrentData(
    page,
    parityContentTorrent,
    parityContentTorrent.files.map((file) => `${contentRoot}/${file.path}`)
  )

  const reportedFiles = await apiJson(page, `torrents/files?hash=${parityContentTorrent.hash}`)
  invariant(
    Array.isArray(reportedFiles) && reportedFiles.length === parityContentTorrent.files.length,
    `unexpected files response for rename fixture: ${JSON.stringify(reportedFiles)}`
  )
  const sourceFile = reportedFiles.find((file) => file.index === 0)
  const unaffectedFile = reportedFiles.find((file) => file.index === 1)
  invariant(
    typeof sourceFile?.name === 'string' &&
      sourceFile.size === parityContentTorrent.files[0].content.length,
    `qBittorrent did not report the expected source file at index 0: ${JSON.stringify(reportedFiles)}`
  )
  invariant(
    typeof unaffectedFile?.name === 'string' &&
      unaffectedFile.size === parityContentTorrent.files[1].content.length,
    `qBittorrent did not report the expected unaffected file at index 1: ${JSON.stringify(reportedFiles)}`
  )

  const expectedSourceSuffix = parityContentTorrent.files[0].path
  const reportedPrefix = sourceFile.name.slice(0, -expectedSourceSuffix.length)
  invariant(
    sourceFile.name.endsWith(expectedSourceSuffix) &&
      (reportedPrefix === '' || reportedPrefix === `${parityContentTorrent.name}/`),
    `qBittorrent reported an unexpected multifile source path: ${JSON.stringify(sourceFile.name)}`
  )
  invariant(
    unaffectedFile.name === `${reportedPrefix}${parityContentTorrent.files[1].path}`,
    `qBittorrent reported inconsistent multifile roots: ${JSON.stringify(
      reportedFiles.map(({ index, name }) => ({ index, name }))
    )}`
  )

  const sourceParent = sourceFile.name.slice(0, sourceFile.name.lastIndexOf('/'))
  invariant(
    sourceParent.slice(sourceParent.lastIndexOf('/') + 1) === 'Season 01',
    `rename fixture source file had an unexpected parent: ${JSON.stringify(sourceFile.name)}`
  )
  // qBittorrent's rename contract uses the same torrent-relative namespace for
  // both paths. The response file path is therefore the canonical source and
  // its parent (including any multifile root) must be preserved verbatim.
  const renamedFile = `${sourceParent}/episode-renamed.txt`
  await form(page, 'torrents/renameFile', {
    hash: parityContentTorrent.hash,
    oldPath: sourceFile.name,
    newPath: renamedFile
  })
  let observedFilesAfterFileRename = []
  let filesAfterFileRename
  try {
    filesAfterFileRename = await waitFor('file rename endpoint', async () => {
      observedFilesAfterFileRename = await apiJson(
        page,
        `torrents/files?hash=${parityContentTorrent.hash}`
      )
      return observedFilesAfterFileRename.find((file) => file.index === 0)?.name === renamedFile
        ? observedFilesAfterFileRename
        : false
    })
  } catch (cause) {
    throw new Error(
      `renameFile did not converge: ${JSON.stringify({
        oldPath: sourceFile.name,
        newPath: renamedFile,
        reportedFiles: observedFilesAfterFileRename.map(({ index, name }) => ({ index, name })),
        sourceExists: fileExistsInQbittorrent(`${contentRoot}/Season 01/episode-one.txt`),
        destinationExists: fileExistsInQbittorrent(`${contentRoot}/Season 01/episode-renamed.txt`)
      })}`,
      { cause }
    )
  }
  invariant(
    filesAfterFileRename.find((file) => file.index === 1)?.name === unaffectedFile.name,
    `renameFile changed an unrelated fixture path: ${JSON.stringify(filesAfterFileRename)}`
  )
  await waitFor(
    'renamed fixture file on disk',
    async () =>
      fileExistsInQbittorrent(`${contentRoot}/Season 01/episode-renamed.txt`) &&
      !fileExistsInQbittorrent(`${contentRoot}/Season 01/episode-one.txt`)
  )
  assertLegalFile(
    `${contentRoot}/Season 01/episode-renamed.txt`,
    parityContentTorrent.files[0].content
  )
  invariant(
    !fileExistsInQbittorrent(`${contentRoot}/Season 01/episode-one.txt`),
    'renameFile left the original fixture path in place'
  )

  const folderSeparator = sourceParent.lastIndexOf('/')
  const folderParent = folderSeparator >= 0 ? sourceParent.slice(0, folderSeparator) : ''
  const renamedFolder = folderParent ? `${folderParent}/Season One` : 'Season One'
  await form(page, 'torrents/renameFolder', {
    hash: parityContentTorrent.hash,
    oldPath: sourceParent,
    newPath: renamedFolder
  })
  const fileAfterFolderRename = `${renamedFolder}/episode-renamed.txt`
  let observedFilesAfterFolderRename = []
  let filesAfterFolderRename
  try {
    filesAfterFolderRename = await waitFor('folder rename endpoint', async () => {
      observedFilesAfterFolderRename = await apiJson(
        page,
        `torrents/files?hash=${parityContentTorrent.hash}`
      )
      return observedFilesAfterFolderRename.find((file) => file.index === 0)?.name ===
        fileAfterFolderRename
        ? observedFilesAfterFolderRename
        : false
    })
  } catch (cause) {
    throw new Error(
      `renameFolder did not converge: ${JSON.stringify({
        oldPath: sourceParent,
        newPath: renamedFolder,
        reportedFiles: observedFilesAfterFolderRename.map(({ index, name }) => ({ index, name })),
        sourceExists: fileExistsInQbittorrent(`${contentRoot}/Season 01/episode-renamed.txt`),
        destinationExists: fileExistsInQbittorrent(`${contentRoot}/Season One/episode-renamed.txt`)
      })}`,
      { cause }
    )
  }
  invariant(
    filesAfterFolderRename.find((file) => file.index === 1)?.name === unaffectedFile.name,
    `renameFolder changed an unrelated fixture path: ${JSON.stringify(filesAfterFolderRename)}`
  )
  await waitFor(
    'renamed fixture folder on disk',
    async () =>
      fileExistsInQbittorrent(`${contentRoot}/Season One/episode-renamed.txt`) &&
      !fileExistsInQbittorrent(`${contentRoot}/Season 01/episode-renamed.txt`)
  )
  assertLegalFile(
    `${contentRoot}/Season One/episode-renamed.txt`,
    parityContentTorrent.files[0].content
  )
  invariant(
    !fileExistsInQbittorrent(`${contentRoot}/Season 01/episode-renamed.txt`),
    'renameFolder left the original fixture folder in place'
  )
  await form(page, 'torrents/recheck', { hashes: parityContentTorrent.hash })
  await waitFor(
    'renamed fixture to remain valid after recheck',
    async () => {
      const info = await torrentInfo(page, parityContentTorrent.hash)
      const files = await apiJson(page, `torrents/files?hash=${parityContentTorrent.hash}`)
      return info?.progress === 1 && files.every((file) => file.progress === 1)
    },
    30_000
  )

  const peerResponse = await form(page, 'torrents/addPeers', {
    hashes: parityContentTorrent.hash,
    peers: '127.0.0.1:65534'
  })
  const peerResult = JSON.parse(peerResponse.text)[parityContentTorrent.hash]
  invariant(
    Number.isInteger(peerResult?.added) &&
      Number.isInteger(peerResult?.failed) &&
      peerResult.added + peerResult.failed === 1,
    `addPeers returned an unexpected result: ${peerResponse.text}`
  )

  const trackerUrl = 'http://127.0.0.1:65533/announce?token=alpha%2Fbeta&part=1'
  // Web API 2.15.1 returns 204 because addTrackers intentionally has no
  // response result, while Web API 2.11.2 serializes that same success as an
  // empty 200 response. Keep the compatibility allowance local to this
  // bodyless endpoint so JSON-returning actions (such as addPeers) stay strict.
  await form(
    page,
    'torrents/addTrackers',
    {
      hash: parityContentTorrent.hash,
      urls: trackerUrl
    },
    [200, 204]
  )
  await waitFor('tracker registration for selective reannounce', async () => {
    const trackers = await apiJson(page, `torrents/trackers?hash=${parityContentTorrent.hash}`)
    return trackers.some((tracker) => tracker.url === trackerUrl)
  })
  const selectiveTrackerReannounce = versionAtLeast(webApiVersion, '2.11.10')
  if (selectiveTrackerReannounce) {
    await form(
      page,
      'torrents/reannounce',
      {
        hashes: parityContentTorrent.hash,
        urls: trackerUrlsParameter([trackerUrl])
      },
      [200, 204]
    )
  }

  await removeTorrent(page, parityContentTorrent.hash)
  return {
    renameFile: true,
    renameFolder: true,
    addPeers: true,
    selectiveTrackerReannounce
  }
}

function torrentAddRequestCount() {
  return apiResponses.filter((response) => {
    const url = new URL(response.url)
    return response.method === 'POST' && url.pathname.endsWith('/api/v2/torrents/add')
  }).length
}

async function openMediaAdd(torrent) {
  await page.getByRole('button', { name: 'Add torrent', exact: true }).first().click()
  const dialog = page.getByRole('dialog', { name: 'Add torrents' })
  await dialog.waitFor()
  await dialog.locator('#torrent-files').setInputFiles({
    name: `${torrent.name}.torrent`,
    mimeType: 'application/x-bittorrent',
    buffer: torrent.bytes
  })
  await dialog.getByText(`${torrent.name}.torrent`, { exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
  await dialog.locator('.source-plan').waitFor()
  return dialog
}

async function expectPathPreview(dialog, expectedPath) {
  const preview = dialog.getByRole('region', { name: 'Expected media path' })
  await waitFor(`media path preview ${expectedPath}`, async () => {
    const text = await preview.textContent()
    return text?.includes(expectedPath) ? true : false
  })
}

async function acknowledgePlacementWarnings(dialog) {
  const acknowledgements = dialog.getByLabel('I understand and want to use this custom placement.')
  const count = await acknowledgements.count()
  invariant(count > 0, 'the required media-placement acknowledgement was not rendered')
  for (let index = 0; index < count; index += 1) {
    await acknowledgements.nth(index).check()
  }
}

async function finishMediaAdd(dialog, torrent) {
  await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
  await dialog.getByText('Review destinations', { exact: true }).waitFor()
  await dialog.getByLabel('Start immediately').uncheck()
  await dialog.getByRole('button', { name: 'Add torrents', exact: true }).click()
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 })
  return waitFor(`${torrent.name} registration`, async () => torrentInfo(page, torrent.hash))
}

function tagSet(info) {
  return new Set(
    String(info.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)
  )
}

async function verifyMediaTorrent(torrent, expectedSavePath, expectedContentPath, expected) {
  const initialInfo = await waitFor(`${torrent.name} placement`, async () =>
    torrentInfo(page, torrent.hash)
  )
  invariant(
    normalizedPath(initialInfo.save_path) === expectedSavePath,
    `${torrent.name} save_path was ${initialInfo.save_path}, expected ${expectedSavePath}`
  )
  invariant(
    normalizedPath(initialInfo.content_path) === expectedContentPath,
    `${torrent.name} content_path was ${initialInfo.content_path}, expected ${expectedContentPath}`
  )
  invariant(initialInfo.auto_tmm === false, `${torrent.name} unexpectedly enabled Auto TMM`)
  if (expected?.category !== undefined) {
    invariant(
      initialInfo.category === expected.category,
      `${torrent.name} category was ${initialInfo.category}, expected ${expected.category}`
    )
  }
  if (expected?.tags) {
    const actualTags = tagSet(initialInfo)
    for (const tag of expected.tags) {
      invariant(actualTags.has(tag), `${torrent.name} did not receive suggested tag ${tag}`)
    }
  }
  await form(page, 'torrents/stop', { hashes: torrent.hash })
  const verifiedInfo = await verifyTorrentData(page, torrent, [expectedContentPath])
  invariant(verifiedInfo.progress === 1, `${torrent.name} did not remain valid after recheck`)
  return verifiedInfo
}

async function addSuggestedTv() {
  const savePath = '/data/tv-shows/Test Series (2026)/Season 01'
  const contentPath = `${savePath}/${suggestedTvTorrent.name}`
  const dialog = await openMediaAdd(suggestedTvTorrent)
  await dialog.getByRole('radio', { name: /TV show/u }).check()
  await dialog.getByRole('radio', { name: /Suggested folder/u }).check()
  await dialog.getByLabel('Series title').fill('Test Series')
  await dialog.getByLabel(/^Year/u).fill('2026')
  await dialog.getByLabel('Season', { exact: true }).fill('1')
  await expectPathPreview(dialog, savePath)
  await finishMediaAdd(dialog, suggestedTvTorrent)
  await verifyMediaTorrent(suggestedTvTorrent, savePath, contentPath, {
    category: 'TV Shows',
    tags: ['media', 'tv', 'jellyfin']
  })
  invariant(
    !fileExistsInQbittorrent(`${savePath}/Test.Series.2026.S01E01/${suggestedTvTorrent.name}`),
    'suggested TV placement created unintended double nesting'
  )
  return { operation: 'add-suggested-tv', savePath, contentPath, validData: true }
}

async function addSuggestedMovie() {
  const savePath = '/data/movies/Test Movie (2026)'
  const contentPath = `${savePath}/${suggestedMovieTorrent.name}`
  const dialog = await openMediaAdd(suggestedMovieTorrent)
  await dialog.getByRole('radio', { name: /Movie/u }).check()
  await dialog.getByRole('radio', { name: /Suggested folder/u }).check()
  await dialog.getByLabel('Movie title').fill('Test Movie')
  await dialog.getByLabel(/^Year/u).fill('2026')
  await expectPathPreview(dialog, savePath)
  await finishMediaAdd(dialog, suggestedMovieTorrent)
  await verifyMediaTorrent(suggestedMovieTorrent, savePath, contentPath, {
    category: 'Movies',
    tags: ['media', 'movie', 'jellyfin']
  })
  invariant(
    !fileExistsInQbittorrent(`/data/movies/${suggestedMovieTorrent.name}`),
    'suggested movie placement left a loose movie file in the Movies root'
  )
  return { operation: 'add-suggested-movie', savePath, contentPath, validData: true }
}

async function addManualTv() {
  const savePath = '/data/tv-shows/Manually Named Series/Season 04'
  const contentPath = `${savePath}/${manualTvTorrent.name}`
  const dialog = await openMediaAdd(manualTvTorrent)
  await dialog.getByRole('radio', { name: /TV show/u }).check()
  await dialog.getByRole('radio', { name: /Manual path/u }).check()
  await dialog.getByLabel('Manual destination path').fill(savePath)
  await expectPathPreview(dialog, savePath)
  await finishMediaAdd(dialog, manualTvTorrent)
  await verifyMediaTorrent(manualTvTorrent, savePath, contentPath, {
    category: 'TV Shows',
    tags: ['media', 'tv', 'jellyfin']
  })
  return { operation: 'add-manual-tv', savePath, contentPath, validData: true }
}

async function addManualMovieOutsideRoots() {
  const savePath = '/data/manual-review/Test Movie'
  const contentPath = `${savePath}/${manualMovieTorrent.name}`
  const dialog = await openMediaAdd(manualMovieTorrent)
  await dialog.getByRole('radio', { name: /Movie/u }).check()
  await dialog.getByRole('radio', { name: /Manual path/u }).check()
  await dialog.getByLabel('Manual destination path').fill(savePath)
  await expectPathPreview(dialog, savePath)
  const warning = dialog.getByRole('note').filter({
    hasText: 'This destination is outside the configured media libraries.'
  })
  await warning.waitFor()
  invariant(
    (await dialog.getByLabel('I understand and want to use this custom placement.').count()) === 0,
    'the outside-library notice incorrectly required acknowledgement'
  )
  await finishMediaAdd(dialog, manualMovieTorrent)
  await verifyMediaTorrent(manualMovieTorrent, savePath, contentPath, {
    category: 'Movies',
    tags: ['media', 'movie', 'jellyfin']
  })
  return {
    operation: 'add-manual-movie-outside-roots',
    savePath,
    contentPath,
    warning: 'outside configured media libraries',
    acknowledgementRequired: false,
    validData: true
  }
}

async function exerciseExactRootWarning(torrent, kind, root, warningTitle) {
  const contentPath = `${root}/${torrent.name}`
  const requestsBefore = torrentAddRequestCount()
  const dialog = await openMediaAdd(torrent)
  await dialog.getByRole('radio', { name: kind === 'tv' ? /TV show/u : /Movie/u }).check()
  await dialog.getByRole('radio', { name: /Manual path/u }).check()
  await dialog.getByLabel('Manual destination path').fill(root)
  await expectPathPreview(dialog, root)
  await dialog.getByText(warningTitle, { exact: true }).waitFor()

  await dialog.getByRole('button', { name: 'Continue', exact: true }).click()
  await dialog.getByRole('alert').filter({ hasText: 'Review the media destination' }).waitFor()
  invariant(
    torrentAddRequestCount() === requestsBefore && !(await torrentInfo(page, torrent.hash)),
    `${warningTitle} did not gate the torrent before acknowledgement`
  )

  await acknowledgePlacementWarnings(dialog)
  await finishMediaAdd(dialog, torrent)
  await verifyMediaTorrent(torrent, root, contentPath, {
    category: kind === 'tv' ? 'TV Shows' : 'Movies',
    tags: kind === 'tv' ? ['media', 'tv', 'jellyfin'] : ['media', 'movie', 'jellyfin']
  })
  await removeTorrent(page, torrent.hash)
  return {
    operation: kind === 'tv' ? 'acknowledged-exact-tv-root' : 'acknowledged-exact-movies-root',
    savePath: root,
    contentPath,
    blockedBeforeAcknowledgement: true,
    allowedAfterAcknowledgement: true,
    validData: true
  }
}

async function navigateToAllTorrents() {
  const navigation = page.getByRole('navigation', { name: 'Torrent filters' })
  const allTorrents = navigation.getByRole('button', { name: 'All torrents', exact: true })
  try {
    await allTorrents.waitFor({ state: 'visible', timeout: 20_000 })
    await allTorrents.click()
    await page.waitForURL(/#\/torrents$/u, { timeout: 20_000 })
  } catch (cause) {
    const diagnostics = await page
      .evaluate(() => ({
        url: window.location.href,
        title: document.title,
        language: document.documentElement.lang,
        privateShell: Boolean(document.querySelector('[data-private-shell]')),
        sidebar: Boolean(document.querySelector('.sidebar')),
        navigationLabels: [...document.querySelectorAll('nav')].map((element) =>
          element.getAttribute('aria-label')
        )
      }))
      .catch(() => ({ unavailable: true }))
    throw new Error(
      `Could not navigate through the All torrents sidebar control: ${JSON.stringify(diagnostics)}`,
      { cause }
    )
  }
}

async function openSetLocation(torrent) {
  await navigateToAllTorrents()
  const clearSelection = page.getByRole('button', { name: 'Clear selection' })
  if (await clearSelection.count()) await clearSelection.click()
  const filter = page.getByRole('searchbox', { name: 'Filter torrents by name or hash' })
  await filter.fill(torrent.name)
  const row = page
    .getByRole('grid', { name: 'Torrents' })
    .locator('.table-row')
    .filter({ hasText: torrent.name })
  await row.waitFor({ timeout: 20_000 })
  await row.click({ button: 'right', position: { x: 60, y: 18 } })
  const menu = page.getByRole('menu', { name: torrent.name })
  await menu.getByRole('menuitem', { name: 'Set location…' }).click()
  const dialog = page.getByRole('dialog', { name: 'Set torrent location' })
  await dialog.waitFor()
  return dialog
}

async function waitForMovedTorrent(torrent, savePath, contentPath) {
  const info = await waitFor(
    `${torrent.name} move to ${savePath}`,
    async () => {
      const current = await torrentInfo(page, torrent.hash)
      return current &&
        normalizedPath(current.save_path) === savePath &&
        normalizedPath(current.content_path) === contentPath &&
        fileExistsInQbittorrent(contentPath)
        ? current
        : false
    },
    30_000
  )
  assertLegalFile(contentPath, torrent.files[0].content)
  invariant(info.progress === 1, `${torrent.name} became invalid while moving to ${savePath}`)
  invariant(info.auto_tmm === false, `${torrent.name} enabled Auto TMM while moving`)
  return info
}

async function requestSetLocation(dialog) {
  await dialog.getByRole('button', { name: 'Request move' }).click()
  try {
    await dialog.waitFor({ state: 'hidden', timeout: 5_000 })
  } catch (cause) {
    const alerts = await dialog
      .getByRole('alert')
      .allTextContents()
      .catch(() => [])
    throw new Error(`Set Location stayed open after submission: ${JSON.stringify({ alerts })}`, {
      cause
    })
  }
}

async function startMoveCompletionOrderingProbe(hash, target) {
  let targetEvidenceAt = null
  let active = true
  const onResponse = async (response) => {
    if (!active || !response.url().includes('/api/v2/sync/maindata') || !response.ok()) return
    const receivedAt = Date.now()
    try {
      const payload = await response.json()
      if (payload?.torrents?.[hash]?.save_path === target && targetEvidenceAt === null) {
        targetEvidenceAt = receivedAt
      }
    } catch {
      // A later incremental response remains eligible as target-state evidence.
    }
  }
  page.on('response', onResponse)
  await page.evaluate((expectedTarget) => {
    const state = { completionAt: null, observer: null }
    const inspect = () => {
      const completed = [...document.querySelectorAll('.toast')].some((toast) => {
        const text = toast.textContent ?? ''
        return text.includes('Move completed.') && text.includes(expectedTarget)
      })
      if (completed && state.completionAt === null) state.completionAt = Date.now()
    }
    state.observer = new globalThis.MutationObserver(inspect)
    state.observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    globalThis.__bitwakeMoveOrderingProbe = state
    inspect()
  }, target)

  return async () => {
    active = false
    page.off('response', onResponse)
    const completionAt = await page.evaluate(() => {
      const state = globalThis.__bitwakeMoveOrderingProbe
      state?.observer?.disconnect()
      delete globalThis.__bitwakeMoveOrderingProbe
      return state?.completionAt ?? null
    })
    invariant(
      targetEvidenceAt !== null,
      `No maindata target-state evidence was observed for ${target}`
    )
    invariant(completionAt !== null, `No completion notification was observed for ${target}`)
    invariant(
      completionAt >= targetEvidenceAt,
      `Move completion was rendered before qBittorrent target-state evidence for ${target}`
    )
  }
}

async function exerciseSetLocation() {
  const initialSavePath = '/downloads/set-location-source'
  const initialContentPath = `${initialSavePath}/${setLocationTorrent.name}`
  await addTorrent(page, setLocationTorrent, {
    savePath: initialSavePath,
    contentLayout: 'Original'
  })
  await waitFor(`${setLocationTorrent.name} registration`, async () =>
    torrentInfo(page, setLocationTorrent.hash)
  )
  await verifyMediaTorrent(setLocationTorrent, initialSavePath, initialContentPath)

  await navigateToAllTorrents()

  const suggestedSavePath = '/data/tv-shows/Set Location Series (2026)/Season 02'
  const suggestedContentPath = `${suggestedSavePath}/${setLocationTorrent.name}`
  let dialog = await openSetLocation(setLocationTorrent)
  await dialog.getByRole('radio', { name: /TV show/u }).check()
  await dialog.getByRole('radio', { name: /Suggested folder/u }).check()
  await dialog.getByLabel('Series title').fill('Set Location Series')
  await dialog.getByLabel(/^Year/u).fill('2026')
  await dialog.getByLabel('Season', { exact: true }).fill('2')
  await expectPathPreview(dialog, suggestedSavePath)
  let completionToast = page
    .getByRole('status')
    .filter({ hasText: 'Move completed.' })
    .filter({ hasText: suggestedSavePath })
  let completedMessages = await completionToast.count()
  let assertCompletionOrdering = await startMoveCompletionOrderingProbe(
    setLocationTorrent.hash,
    suggestedSavePath
  )
  await requestSetLocation(dialog)
  await page
    .getByText('Move requested. qBittorrent is updating the save location.', { exact: true })
    .waitFor()
  await waitForMovedTorrent(setLocationTorrent, suggestedSavePath, suggestedContentPath)
  await waitFor('Bitwake to report the observed suggested move completion', async () => {
    const count = await completionToast.count()
    return count > completedMessages
  })
  await assertCompletionOrdering()
  await completionToast.getByRole('button', { name: 'Dismiss' }).click()
  await completionToast.waitFor({ state: 'hidden' })

  const manualSavePath = '/data/manual-review/Set Location Series'
  const manualContentPath = `${manualSavePath}/${setLocationTorrent.name}`
  dialog = await openSetLocation(setLocationTorrent)
  await dialog.getByRole('radio', { name: /TV show/u }).check()
  await dialog.getByRole('radio', { name: /Manual path/u }).check()
  await dialog.getByLabel('Manual destination path').fill(manualSavePath)
  await expectPathPreview(dialog, manualSavePath)
  await dialog
    .getByText('This destination is outside the configured media libraries.', { exact: true })
    .waitFor()
  completionToast = page
    .getByRole('status')
    .filter({ hasText: 'Move completed.' })
    .filter({ hasText: manualSavePath })
  completedMessages = await completionToast.count()
  assertCompletionOrdering = await startMoveCompletionOrderingProbe(
    setLocationTorrent.hash,
    manualSavePath
  )
  await requestSetLocation(dialog)
  await waitForMovedTorrent(setLocationTorrent, manualSavePath, manualContentPath)
  await waitFor('Bitwake to report the observed manual move completion', async () => {
    const count = await completionToast.count()
    return count > completedMessages
  })
  await assertCompletionOrdering()
  await removeTorrent(page, setLocationTorrent.hash)
  await page.getByRole('searchbox', { name: 'Filter torrents by name or hash' }).fill('')

  return [
    {
      operation: 'set-location-suggested',
      savePath: suggestedSavePath,
      contentPath: suggestedContentPath,
      completionClaim: 'completed after observed qBittorrent target state',
      validData: true
    },
    {
      operation: 'set-location-manual',
      savePath: manualSavePath,
      contentPath: manualContentPath,
      completionClaim: 'completed after observed qBittorrent target state',
      validData: true
    }
  ]
}

async function exerciseMediaPlacement() {
  const operations = []
  operations.push(await addSuggestedTv())
  operations.push(await addSuggestedMovie())
  operations.push(await addManualTv())
  operations.push(await addManualMovieOutsideRoots())
  operations.push(
    await exerciseExactRootWarning(
      tvRootWarningTorrent,
      'tv',
      '/data/tv-shows',
      'This is the TV library root.'
    )
  )
  operations.push(
    await exerciseExactRootWarning(
      moviesRootWarningTorrent,
      'movie',
      '/data/movies',
      'This is the Movies library root.'
    )
  )
  operations.push(...(await exerciseSetLocation()))

  for (const torrent of [
    suggestedTvTorrent,
    suggestedMovieTorrent,
    manualTvTorrent,
    manualMovieTorrent
  ]) {
    await removeTorrent(page, torrent.hash)
  }
  return operations
}

try {
  await page.goto(`${baseUrl}#/settings`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('heading', { name: 'Sign in to qBittorrent' }).waitFor()
  invariant(documentRequests === 1, 'anonymous startup reloaded the standalone document')

  await page.getByLabel('Username').fill('admin')
  await page.getByLabel('Password', { exact: true }).fill('definitely-wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByRole('alert').waitFor()
  invariant(page.url().includes('#/login'), 'invalid login left the standalone login route')
  invariant(documentRequests === 1, 'invalid login invoked a document reload')

  await login(initialPassword)
  await page.waitForURL(/#\/settings$/, { timeout: 20_000 })
  invariant(
    page.url().includes('#/settings'),
    `authenticated deep link was not restored; current URL is ${page.url()}`
  )
  invariant(documentRequests === 1, 'successful standalone login reloaded the document')

  const applicationVersion = (await api(page, 'app/version')).text
  const webApiVersion = (await api(page, 'app/webapiVersion')).text
  invariant(
    applicationVersion === expectedApplicationVersion,
    `unexpected qBittorrent version ${applicationVersion}; expected ${expectedApplicationVersion}`
  )
  invariant(
    webApiVersion === expectedWebApiVersion,
    `unexpected Web API version ${webApiVersion}; expected ${expectedWebApiVersion}`
  )
  invariant(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'SID' || cookie.name.startsWith('QBT_SID')
    ),
    'valid login did not retain the qBittorrent SID cookie'
  )

  await form(page, 'torrents/createCategory', {
    category: 'TV Shows',
    savePath: '/data/tv-shows'
  })
  await form(page, 'torrents/createCategory', {
    category: 'Movies',
    savePath: '/data/movies'
  })

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-private-shell]').waitFor({ timeout: 20_000 })
  invariant(page.url().includes('#/settings'), 'authenticated refresh did not restore its route')
  await page.waitForTimeout(1_000)
  invariant(documentRequests === 2, 'authenticated refresh entered a reload loop')

  contentLayoutObservations = await exerciseContentLayouts(page)
  mediaPlacementOperations = await exerciseMediaPlacement()
  parityEndpointObservations = await exerciseParityEndpoints(webApiVersion)

  const responsesBeforeIncrementalAdd = apiResponses.length
  const documentsBeforeTorrentNavigation = documentRequests
  await addTorrent(page, torrentA)
  await navigateToAllTorrents()
  await page
    .getByRole('grid', { name: 'Torrents' })
    .getByText(torrentA.name, { exact: true })
    .waitFor({ timeout: 20_000 })
  await waitFor('an incremental maindata response after adding the torrent', async () =>
    apiResponses.slice(responsesBeforeIncrementalAdd).some((response) => {
      const requestUrl = new URL(response.url)
      const rid = requestUrl.searchParams.get('rid')
      return (
        response.status === 200 &&
        requestUrl.pathname.endsWith('/api/v2/sync/maindata') &&
        rid !== null &&
        rid !== '0'
      )
    })
  )
  invariant(
    documentRequests === documentsBeforeTorrentNavigation,
    'client-side navigation to the incrementally synchronized torrent reloaded the document'
  )
  await form(page, 'torrents/start', { hashes: torrentA.hash })
  await form(page, 'torrents/stop', { hashes: torrentA.hash })

  const renamedA = 'bitwake-keep-content-renamed.txt'
  await form(page, 'torrents/rename', { hash: torrentA.hash, name: renamedA })
  await waitFor(
    'torrent rename',
    async () => (await torrentInfo(page, torrentA.hash))?.name === renamedA
  )

  await form(page, 'torrents/createCategory', {
    category: 'integration',
    savePath: '/downloads'
  })
  await form(page, 'torrents/editCategory', {
    category: 'integration',
    savePath: '/downloads/integration',
    downloadPathEnabled: false,
    downloadPath: ''
  })
  await waitFor('category save-path edit', async () => {
    const categories = await apiJson(page, 'torrents/categories')
    return normalizedPath(categories.integration?.savePath) === '/downloads/integration'
  })
  await form(page, 'torrents/editCategory', {
    category: 'integration',
    savePath: '/downloads',
    downloadPathEnabled: false,
    downloadPath: ''
  })
  await form(page, 'torrents/setCategory', {
    hashes: torrentA.hash,
    category: 'integration'
  })
  await form(page, 'torrents/createTags', { tags: 'integration' })
  await form(page, 'torrents/addTags', { hashes: torrentA.hash, tags: 'integration' })
  await waitFor('category and tag assignment', async () => {
    const info = await torrentInfo(page, torrentA.hash)
    return info?.category === 'integration' && info?.tags?.split(', ').includes('integration')
  })

  await form(page, 'torrents/recheck', { hashes: torrentA.hash })
  await form(page, 'torrents/reannounce', { hashes: torrentA.hash }, [200, 204])
  await form(page, 'torrents/filePrio', { hash: torrentA.hash, id: 0, priority: 0 })
  await waitFor('file priority zero', async () => {
    const files = await apiJson(page, `torrents/files?hash=${torrentA.hash}`)
    return files[0]?.priority === 0
  })
  await form(page, 'torrents/filePrio', { hash: torrentA.hash, id: 0, priority: 1 })
  await waitFor('file priority one', async () => {
    const files = await apiJson(page, `torrents/files?hash=${torrentA.hash}`)
    return files[0]?.priority === 1
  })

  if (versionAtLeast(webApiVersion, '2.11.4')) {
    const originalWebSeed = 'https://seed.example.test/files/fixture%20A?token=alpha%2Fbeta&part=1'
    const editedWebSeed = 'https://seed.example.test/files/fixture%20B?token=gamma%2Fdelta&part=2'
    await form(page, 'torrents/addWebSeeds', {
      hash: torrentA.hash,
      urls: webSeedParameter(originalWebSeed)
    })
    const addedWebSeeds = await waitFor('Web Seed add', async () => {
      const seeds = await apiJson(page, `torrents/webseeds?hash=${torrentA.hash}`)
      return seeds.length > 0 ? seeds : false
    })
    invariant(
      addedWebSeeds.some((seed) => new URL(seed.url).href === originalWebSeed),
      `Web Seed encoded components changed after add: ${JSON.stringify(addedWebSeeds)}`
    )
    await form(page, 'torrents/editWebSeed', {
      hash: torrentA.hash,
      origUrl: webSeedParameter(originalWebSeed),
      newUrl: webSeedParameter(editedWebSeed)
    })
    const editedWebSeeds = await waitFor('Web Seed edit', async () => {
      const seeds = await apiJson(page, `torrents/webseeds?hash=${torrentA.hash}`)
      return seeds.some((seed) => new URL(seed.url).href !== originalWebSeed) ? seeds : false
    })
    invariant(
      editedWebSeeds.some((seed) => new URL(seed.url).href === editedWebSeed),
      `Web Seed encoded components changed after edit: ${JSON.stringify(editedWebSeeds)}`
    )
    await form(page, 'torrents/removeWebSeeds', {
      hash: torrentA.hash,
      urls: webSeedParameter(editedWebSeed)
    })
    await waitFor('Web Seed removal', async () => {
      const seeds = await apiJson(page, `torrents/webseeds?hash=${torrentA.hash}`)
      return seeds.length === 0
    })
  }

  await form(page, 'torrents/delete', { hashes: torrentA.hash, deleteFiles: false })
  await waitFor(
    'torrent deletion without files',
    async () => !(await torrentInfo(page, torrentA.hash))
  )
  invariant(
    fileExistsInQbittorrent(`/downloads/${renamedA}`) ||
      fileExistsInQbittorrent(`/downloads/${torrentA.name}`),
    'deleteFiles=false removed the legal test content'
  )

  await addTorrent(page, torrentC)
  await form(page, 'torrents/start', { hashes: torrentC.hash })
  await waitFor('the location fixture to enter an active download state', async () => {
    const info = await torrentInfo(page, torrentC.hash)
    return ['downloading', 'stalledDL', 'forcedDL', 'metaDL'].includes(info?.state) ? info : false
  })
  const activeLocation = '/downloads/active-location'
  await form(page, 'torrents/setLocation', {
    hashes: torrentC.hash,
    location: activeLocation
  })
  await waitFor('active-download save-location update', async () => {
    const info = await torrentInfo(page, torrentC.hash)
    return info?.save_path?.replace(/\/+$/u, '') === activeLocation && info.auto_tmm === false
  })
  await form(page, 'torrents/stop', { hashes: torrentC.hash })
  await form(page, 'torrents/delete', { hashes: torrentC.hash, deleteFiles: true })
  await waitFor(
    'active-location fixture cleanup',
    async () => !(await torrentInfo(page, torrentC.hash))
  )

  await addTorrent(page, torrentB)
  await page
    .getByRole('grid', { name: 'Torrents' })
    .getByText(torrentB.name, { exact: true })
    .waitFor({ timeout: 20_000 })
  await form(page, 'torrents/delete', { hashes: torrentB.hash, deleteFiles: true })
  await waitFor(
    'torrent deletion with files',
    async () => !(await torrentInfo(page, torrentB.hash))
  )
  await waitFor(
    'deleteFiles=true content removal',
    async () => !fileExistsInQbittorrent(`/downloads/${torrentB.name}`),
    10_000
  )

  await page.getByRole('button', { name: 'Log out' }).click()
  await page.getByRole('heading', { name: 'Sign in to qBittorrent' }).waitFor()
  invariant(documentRequests === 2, 'standalone logout reloaded the document')

  await login(initialPassword)
  await page.evaluate(async () => {
    await fetch('api/v2/auth/logout', { method: 'POST', credentials: 'include' })
  })
  await page.getByRole('heading', { name: 'Sign in to qBittorrent' }).waitFor({ timeout: 20_000 })
  invariant(documentRequests === 2, 'standalone session expiry reloaded the document')

  await login(initialPassword)
  docker('stop', '--time', '60', qbitContainer)
  invariant((await fetch(`${baseUrl}healthz`)).status === 200, 'healthz depended on qBittorrent')
  invariant((await fetch(`${baseUrl}readyz`)).status === 200, 'readyz depended on qBittorrent')
  invariant(
    (await fetch(`${baseUrl}api/v2/app/version`)).status === 502,
    'proxy did not expose outage'
  )
  await page
    .getByText('Connection lost. Showing the last good data while Bitwake reconnects.')
    .waitFor({
      timeout: 20_000
    })

  docker('start', qbitContainer)
  await waitFor(
    'qBittorrent restart',
    async () => {
      const status = (await fetch(`${baseUrl}api/v2/app/version`)).status
      return status !== 502 && status !== 504
    },
    30_000
  )
  await page.getByRole('heading', { name: 'Sign in to qBittorrent' }).waitFor({ timeout: 30_000 })
  await login(latestTemporaryPassword())
  invariant(documentRequests === 2, 'qBittorrent recovery reloaded the standalone document')
  invariant(pageErrors.length === 0, `browser page errors: ${JSON.stringify(pageErrors)}`)

  console.log(
    JSON.stringify(
      {
        qBittorrent: applicationVersion,
        webApi: webApiVersion,
        standalone: {
          anonymousStartup: true,
          invalidLogin: true,
          login: true,
          deepLinkRestore: true,
          authenticatedRefresh: true,
          logout: true,
          sessionExpiry: true,
          reloadLoop: false
        },
        mutations: [
          'add multipart torrent through incremental maindata rendering',
          'validate Original/Subfolder/NoSubfolder with generated single-file data',
          'validate Original/Subfolder/NoSubfolder with generated multi-file data',
          'start',
          'stop',
          'set location while downloading',
          'rename',
          'rename file and folder content',
          'add peer endpoint',
          'category assignment',
          'category save-path edit',
          'tag assignment',
          'recheck',
          'reannounce',
          ...(parityEndpointObservations?.selectiveTrackerReannounce
            ? ['selective tracker reannounce']
            : ['selective tracker reannounce skipped below Web API 2.11.10']),
          'file priority 0 -> 1',
          ...(versionAtLeast(webApiVersion, '2.11.4')
            ? ['Web Seed add/list/edit/remove']
            : ['Web Seed management skipped below Web API 2.11.4']),
          'delete without files',
          'delete with files'
        ],
        contentLayoutOperationCount: contentLayoutObservations.length,
        contentLayoutObservations,
        mediaPlacementOperationCount: mediaPlacementOperations.length,
        mediaPlacementOperations,
        parityEndpointObservations,
        qBittorrentRestartRecovery: true,
        pageErrors
      },
      null,
      2
    )
  )
} finally {
  await browser.close()
  rmSync(fixtureDirectory, { recursive: true, force: true })
}
