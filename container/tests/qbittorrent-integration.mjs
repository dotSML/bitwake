import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { URL } from 'node:url'
import { chromium } from '@playwright/test'

const baseUrl = process.env.NEOTORRENT_TEST_URL
const initialPassword = process.env.QBITTORRENT_TEST_PASSWORD
const qbitContainer = process.env.QBITTORRENT_TEST_CONTAINER
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH

if (!baseUrl || !initialPassword || !qbitContainer) {
  throw new Error(
    'NEOTORRENT_TEST_URL, QBITTORRENT_TEST_PASSWORD, and QBITTORRENT_TEST_CONTAINER are required'
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
    name
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

async function torrentInfo(page, hash) {
  const torrents = await apiJson(page, `torrents/info?hashes=${encodeURIComponent(hash)}`)
  return torrents[0]
}

async function addTorrent(page, torrent) {
  await api(page, 'torrents/add', {
    method: 'POST',
    torrent: {
      base64: torrent.bytes.toString('base64'),
      filename: `${torrent.name}.torrent`,
      fields: { savepath: '/downloads', stopped: 'true' }
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

const fixtureDirectory = mkdtempSync(join(tmpdir(), 'neotorrent-qbit-fixtures-'))
const contentA = Buffer.from('NeoTorrent legal local integration fixture A\n')
const contentB = Buffer.from('NeoTorrent legal local integration fixture B\n')
const torrentA = createTorrent('neotorrent-keep-content.txt', contentA)
const torrentB = createTorrent('neotorrent-delete-content.txt', contentB)
installLegalContent(fixtureDirectory, torrentA, contentA)
installLegalContent(fixtureDirectory, torrentB, contentB)

const browser = await chromium.launch(
  chromePath
    ? { executablePath: chromePath, args: ['--disable-dev-shm-usage'] }
    : { args: ['--disable-dev-shm-usage'] }
)
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
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
  invariant(applicationVersion === 'v5.2.3', `unexpected qBittorrent version ${applicationVersion}`)
  invariant(webApiVersion === '2.15.1', `unexpected Web API version ${webApiVersion}`)
  invariant(
    (await context.cookies()).some(
      (cookie) => cookie.name === 'SID' || cookie.name.startsWith('QBT_SID')
    ),
    'valid login did not retain the qBittorrent SID cookie'
  )

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('[data-private-shell]').waitFor({ timeout: 20_000 })
  invariant(page.url().includes('#/settings'), 'authenticated refresh did not restore its route')
  await page.waitForTimeout(1_000)
  invariant(documentRequests === 2, 'authenticated refresh entered a reload loop')

  const responsesBeforeIncrementalAdd = apiResponses.length
  const documentsBeforeTorrentNavigation = documentRequests
  await addTorrent(page, torrentA)
  await page.getByRole('button', { name: 'All torrents' }).click()
  await page.waitForURL(/#\/torrents$/, { timeout: 20_000 })
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

  const renamedA = 'neotorrent-keep-content-renamed.txt'
  await form(page, 'torrents/rename', { hash: torrentA.hash, name: renamedA })
  await waitFor(
    'torrent rename',
    async () => (await torrentInfo(page, torrentA.hash))?.name === renamedA
  )

  await form(page, 'torrents/createCategory', {
    category: 'integration',
    savePath: '/downloads'
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
  await form(page, 'torrents/reannounce', { hashes: torrentA.hash })
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
    .getByText('Connection lost. Showing the last good data while NeoTorrent reconnects.')
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
          'start',
          'stop',
          'rename',
          'category assignment',
          'tag assignment',
          'recheck',
          'reannounce',
          'file priority 0 -> 1',
          'Web Seed add/list/edit/remove',
          'delete without files',
          'delete with files'
        ],
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
