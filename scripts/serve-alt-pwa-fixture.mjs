import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, join, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const root = resolve(fileURLToPath(new URL('../dist/alt-webui/', import.meta.url)))
const publicRoot = join(root, 'public')
const privateRoot = join(root, 'private')
const port = Number(
  process.env.BITWAKE_ALT_PWA_PORT ?? process.env.NEOTORRENT_ALT_PWA_PORT ?? '4191'
)
const sessionCookie = 'SID=alternative-pwa-fixture'

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('BITWAKE_ALT_PWA_PORT must be a valid TCP port')
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
])

function isAuthenticated(request) {
  return (request.headers.cookie ?? '')
    .split(';')
    .map((value) => value.trim())
    .includes(sessionCookie)
}

function send(response, status, body = '', headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers
  })
  response.end(body)
}

function sendJson(response, value) {
  send(response, 200, JSON.stringify(value), {
    'Content-Type': 'application/json; charset=utf-8'
  })
}

async function serveFile(request, response, directory, relativePath, options = {}) {
  const normalizedPath = normalize(relativePath).replace(/^[/\\]+/u, '')
  const file = resolve(directory, normalizedPath)
  if (file !== directory && !file.startsWith(`${directory}${sep}`)) {
    send(response, 400, 'Invalid path')
    return
  }

  try {
    const metadata = await stat(file)
    if (!metadata.isFile()) throw new Error('Not a file')
    response.writeHead(200, {
      'Cache-Control': options.noStore ? 'no-store' : 'public, max-age=31536000, immutable',
      'Content-Length': metadata.size,
      'Content-Type': contentTypes.get(extname(file)) ?? 'application/octet-stream',
      ...(options.serviceWorker ? { 'Service-Worker-Allowed': '/' } : {}),
      ...(options.varyCookie ? { Vary: 'Cookie' } : {})
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(file).pipe(response)
  } catch {
    send(response, 404, 'Not found')
  }
}

function serveApi(request, response, url) {
  if (url.pathname === '/api/v2/auth/login' && request.method === 'POST') {
    send(response, 200, 'Ok.', {
      'Set-Cookie': `${sessionCookie}; Path=/; HttpOnly; SameSite=Strict`
    })
    return
  }
  if (url.pathname === '/api/v2/auth/logout' && request.method === 'POST') {
    send(response, 200, '', {
      'Set-Cookie': 'SID=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'
    })
    return
  }
  if (!isAuthenticated(request)) {
    send(response, 403, 'Forbidden')
    return
  }
  if (url.pathname === '/api/v2/app/version') {
    send(response, 200, 'v5.2.3')
    return
  }
  if (url.pathname === '/api/v2/app/webapiVersion') {
    send(response, 200, '2.15.1')
    return
  }
  if (url.pathname === '/api/v2/app/buildInfo') {
    sendJson(response, { bitness: 64, platform: 'alternative-pwa-fixture' })
    return
  }
  if (url.pathname === '/api/v2/clientdata/load') {
    sendJson(response, {})
    return
  }
  if (url.pathname === '/api/v2/sync/maindata') {
    const rid = Number(url.searchParams.get('rid') ?? '0')
    sendJson(
      response,
      rid === 0
        ? {
            rid: 1,
            full_update: true,
            torrents: {},
            server_state: { connection_status: 'connected' }
          }
        : { rid: rid + 1, torrents: {} }
    )
    return
  }
  send(response, 204)
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    send(response, 400, 'Missing URL')
    return
  }

  let url
  try {
    url = new URL(request.url, `http://${request.headers.host ?? '127.0.0.1'}`)
  } catch {
    send(response, 400, 'Invalid URL')
    return
  }

  if (url.pathname.startsWith('/api/v2/')) {
    serveApi(request, response, url)
    return
  }
  // Keep the legacy runtime URL live and NetworkOnly during the rename window.
  if (
    url.pathname === '/_bitwake/runtime-config.json' ||
    url.pathname === '/_neotorrent/runtime-config.json'
  ) {
    sendJson(response, {
      mediaPlacement: {
        mode: 'off',
        locked: false,
        tvRoot: '',
        moviesRoot: '',
        browseRoot: '',
        tvCategory: '',
        movieCategory: ''
      }
    })
    return
  }

  const authenticated = isAuthenticated(request)
  if (url.pathname === '/' || url.pathname === '/index.html') {
    await serveFile(request, response, authenticated ? privateRoot : publicRoot, 'index.html', {
      noStore: true,
      varyCookie: true
    })
    return
  }
  if (url.pathname === '/private-entry.html') {
    if (!authenticated) {
      send(response, 403, 'Forbidden')
      return
    }
    await serveFile(request, response, privateRoot, 'private-entry.html', { noStore: true })
    return
  }
  if (url.pathname.startsWith('/app-assets/')) {
    if (!authenticated) {
      send(response, 403, 'Forbidden')
      return
    }
    await serveFile(request, response, privateRoot, url.pathname)
    return
  }
  if (url.pathname.startsWith('/login-assets/')) {
    await serveFile(request, response, publicRoot, url.pathname)
    return
  }
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/sw.js' ||
    /^\/workbox-[^/]+\.js$/u.test(url.pathname)
  ) {
    await serveFile(request, response, publicRoot, url.pathname, {
      serviceWorker: url.pathname === '/sw.js'
    })
    return
  }

  send(response, 404, 'Not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Alternative PWA fixture listening on http://127.0.0.1:${port}`)
})

function close() {
  server.close((error) => {
    if (error) throw error
    process.exit(0)
  })
}

process.once('SIGINT', close)
process.once('SIGTERM', close)
