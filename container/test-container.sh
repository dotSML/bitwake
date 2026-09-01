#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
image=${NEOTORRENT_IMAGE:-neotorrent:test}
node_image='node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'
run_id="neotorrent-contract-$$"
pod_name="$run_id-pod"
upstream_name="$run_id-upstream"
proxy_name="$run_id-proxy"
temporary_directory=$(mktemp -d)

cleanup() {
  docker rm -f "$proxy_name" "$upstream_name" "$pod_name" >/dev/null 2>&1 || true
  rm -rf "$temporary_directory"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'container contract failure: %s\n' "$1" >&2
  exit 1
}

assert_status() {
  expected=$1
  url=$2
  actual=$(curl -sS -o "$temporary_directory/response" -w '%{http_code}' "$url")
  [ "$actual" = "$expected" ] || fail "$url returned $actual, expected $expected"
}

docker image inspect "$image" >/dev/null 2>&1 \
  || "$repository_root/container/build-image.sh"

[ "$(docker image inspect --format '{{.Config.User}}' "$image")" = '101:101' ] \
  || fail 'image Config.User is not 101:101'

docker run -d --name "$pod_name" \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=8m \
  -p 127.0.0.1::8081 \
  "$node_image" node -e 'setInterval(() => {}, 60_000)' >/dev/null

docker run -d --name "$upstream_name" \
  --network "container:$pod_name" \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=8m \
  -v "$repository_root/container/tests/upstream.mjs:/upstream.mjs:ro" \
  "$node_image" node /upstream.mjs >/dev/null

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$upstream_name" wget -q -O /dev/null http://127.0.0.1:8080/api/status/200; then
    break
  fi
  [ "$attempt" -lt 10 ] || fail 'deterministic upstream did not start'
  sleep 1
done

docker run -d --name "$proxy_name" \
  --network "container:$pod_name" \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -e QBITTORRENT_URL=http://127.0.0.1:8080 \
  -e MAX_UPLOAD_SIZE=1k \
  -e PROXY_CONNECT_TIMEOUT=1s \
  -e PROXY_READ_TIMEOUT=1s \
  -e PROXY_SEND_TIMEOUT=1s \
  "$image" >/dev/null

host_port=$(docker port "$pod_name" 8081/tcp | sed -n '1s/.*://p')
[ -n "$host_port" ] || fail 'could not discover published test port'
base_url="http://127.0.0.1:$host_port"

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$base_url/readyz" >/dev/null 2>&1; then
    break
  fi
  [ "$attempt" -lt 10 ] || {
    docker logs "$proxy_name" >&2
    fail 'NeoTorrent did not become ready'
  }
  sleep 1
done

[ "$(docker exec "$proxy_name" id -u)" = '101' ] || fail 'runtime UID is not 101'
[ "$(docker exec "$proxy_name" id -g)" = '101' ] || fail 'runtime GID is not 101'
[ "$(docker inspect --format '{{.HostConfig.ReadonlyRootfs}}' "$proxy_name")" = 'true' ] \
  || fail 'root filesystem is not read-only'
docker inspect --format '{{json .HostConfig.CapDrop}}' "$proxy_name" | grep -q 'ALL' \
  || fail 'capabilities were not dropped'
docker exec "$proxy_name" sh -c 'touch /tmp/neotorrent-write-test && rm /tmp/neotorrent-write-test' \
  || fail '/tmp is not writable'
if docker exec "$proxy_name" sh -c 'touch /etc/neotorrent-must-fail' >/dev/null 2>&1; then
  fail 'read-only root filesystem accepted a write outside /tmp'
fi
if docker run --rm --entrypoint sh "$image" -c 'command -v node' >/dev/null 2>&1; then
  fail 'final image contains a Node.js runtime'
fi
docker run --rm --entrypoint sh "$image" -c \
  'test ! -e /app/src && test ! -e /usr/share/nginx/html/mockServiceWorker.js && ! find /usr/share/nginx/html -name "*.map" -print -quit | grep -q .'

assert_status 200 "$base_url/healthz"
assert_status 200 "$base_url/readyz"
curl -fsS "$base_url/" | grep -q '<div id="app"></div>' || fail 'SPA index did not load'
curl -fsSI "$base_url/" | grep -qi "content-security-policy: .*script-src 'self'" \
  || fail 'compatible CSP header is missing'

headers="$temporary_directory/headers"
curl -sS -D "$headers" -o "$temporary_directory/get" \
  -H 'Host: torrent.example.test:8443' \
  -H 'X-Forwarded-Proto: https' \
  -H 'X-Forwarded-For: 203.0.113.66' \
  -H 'Origin: https://torrent.example.test:8443' \
  -H 'Referer: https://torrent.example.test:8443/' \
  "$base_url/api/echo?alpha=a%20b&encoded=%252F"
grep -q '^GET /api/echo?alpha=a%20b&encoded=%252F$' "$temporary_directory/get" \
  || fail 'GET method or query string changed'
grep -qi '^x-upstream-host: torrent.example.test' "$headers" || fail 'external Host was not preserved'
grep -qi '^x-upstream-forwarded-host: torrent.example.test:8443' "$headers" \
  || fail 'X-Forwarded-Host was not preserved'
grep -qi '^x-upstream-forwarded-proto: https' "$headers" \
  || fail 'incoming forwarded scheme was not preserved'
grep -qi '^x-upstream-forwarded-for: ' "$headers" \
  || fail 'X-Forwarded-For was not set by the proxy'
if grep -qi '^x-upstream-forwarded-for: .*203\.0\.113\.66' "$headers"; then
  fail 'caller-supplied X-Forwarded-For reached the trusted upstream'
fi
grep -qi '^x-upstream-origin: https://torrent.example.test:8443' "$headers" \
  || fail 'Origin was not preserved'
