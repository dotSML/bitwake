#!/bin/sh
set -eu

fail() {
    printf 'NeoTorrent configuration error: %s\n' "$1" >&2
    exit 64
}

validate_size() {
    printf '%s' "$1" | grep -Eq '^[1-9][0-9]*[kKmMgG]?$' \
        || fail "$2 must be a positive Nginx size such as 100m"
}

validate_timeout() {
    printf '%s' "$1" | grep -Eq '^[1-9][0-9]*(ms|s|m|h)$' \
        || fail "$2 must be a positive duration such as 10s"
}

LISTEN_PORT=${LISTEN_PORT:-8081}
MAX_UPLOAD_SIZE=${MAX_UPLOAD_SIZE:-100m}
PROXY_CONNECT_TIMEOUT=${PROXY_CONNECT_TIMEOUT:-10s}
PROXY_READ_TIMEOUT=${PROXY_READ_TIMEOUT:-300s}
PROXY_SEND_TIMEOUT=${PROXY_SEND_TIMEOUT:-300s}
PROXY_SSL_VERIFY=${PROXY_SSL_VERIFY:-on}

printf '%s' "$LISTEN_PORT" | grep -Eq '^[0-9]+$' \
    || fail 'LISTEN_PORT must be an integer from 1024 through 65535'
[ "$LISTEN_PORT" -ge 1024 ] && [ "$LISTEN_PORT" -le 65535 ] \
    || fail 'LISTEN_PORT must be an integer from 1024 through 65535'
validate_size "$MAX_UPLOAD_SIZE" MAX_UPLOAD_SIZE
validate_timeout "$PROXY_CONNECT_TIMEOUT" PROXY_CONNECT_TIMEOUT
validate_timeout "$PROXY_READ_TIMEOUT" PROXY_READ_TIMEOUT
validate_timeout "$PROXY_SEND_TIMEOUT" PROXY_SEND_TIMEOUT
case "$PROXY_SSL_VERIFY" in
    on|off) ;;
    *) fail 'PROXY_SSL_VERIFY must be on or off' ;;
esac

if [ -z "${QBITTORRENT_URL:-}" ]; then
    QB_HOST=${QB_HOST:-127.0.0.1}
    QB_PORT=${QB_PORT:-8080}
    printf '%s' "$QB_PORT" | grep -Eq '^[0-9]+$' \
        || fail 'QB_PORT must be an integer from 1 through 65535'
    [ "$QB_PORT" -ge 1 ] && [ "$QB_PORT" -le 65535 ] \
        || fail 'QB_PORT must be an integer from 1 through 65535'
    QBITTORRENT_URL="http://${QB_HOST}:${QB_PORT}"
fi

case "$QBITTORRENT_URL" in
    http://*|https://*) ;;
    *) fail 'QBITTORRENT_URL must start with http:// or https://' ;;
esac

if printf '%s' "$QBITTORRENT_URL" | grep -Eq '[[:space:];{}]'; then
    fail 'QBITTORRENT_URL must not contain whitespace, semicolons, braces, or newlines'
fi

case "$QBITTORRENT_URL" in
    *\?*|*\#*) fail 'QBITTORRENT_URL must not contain a query string or fragment' ;;
esac

url_without_scheme=${QBITTORRENT_URL#*://}
authority=${url_without_scheme%%/*}
[ -n "$authority" ] || fail 'QBITTORRENT_URL must include a host'
case "$authority" in
    *@*) fail 'QBITTORRENT_URL must not contain embedded credentials' ;;
esac

upstream_port=
case "$authority" in
    \[*\]:*) upstream_port=${authority##*:} ;;
    \[*\]) ;;
    *:*) upstream_port=${authority##*:} ;;
esac
if [ -n "$upstream_port" ]; then
    printf '%s' "$upstream_port" | grep -Eq '^[0-9]+$' \
        || fail 'QBITTORRENT_URL port must be an integer from 1 through 65535'
    [ "$upstream_port" -ge 1 ] && [ "$upstream_port" -le 65535 ] \
        || fail 'QBITTORRENT_URL port must be an integer from 1 through 65535'
fi

printf '%s' "$QBITTORRENT_URL" \
    | grep -Eq '^https?://(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:[0-9]{1,5})?(/[A-Za-z0-9._~%+,:@&=-]+)*/?$' \
    || fail 'QBITTORRENT_URL is not a valid safe HTTP(S) upstream URL'

QBITTORRENT_URL=${QBITTORRENT_URL%/}
case "$QBITTORRENT_URL" in
    */api/v2) fail 'QBITTORRENT_URL must be the qBittorrent base URL, without /api/v2' ;;
esac

QBITTORRENT_API_URL="${QBITTORRENT_URL}/api/"
export LISTEN_PORT MAX_UPLOAD_SIZE PROXY_CONNECT_TIMEOUT PROXY_READ_TIMEOUT
export PROXY_SEND_TIMEOUT PROXY_SSL_VERIFY QBITTORRENT_API_URL

[ -r /usr/share/nginx/html/index.html ] \
    || fail 'standalone frontend index.html is missing or unreadable'

envsubst '${LISTEN_PORT} ${MAX_UPLOAD_SIZE} ${PROXY_CONNECT_TIMEOUT} ${PROXY_READ_TIMEOUT} ${PROXY_SEND_TIMEOUT} ${PROXY_SSL_VERIFY} ${QBITTORRENT_API_URL}' \
    < /etc/nginx/templates/neotorrent.conf.template \
    > /tmp/nginx.conf

nginx -t -c /tmp/nginx.conf
exec "$@"
