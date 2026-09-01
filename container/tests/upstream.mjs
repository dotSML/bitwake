import { Buffer } from 'node:buffer'
import http from 'node:http'
import { URL } from 'node:url'

const port = Number(process.env.PORT ?? 8080)
const keepAlive = globalThis.setInterval(() => {}, 60_000)

const server = http.createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = Buffer.concat(chunks)
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)

  const headers = {
    'cache-control': 'private, no-cache',
    'x-upstream-method': request.method ?? '',
    'x-upstream-url': request.url ?? '',
    'x-upstream-host': request.headers.host ?? '',
    'x-upstream-cookie': request.headers.cookie ?? '',
    'x-upstream-origin': request.headers.origin ?? '',
    'x-upstream-referer': request.headers.referer ?? '',
    'x-upstream-forwarded-for': request.headers['x-forwarded-for'] ?? '',
    'x-upstream-forwarded-host': request.headers['x-forwarded-host'] ?? '',
    'x-upstream-forwarded-proto': request.headers['x-forwarded-proto'] ?? ''
  }

  if (url.pathname === '/api/delay') {
    const delay = Math.min(Number(url.searchParams.get('ms') ?? 0), 10_000)
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  if (url.pathname === '/api/download') {
    response.writeHead(200, {
      ...headers,
      'content-type': 'application/octet-stream',
      'content-disposition': 'attachment; filename="neotorrent-test.txt"'
    })
    response.end('legal local test download\n')
    return
  }

  if (url.pathname === '/api/cookie') {
    response.writeHead(200, {
      ...headers,
      'content-type': 'text/plain',
      'set-cookie': 'SID=proxy-contract; Path=/; HttpOnly; SameSite=Strict'
    })
    response.end(body.length ? body : 'cookie')
    return
  }

  const statusMatch = /^\/api\/status\/(200|202|204|400|401|403|409|500)$/.exec(url.pathname)
  if (statusMatch) {
    const status = Number(statusMatch[1])
    response.writeHead(status, { ...headers, 'content-type': 'text/plain' })
    response.end(status === 204 ? undefined : `status-${status}\n`)
    return
  }

  if (url.pathname === '/api/not-found') {
    response.writeHead(404, { ...headers, 'content-type': 'text/plain' })
    response.end('upstream-not-found\n')
    return
  }

  response.writeHead(200, {
    ...headers,
    'content-type': request.headers['content-type'] ?? 'text/plain'
  })
  response.end(body.length ? body : `${request.method} ${request.url}\n`)
})

server.listen(port, '0.0.0.0', () => {
  process.stdout.write(`deterministic upstream listening on ${port}\n`)
})

const shutdown = () => {
  globalThis.clearInterval(keepAlive)
  server.close(() => process.exit(0))
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('SIGUSR1', () => server.close())
process.on('SIGUSR2', () => {
  if (!server.listening) server.listen(port, '0.0.0.0')
})
