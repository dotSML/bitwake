import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, normalize, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const canonicalRoot = resolve(fileURLToPath(new URL('../dist/standalone/', import.meta.url)))
const port = Number(process.env.BITWAKE_PWA_UPGRADE_PORT ?? '4192')

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('BITWAKE_PWA_UPGRADE_PORT must be a valid TCP port')
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

const legacyHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="manifest" href="./manifest.webmanifest">
    <title>NeoTorrent</title>
  </head>
  <body>
    <main><h1>NeoTorrent</h1><p id="legacy-ready">Installed PWA fixture</p></main>
    <script>
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
      }
    </script>
  </body>
</html>
`

const legacyManifest = JSON.stringify({
  id: './',
  name: 'NeoTorrent',
  short_name: 'NeoTorrent',
  display: 'standalone',
  start_url: './',
  scope: './',
  icons: [
    {
      src: 'icons/neotorrent.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any maskable'
    }
  ]
})

const legacyIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-label="NeoTorrent">
  <rect width="128" height="128" rx="28" fill="#2563eb"/>
  <path d="M29 35h17l36 49V35h17v58H82L46 44v49H29z" fill="#fff"/>
</svg>
`

// Match Workbox's default cache identity for this unchanged origin and scope.
// The canonical worker will update the entries in place during activation.
const legacyWorker = `const CACHE_NAME = 'workbox-precache-v2-http://127.0.0.1:${port}/'
const PRECACHE = ['./', './manifest.webmanifest', './icons/neotorrent.svg']
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)))
})
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin) return
  event.respondWith(caches.match(event.request, { ignoreSearch: true }).then((cached) => cached || fetch(event.request)))
})
`

let canonical = false

function send(response, status, body = '', headers = {}) {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers
  })
  response.end(body)
}

async function serveCanonicalFile(request, response, pathname) {
  const requestedPath = pathname === '/' ? 'index.html' : pathname
  const normalizedPath = normalize(requestedPath).replace(/^[/\\]+/u, '')
  let file = resolve(canonicalRoot, normalizedPath)
  if (file !== canonicalRoot && !file.startsWith(`${canonicalRoot}${sep}`)) {
    send(response, 400, 'Invalid path')
    return
  }

  let metadata
  try {
    metadata = await stat(file)
  } catch {
    if (extname(normalizedPath)) {
      send(response, 404, 'Not found')
      return
    }
    file = resolve(canonicalRoot, 'index.html')
    metadata = await stat(file)
  }
  if (!metadata.isFile()) {
    send(response, 404, 'Not found')
    return
  }

  const extension = extname(file)
  const noStore =
    file.endsWith(`${sep}index.html`) ||
    file.endsWith(`${sep}sw.js`) ||
    file.endsWith(`${sep}manifest.webmanifest`)
  response.writeHead(200, {
    'Cache-Control': noStore ? 'no-store' : 'public, max-age=31536000, immutable',
    'Content-Length': metadata.size,
    'Content-Type': contentTypes.get(extension) ?? 'application/octet-stream',
    ...(file.endsWith(`${sep}sw.js`) ? { 'Service-Worker-Allowed': '/' } : {})
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(file).pipe(response)
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    send(response, 400, 'Missing URL')
    return
  }
  const url = new URL(request.url, `http://${request.headers.host ?? `127.0.0.1:${port}`}`)

  if (request.method === 'POST' && url.pathname === '/__bitwake_upgrade__/legacy') {
    canonical = false
    send(response, 204)
    return
  }
  if (request.method === 'POST' && url.pathname === '/__bitwake_upgrade__/canonical') {
    canonical = true
    send(response, 204)
    return
  }
  if (url.pathname === '/__bitwake_upgrade__/state') {
    send(response, 200, canonical ? 'canonical' : 'legacy')
    return
  }

  if (canonical) {
    await serveCanonicalFile(request, response, url.pathname)
    return
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    send(response, 200, legacyHtml, { 'Content-Type': 'text/html; charset=utf-8' })
    return
  }
  if (url.pathname === '/manifest.webmanifest') {
    send(response, 200, legacyManifest, {
      'Content-Type': 'application/manifest+json; charset=utf-8'
    })
    return
  }
  if (url.pathname === '/sw.js') {
    send(response, 200, legacyWorker, {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/'
    })
    return
  }
  if (url.pathname === '/icons/neotorrent.svg') {
    send(response, 200, legacyIcon, { 'Content-Type': 'image/svg+xml; charset=utf-8' })
    return
  }
  send(response, 404, 'Not found')
})

server.listen(port, '127.0.0.1', () => {
  console.log(`PWA rename upgrade fixture listening on http://127.0.0.1:${port}`)
})

function close() {
  server.close((error) => {
    if (error) throw error
    process.exit(0)
  })
}

process.once('SIGINT', close)
process.once('SIGTERM', close)
