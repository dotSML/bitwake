#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
image=${NEOTORRENT_IMAGE:-neotorrent:test}
qbit_image=${QBITTORRENT_IMAGE:-ghcr.io/qbittorrent/docker-qbittorrent-nox@sha256:9ebb534fe30bab98622cb84a8c3acecfd88319b2d540f52ecdec7b9f866374d7}
node_image='node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32'
run_id="neotorrent-qbit-$$"
pod_name="$run_id-pod"
qbit_name="$run_id-qbittorrent"
proxy_name="$run_id-proxy"
config_volume="$run_id-config"
downloads_volume="$run_id-downloads"
preflight_directory=$(mktemp -d)

cleanup() {
  docker rm -f "$proxy_name" "$qbit_name" "$pod_name" >/dev/null 2>&1 || true
  docker volume rm "$config_volume" "$downloads_volume" >/dev/null 2>&1 || true
  rm -rf "$preflight_directory"
}
trap cleanup EXIT INT TERM

fail() {
  printf 'real qBittorrent integration failure: %s\n' "$1" >&2
  exit 1
}

redacted_qbittorrent_logs() {
  docker logs "$qbit_name" 2>&1 \
    | sed -E 's/(temporary password is provided for this session: *).*/\1[REDACTED]/'
}

docker image inspect "$image" >/dev/null 2>&1 \
  || "$repository_root/container/build-image.sh"

docker volume create "$config_volume" >/dev/null
docker volume create "$downloads_volume" >/dev/null
docker run --rm \
  -v "$config_volume:/config" \
  -v "$repository_root/container/tests/qbittorrent.conf:/fixture/qBittorrent.conf:ro" \
  "$node_image" sh -c \
  'mkdir -p /config/qBittorrent/config && cp /fixture/qBittorrent.conf /config/qBittorrent/config/qBittorrent.conf'

# This container owns the shared network namespace, mirroring a Kubernetes Pod
# sandbox. qBittorrent and NeoTorrent both reach each other over loopback.
docker run -d --name "$pod_name" \
  --read-only --tmpfs /tmp:rw,noexec,nosuid,size=8m \
  -p 127.0.0.1::8081 \
  "$node_image" node -e 'setInterval(() => {}, 60_000)' >/dev/null

docker run -d --name "$qbit_name" --network "container:$pod_name" \
  --read-only --tmpfs /tmp:rw,nosuid,size=32m \
  --stop-timeout 60 \
  -e QBT_LEGAL_NOTICE=confirm \
  -e QBT_WEBUI_PORT=8080 \
  -v "$config_volume:/config" \
  -v "$downloads_volume:/downloads" \
  -v "$downloads_volume:/data" \
  "$qbit_image" >/dev/null

for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
  if docker exec "$pod_name" wget -q -O /dev/null http://127.0.0.1:8080/; then
    break
  fi
  [ "$attempt" -lt 20 ] || {
    redacted_qbittorrent_logs >&2
    fail 'qBittorrent 5.2.3 did not start'
  }
  sleep 1
done

# These are legal, disposable test-library roots in the named download volume.
# NeoTorrent itself never mounts this volume; only qBittorrent can access it.
docker exec "$qbit_name" mkdir -p /data/tv-shows /data/movies /data/manual-review
docker exec "$qbit_name" chown 1000:1000 /data /data/tv-shows /data/movies /data/manual-review

password=$(docker logs "$qbit_name" 2>&1 \
  | sed -n 's/.*temporary password is provided for this session: *//p' \
  | tr -d '\r' \
  | tail -n 1)
[ -n "$password" ] || fail 'qBittorrent temporary password was not found in its logs'

docker run -d --name "$proxy_name" --network "container:$pod_name" \
  --read-only --cap-drop ALL --security-opt no-new-privileges:true \
  --tmpfs /tmp:rw,noexec,nosuid,size=32m \
  -e QBITTORRENT_URL=http://127.0.0.1:8080 \
  -e NEOTORRENT_MEDIA_MODE=assist \
  -e NEOTORRENT_TV_ROOT=/data/tv-shows \
  -e NEOTORRENT_MOVIES_ROOT=/data/movies \
  -e NEOTORRENT_MEDIA_BROWSE_ROOT=/data \
  -e NEOTORRENT_MEDIA_CONFIG_LOCKED=true \
  -e 'NEOTORRENT_TV_CATEGORY=TV Shows' \
  -e NEOTORRENT_MOVIE_CATEGORY=Movies \
  "$image" >/dev/null

host_port=$(docker port "$pod_name" 8081/tcp | sed -n '1s/.*://p')
[ -n "$host_port" ] || fail 'could not discover the standalone proxy test port'
base_url="http://127.0.0.1:$host_port/"

for attempt in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "${base_url}readyz" >/dev/null 2>&1; then
    break
  fi
  [ "$attempt" -lt 10 ] || {
    docker logs "$proxy_name" >&2
    fail 'standalone proxy did not become ready'
  }
  sleep 1
done

login_status=000
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  login_status=$(curl -sS \
    -o "$preflight_directory/login-response" \
    -w '%{http_code}' \
    -c "$preflight_directory/cookies" \
    -H "Origin: ${base_url%/}" \
    -H "Referer: $base_url" \
    --data-urlencode username=admin \
    --data-urlencode "password=$password" \
    "${base_url}api/v2/auth/login")
  if [ "$login_status" = '200' ] || [ "$login_status" = '204' ]; then
    break
  fi
  [ "$attempt" -lt 10 ] || break
  sleep 1
done
if [ "$login_status" != '200' ] && [ "$login_status" != '204' ]; then
  redacted_qbittorrent_logs >&2
  fail "the parsed temporary password failed proxy preflight login with HTTP $login_status"
fi
curl -fsS \
  -b "$preflight_directory/cookies" \
  -H "Origin: ${base_url%/}" \
  -H "Referer: $base_url" \
  -X POST \
  "${base_url}api/v2/auth/logout" >/dev/null

if [ -z "${PLAYWRIGHT_CHROME_PATH:-}" ] && command -v google-chrome >/dev/null 2>&1; then
  PLAYWRIGHT_CHROME_PATH=$(command -v google-chrome)
fi

NEOTORRENT_TEST_URL="$base_url" \
QBITTORRENT_TEST_PASSWORD="$password" \
QBITTORRENT_TEST_CONTAINER="$qbit_name" \
PLAYWRIGHT_CHROME_PATH=${PLAYWRIGHT_CHROME_PATH:-} \
node "$repository_root/container/tests/qbittorrent-integration.mjs"

printf 'real qBittorrent 5.2.3 integration tests passed (shared localhost Pod topology)\n'