grep -qi '^x-upstream-referer: https://torrent.example.test:8443/' "$headers" \
  || fail 'Referer was not preserved'
[ "$(grep -ci '^cache-control:' "$headers")" = '1' ] \
  || fail 'API response contained conflicting Cache-Control headers'
grep -qi '^cache-control: no-store' "$headers" \
  || fail 'API response was not marked no-store'

form='hashes=abc%2Fdef&urls=https%3A%2F%2Fseed.example%2Fa%253Fb%3D1'
[ "$(curl -fsS -X POST -H 'Content-Type: application/x-www-form-urlencoded' --data "$form" "$base_url/api/echo")" = "$form" ] \
  || fail 'URL-encoded form body changed'

printf 'legal local multipart fixture\n' > "$temporary_directory/upload.txt"
curl -fsS -X POST \
  -F 'torrents=@'$temporary_directory'/upload.txt;type=application/x-bittorrent' \
  -F 'category=local test' \
  "$base_url/api/echo" > "$temporary_directory/multipart"
grep -q 'legal local multipart fixture' "$temporary_directory/multipart" \
  || fail 'multipart file body changed'
grep -q 'name="category"' "$temporary_directory/multipart" \
  || fail 'multipart field metadata changed'
grep -q 'local test' "$temporary_directory/multipart" || fail 'multipart field value changed'

for status in 200 202 204 401 403 409; do
  assert_status "$status" "$base_url/api/status/$status"
  if [ "$status" = '204' ]; then
    [ ! -s "$temporary_directory/response" ] || fail 'HTTP 204 response gained a body'
  fi
done

curl -sS -D "$headers" -o /dev/null \
  -H 'Cookie: SID=browser-cookie; theme=dark' "$base_url/api/cookie"
grep -qi '^x-upstream-cookie: SID=browser-cookie; theme=dark' "$headers" \
  || fail 'request Cookie was not forwarded'
grep -qi '^set-cookie: SID=proxy-contract; Path=/; HttpOnly; SameSite=Strict' "$headers" \
  || fail 'Set-Cookie was not forwarded'

curl -fsS -D "$headers" -o "$temporary_directory/download" "$base_url/api/download"
grep -qi '^content-type: application/octet-stream' "$headers" || fail 'blob MIME type changed'
grep -qi '^content-disposition: attachment; filename="neotorrent-test.txt"' "$headers" \
  || fail 'Content-Disposition changed'
[ "$(cat "$temporary_directory/download")" = 'legal local test download' ] \
  || fail 'download body changed'

assert_status 404 "$base_url/api"
! grep -q '<div id="app"></div>' "$temporary_directory/response" \
  || fail 'missing /api route fell back to the SPA'
assert_status 404 "$base_url/api/not-found"
grep -q 'upstream-not-found' "$temporary_directory/response" \
  || fail 'upstream 404 response was intercepted'

head -c 2048 /dev/zero > "$temporary_directory/too-large.bin"
actual=$(curl -sS -o /dev/null -w '%{http_code}' -X POST \
  --data-binary "@$temporary_directory/too-large.bin" "$base_url/api/echo")
[ "$actual" = '413' ] || fail "oversized upload returned $actual instead of 413"

actual=$(curl -sS -o /dev/null -w '%{http_code}' "$base_url/api/delay?ms=1500")
[ "$actual" = '504' ] || fail "upstream timeout returned $actual instead of 504"

docker kill --signal USR1 "$upstream_name" >/dev/null
sleep 1
assert_status 200 "$base_url/healthz"
assert_status 200 "$base_url/readyz"
actual=$(curl -sS -o /dev/null -w '%{http_code}' "$base_url/api/status/200")
[ "$actual" = '502' ] || fail "unavailable upstream returned $actual instead of 502"
docker kill --signal USR2 "$upstream_name" >/dev/null
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "$base_url/api/status/200" >/dev/null 2>&1; then
    break
  fi
  [ "$attempt" -lt 10 ] || fail 'proxy did not recover after upstream restart'
  sleep 1
done

invalid_log="$temporary_directory/invalid.log"
if docker run --rm -e 'QBITTORRENT_URL=http://user:secret@example.test:8080' "$image" \
  >"$invalid_log" 2>&1; then
  fail 'embedded-credential upstream unexpectedly started'
fi
grep -q 'must not contain embedded credentials' "$invalid_log" \
  || fail 'invalid upstream error was not clear'

if docker run --rm \
  -e 'QBITTORRENT_URL=http://127.0.0.1:8080' \
  -e 'PROXY_SSL_VERIFY=maybe' \
  "$image" >"$invalid_log" 2>&1; then
  fail 'invalid TLS verification policy unexpectedly started'
fi
grep -q 'PROXY_SSL_VERIFY must be on or off' "$invalid_log" \
  || fail 'invalid TLS verification policy error was not clear'

docker run --rm --read-only --tmpfs /tmp:rw,noexec,nosuid,size=8m \
  -e 'QBITTORRENT_URL=https://127.0.0.1:8080' \
  "$image" sh -c \
  "grep -q 'proxy_ssl_verify on;' /tmp/nginx.conf && grep -q 'proxy_ssl_server_name on;' /tmp/nginx.conf" \
  || fail 'HTTPS upstream did not enable certificate verification and SNI by default'

if docker run --rm -e 'QBITTORRENT_URL=http://127.0.0.1:65536' "$image" \
  >"$invalid_log" 2>&1; then
  fail 'out-of-range upstream port unexpectedly started'
fi
grep -q 'QBITTORRENT_URL port must be an integer from 1 through 65535' "$invalid_log" \
  || fail 'out-of-range upstream port error was not clear'

printf 'container contract tests passed (deterministic upstream and localhost sidecar topology)\n'
