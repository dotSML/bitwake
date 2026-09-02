#!/bin/sh
set -eu

fail() {
    printf 'Bitwake configuration error: %s\n' "$1" >&2
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

media_configuration_invalid=false

invalidate_media_configuration() {
    media_configuration_invalid=true
}

contains_utf8_c1_control() {
    # In a UTF-8 environment U+0080 through U+009F are encoded as C2 80..9F.
    # POSIX character classes under LC_ALL=C only cover the single-byte C0 set,
    # so inspect the bytes explicitly as well.
    printf '%s' "$1" | od -An -v -tu1 | awk '
        {
            for (field_number = 1; field_number <= NF; field_number += 1) {
                byte = $field_number + 0
                if (previous == 194 && byte >= 128 && byte <= 159) found = 1
                previous = byte
            }
        }
        END { exit found ? 0 : 1 }
    '
}

contains_utf8_unsafe_format_character() {
    # Reject Unicode line/paragraph separators and Bidi_Control characters.
    # Normal RTL letters remain valid; only invisible direction controls that
    # can visually spoof a reviewed path are excluded.
    printf '%s' "$1" | od -An -v -tu1 | awk '
        {
            for (field_number = 1; field_number <= NF; field_number += 1) {
                byte = $field_number + 0
                if (previous == 216 && byte == 156) found = 1
                if (two_back == 226 && previous == 128 \
                    && (byte == 142 || byte == 143 || (byte >= 168 && byte <= 174))) found = 1
                if (two_back == 226 && previous == 129 && byte >= 166 && byte <= 169) found = 1
                two_back = previous
                previous = byte
            }
        }
        END { exit found ? 0 : 1 }
    '
}

validate_runtime_text() {
    value=$1

    case "$value" in
        *'
'*) invalidate_media_configuration ;;
    esac

    if printf '%s' "$value" | LC_ALL=C grep -q '[[:cntrl:]]'; then
        invalidate_media_configuration
    fi

    if contains_utf8_c1_control "$value"; then
        invalidate_media_configuration
    fi

    if contains_utf8_unsafe_format_character "$value"; then
        invalidate_media_configuration
    fi

    value_size=$(printf '%s' "$value" | wc -c | tr -d '[:space:]')
    [ "$value_size" -le 4096 ] || invalidate_media_configuration
}

validate_unc_runtime_path() {
    normalized_path=$(printf '%s' "$1" | sed 's|\\|/|g')
    unc_remainder=${normalized_path#//}
    unc_server=${unc_remainder%%/*}

    [ -n "$unc_server" ] && [ "$unc_server" != '.' ] && [ "$unc_server" != '..' ] \
        || return 1
    [ "$unc_server" != "$unc_remainder" ] || return 1

    unc_remainder=${unc_remainder#*/}
    while [ "${unc_remainder#/}" != "$unc_remainder" ]; do
        unc_remainder=${unc_remainder#/}
    done
    unc_share=${unc_remainder%%/*}
    [ -n "$unc_share" ] && [ "$unc_share" != '.' ] && [ "$unc_share" != '..' ]
}

validate_windows_runtime_segments() {
    normalized_path=$(printf '%s' "$1" | sed 's|\\|/|g')
    printf '%s' "$normalized_path" | awk -F/ '
        function reserved(value, lower) {
            lower = tolower(value)
            return lower ~ /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/
        }
        {
            for (field_number = 1; field_number <= NF; field_number += 1) {
                part = $field_number
                if (part == "" || part == "." || part == "..") continue
                if (part ~ /[<>:"|?*]/ || part ~ /[. ]$/ || reserved(part)) invalid = 1
            }
        }
        END { exit invalid ? 1 : 0 }
    '
}

is_absolute_runtime_path() {
    value=$1

    if printf '%s' "$value" | grep -Eq '^[A-Za-z]:[\\/]'; then
        drive_segments=${value#??}
        validate_windows_runtime_segments "$drive_segments"
        return
    fi
    if printf '%s' "$value" | grep -Eq '^[A-Za-z]:'; then
        return 1
    fi

    case "$value" in
        \\\\*)
            validate_unc_runtime_path "$value" \
                && validate_windows_runtime_segments "$value"
            ;;
        //*)
            forward_unc_remainder=${value#//}
            case "$forward_unc_remainder" in
                ''|/*) return 0 ;;
                *)
                    validate_unc_runtime_path "$value" \
                        && validate_windows_runtime_segments "$value"
                    ;;
            esac
            ;;
        /*) return 0 ;;
        *) return 1 ;;
    esac
}

validate_optional_runtime_path() {
    [ -z "$1" ] || is_absolute_runtime_path "$1" || invalidate_media_configuration
}

# Return success when two already-validated roots are lexically equal or one is
# a segment-aware descendant of the other. Windows drive and UNC paths compare
# case-insensitively, matching the browser-side Media Placement parser.
runtime_media_roots_overlap() {
    [ -n "$1" ] && [ -n "$2" ] || return 1
    printf '%s\n%s\n' "$1" "$2" | awk '
        # Keep path_index distinct from the AWK built-in index() function. Some
        # implementations reject a function parameter named "index" outright.
        function parse_path(value, path_index, normalized, count, fields, field_number, part, prefix) {
            normalized = value
            prefix = substr(value, 1, 2)
            if (substr(value, 2, 1) == ":" \
                && (substr(value, 3, 1) == "/" || substr(value, 3, 1) == "\\")) {
                style[path_index] = "windows"
                root[path_index] = "drive:" tolower(substr(value, 1, 2))
                gsub(/\\/, "/", normalized)
                normalized = substr(normalized, 4)
            } else if (prefix == "\\\\" \
                || (prefix == "//" && length(value) > 2 && substr(value, 3, 1) != "/")) {
                style[path_index] = "windows"
                gsub(/\\/, "/", normalized)
                sub(/^\/\//, "", normalized)
                gsub(/\/+/, "/", normalized)
                count = split(normalized, fields, "/")
                root[path_index] = "unc:" tolower(fields[1] "/" fields[2])
                normalized = ""
                for (field_number = 3; field_number <= count; field_number += 1) {
                    normalized = normalized (normalized == "" ? "" : "/") fields[field_number]
                }
            } else {
                style[path_index] = "posix"
                root[path_index] = "posix:/"
                normalized = substr(normalized, 2)
            }

            count = split(normalized, fields, "/")
            segment_count[path_index] = 0
            for (field_number = 1; field_number <= count; field_number += 1) {
                part = fields[field_number]
                if (part == "" || part == ".") continue
                if (part == "..") {
                    if (segment_count[path_index] > 0) segment_count[path_index] -= 1
                    continue
                }
                if (style[path_index] == "windows") part = tolower(part)
                segment_count[path_index] += 1
                segment[path_index, segment_count[path_index]] = part
            }
        }
        function is_prefix(left, right, field_number) {
            if (segment_count[left] > segment_count[right]) return 0
            for (field_number = 1; field_number <= segment_count[left]; field_number += 1) {
                if (segment[left, field_number] != segment[right, field_number]) return 0
            }
            return 1
        }
        { path[NR] = $0 }
        END {
            parse_path(path[1], 1)
            parse_path(path[2], 2)
            if (style[1] != style[2] || root[1] != root[2]) exit 1
            exit (is_prefix(1, 2) || is_prefix(2, 1)) ? 0 : 1
        }
    '
}

json_escape() {
    # Control characters are rejected before this function is called. JSON's
    # remaining required string escapes are backslash and double quote.
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

LISTEN_PORT=${LISTEN_PORT:-8081}
MAX_UPLOAD_SIZE=${MAX_UPLOAD_SIZE:-100m}
PROXY_CONNECT_TIMEOUT=${PROXY_CONNECT_TIMEOUT:-10s}
PROXY_READ_TIMEOUT=${PROXY_READ_TIMEOUT:-300s}
PROXY_SEND_TIMEOUT=${PROXY_SEND_TIMEOUT:-300s}
PROXY_SSL_VERIFY=${PROXY_SSL_VERIFY:-on}
BITWAKE_MEDIA_MODE=${BITWAKE_MEDIA_MODE-off}
BITWAKE_TV_ROOT=${BITWAKE_TV_ROOT-}
BITWAKE_MOVIES_ROOT=${BITWAKE_MOVIES_ROOT-}
BITWAKE_MEDIA_BROWSE_ROOT=${BITWAKE_MEDIA_BROWSE_ROOT-}
BITWAKE_MEDIA_CONFIG_LOCKED=${BITWAKE_MEDIA_CONFIG_LOCKED-false}
BITWAKE_TV_CATEGORY=${BITWAKE_TV_CATEGORY-}
BITWAKE_MOVIE_CATEGORY=${BITWAKE_MOVIE_CATEGORY-}

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

case "$BITWAKE_MEDIA_MODE" in
    off|assist) ;;
    *) invalidate_media_configuration ;;
esac
case "$BITWAKE_MEDIA_CONFIG_LOCKED" in
    true|false) ;;
    *) invalidate_media_configuration ;;
esac

validate_runtime_text "$BITWAKE_MEDIA_MODE" BITWAKE_MEDIA_MODE
validate_runtime_text "$BITWAKE_TV_ROOT" BITWAKE_TV_ROOT
validate_runtime_text "$BITWAKE_MOVIES_ROOT" BITWAKE_MOVIES_ROOT
validate_runtime_text "$BITWAKE_MEDIA_BROWSE_ROOT" BITWAKE_MEDIA_BROWSE_ROOT
validate_runtime_text "$BITWAKE_MEDIA_CONFIG_LOCKED" BITWAKE_MEDIA_CONFIG_LOCKED
validate_runtime_text "$BITWAKE_TV_CATEGORY" BITWAKE_TV_CATEGORY
validate_runtime_text "$BITWAKE_MOVIE_CATEGORY" BITWAKE_MOVIE_CATEGORY

validate_optional_runtime_path "$BITWAKE_TV_ROOT"
validate_optional_runtime_path "$BITWAKE_MOVIES_ROOT"
validate_optional_runtime_path "$BITWAKE_MEDIA_BROWSE_ROOT"

if runtime_media_roots_overlap "$BITWAKE_TV_ROOT" "$BITWAKE_MOVIES_ROOT"; then
    invalidate_media_configuration
fi

if [ "$BITWAKE_MEDIA_MODE" = 'assist' ] \
    && [ "$BITWAKE_MEDIA_CONFIG_LOCKED" = 'true' ]; then
    [ -n "$BITWAKE_TV_ROOT" ] && [ -n "$BITWAKE_MOVIES_ROOT" ] \
        || invalidate_media_configuration
fi

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

runtime_config_file=/tmp/bitwake-runtime-config.json
runtime_config_temporary_file=/tmp/bitwake-runtime-config.json.tmp
umask 077
if [ "$media_configuration_invalid" = 'true' ]; then
    printf '%s\n' 'Bitwake media configuration warning: invalid standalone media settings; Media Placement will start off.' >&2
    {
        printf '{\n'
        printf '  "mediaPlacement": null,\n'
        printf '  "configurationError": true\n'
        printf '}\n'
    } > "$runtime_config_temporary_file"
else
    {
        printf '{\n'
        printf '  "mediaPlacement": {\n'
        printf '    "mode": "%s",\n' "$(json_escape "$BITWAKE_MEDIA_MODE")"
        printf '    "locked": %s,\n' "$BITWAKE_MEDIA_CONFIG_LOCKED"
        printf '    "tvRoot": "%s",\n' "$(json_escape "$BITWAKE_TV_ROOT")"
        printf '    "moviesRoot": "%s",\n' "$(json_escape "$BITWAKE_MOVIES_ROOT")"
        printf '    "browseRoot": "%s",\n' "$(json_escape "$BITWAKE_MEDIA_BROWSE_ROOT")"
        printf '    "tvCategory": "%s",\n' "$(json_escape "$BITWAKE_TV_CATEGORY")"
        printf '    "movieCategory": "%s"\n' "$(json_escape "$BITWAKE_MOVIE_CATEGORY")"
        printf '  }\n'
        printf '}\n'
    } > "$runtime_config_temporary_file"
fi
mv "$runtime_config_temporary_file" "$runtime_config_file"

[ -r /usr/share/nginx/html/index.html ] \
    || fail 'standalone frontend index.html is missing or unreadable'

envsubst '${LISTEN_PORT} ${MAX_UPLOAD_SIZE} ${PROXY_CONNECT_TIMEOUT} ${PROXY_READ_TIMEOUT} ${PROXY_SEND_TIMEOUT} ${PROXY_SSL_VERIFY} ${QBITTORRENT_API_URL}' \
    < /etc/nginx/templates/bitwake.conf.template \
    > /tmp/nginx.conf

nginx -t -c /tmp/nginx.conf
exec "$@"
