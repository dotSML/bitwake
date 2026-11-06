#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# The release this repository points at. Keep it identical to the image in
# deploy/kubernetes/bitwake-release-patch.yaml: the bitwake-release skill rewrites both.
# An all-zero digest means no release has been pinned yet.
expected_image='stenml/bitwake:0.1.0@sha256:159d512f2e126efbb3387584cc246daf4140f7f6c04f7ce420c856a45b8d233b'

# Live object names. docs/deployment.md: keep them through an image-only upgrade, whatever the
# product is called. `vuetorrent` is the container that runs Bitwake in the torrent Pod.
namespace=media
deployment=torrent-vpn
container=vuetorrent
service=torrent
ingress=torrent-ingress
listen_port=8081
patch_file=deploy/kubernetes/bitwake-release-patch.yaml

if (( $# > 1 )); then
  printf 'Usage: bash deploy.sh [user@cluster-host]\n' >&2
  exit 2
fi

# These checks only read files, so they also run on the machine that starts an ssh deploy and
# stop a bad release before anything is copied or changed.
zero_digest=sha256:0000000000000000000000000000000000000000000000000000000000000000
if [[ "${expected_image##*@}" == "$zero_digest" ]]; then
  printf 'No release is pinned yet: expected_image in deploy.sh is still the placeholder. Run the bitwake-release skill first.\n' >&2
  exit 1
fi
if [[ ! -f "$patch_file" ]]; then
  printf 'Missing %s.\n' "$patch_file" >&2
  exit 1
fi
pins=$(grep -c -F -- "image: $expected_image" "$patch_file" || true)
if [[ "$pins" != 1 ]]; then
  printf '%s must contain exactly one "image: %s" line (found %s). deploy.sh and the release patch pin different releases.\n' \
    "$patch_file" "$expected_image" "$pins" >&2
  exit 1
fi
if ! grep -q -E -- "^[[:space:]]+- name: ${container}\$" "$patch_file"; then
  printf '%s does not patch a container named %s.\n' "$patch_file" "$container" >&2
  exit 1
fi

if (( $# == 1 )); then
  tar -cf - deploy.sh "$patch_file" | \
    ssh -- "$1" 'set -eu
release_dir=$(mktemp -d)
trap '\''rm -rf -- "$release_dir"'\'' EXIT
tar -xf - -C "$release_dir"
bash "$release_dir/deploy.sh"'
  exit
fi

if ! command -v kubectl >/dev/null 2>&1; then
  printf 'kubectl is missing. Run this script on the cluster host, or use:\n  bash deploy.sh user@cluster-host\n' >&2
  exit 127
fi

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}
dep() {
  kubectl -n "$namespace" get "deployment/$deployment" "$@"
}
container_image() {
  dep -o jsonpath="{.spec.template.spec.containers[?(@.name==\"${container}\")].image}"
}
# The value of one env entry in the release patch (the line after its name).
patch_env() {
  awk -v name="$1" '$0 ~ ("- name: " name "$") { getline; sub(/^[[:space:]]*value:[[:space:]]*/, ""); gsub(/\047|"/, ""); print; exit }' "$patch_file"
}

kubectl config current-context

# Everything below that could go wrong without changing anything is checked first. The torrent
# Deployment holds qBittorrent and Gluetun too: a rollout restarts all of them.
containers=$(dep -o jsonpath='{.spec.template.spec.containers[*].name}')
if [[ " $containers " != *" $container "* ]]; then
  fail "Deployment $namespace/$deployment has no container named $container (it has: $containers). Nothing was changed."
fi
host_ports=$(dep -o jsonpath='{.spec.template.spec.containers[*].ports[*].hostPort}')
strategy=$(dep -o jsonpath='{.spec.strategy.type}')
if [[ -n "$host_ports" && "$strategy" != Recreate ]]; then
  # A rolling update starts the new Pod while the old one still holds the port, and deadlocks.
  fail "The Pod reserves hostPort $host_ports but the strategy is ${strategy:-RollingUpdate}. Nothing was changed. Set Recreate first:
  kubectl -n $namespace patch deployment/$deployment --type=merge -p '{\"spec\":{\"strategy\":{\"type\":\"Recreate\",\"rollingUpdate\":null}}}'"
fi

previous_image=$(container_image)
backup_dir=${XDG_STATE_HOME:-$HOME/.local/state}/bitwake-deploy
mkdir -p -- "$backup_dir"
backup="$backup_dir/$(date -u +%Y%m%dT%H%M%SZ)-deployment.yaml"
dep -o yaml > "$backup"
printf 'Previous image: %s\nDeployment backup: %s\n' "$previous_image" "$backup"
if [[ "$previous_image" == "$expected_image" ]]; then
  printf 'The Deployment already runs this image; applying the patch again to restore the settings.\n'
fi

kubectl -n "$namespace" patch "deployment/$deployment" --type=strategic --patch-file "$patch_file"
if ! kubectl -n "$namespace" rollout status "deployment/$deployment" --timeout=5m; then
  kubectl -n "$namespace" get pods -o wide
  kubectl -n "$namespace" get events --sort-by=.lastTimestamp | tail -n 20
  fail "The rollout did not finish. Roll back with: kubectl -n $namespace rollout undo deployment/$deployment
Previous image $previous_image; saved Deployment $backup."
fi

image=$(container_image)
if [[ "$image" != "$expected_image" ]]; then
  fail "Release verification failed: expected $expected_image, the Deployment has $image."
fi
selector=$(dep -o go-template='{{range $k, $v := .spec.selector.matchLabels}}{{$k}}={{$v}},{{end}}')
selector=${selector%,}
pods=$(kubectl -n "$namespace" get pods -l "$selector" --field-selector=status.phase=Running -o name)
if [[ -z "$pods" || "$pods" == *$'\n'* ]]; then
  kubectl -n "$namespace" get pods -l "$selector" -o wide
  fail "Release verification failed: expected exactly one Running Pod for $selector."
fi
pod=${pods#pod/}
image_id=$(kubectl -n "$namespace" get pod "$pod" \
  -o jsonpath="{.status.containerStatuses[?(@.name==\"${container}\")].imageID}")
if [[ "$image_id" != *"@${expected_image##*@}" ]]; then
  fail "Release verification failed: the running $container has imageID $image_id, not ${expected_image##*@}. A cached image may be in use."
fi
not_ready=$(kubectl -n "$namespace" get pod "$pod" \
  -o jsonpath='{range .status.containerStatuses[?(@.ready==false)]}{.name} {end}')
if [[ -n "$not_ready" ]]; then
  fail "Release verification failed: containers not Ready: $not_ready"
fi

# Settings from the release patch must be what the container is running with. The entrypoint falls
# back to Media Placement off when BITWAKE_MEDIA_MODE is missing, so a lost setting is silent.
runtime=$(kubectl -n "$namespace" exec "$pod" -c "$container" -- \
  wget -qO- "http://127.0.0.1:${listen_port}/_bitwake/runtime-config.json")
expect_runtime() {
  if ! grep -q -F -- "$1" <<<"$runtime"; then
    printf '%s\n' "$runtime" >&2
    fail "Release verification failed: the running runtime config lacks $1."
  fi
}
media_mode=$(patch_env BITWAKE_MEDIA_MODE)
expect_runtime "\"mode\": \"$media_mode\""
expect_runtime "\"locked\": $(patch_env BITWAKE_MEDIA_CONFIG_LOCKED)"
if [[ "$media_mode" == assist ]]; then
  expect_runtime "\"tvRoot\": \"$(patch_env BITWAKE_TV_ROOT)\""
  expect_runtime "\"moviesRoot\": \"$(patch_env BITWAKE_MOVIES_ROOT)\""
  expect_runtime "\"browseRoot\": \"$(patch_env BITWAKE_MEDIA_BROWSE_ROOT)\""
fi
qbittorrent_version=$(kubectl -n "$namespace" exec "$pod" -c "$container" -- \
  wget -qO- "http://127.0.0.1:${listen_port}/api/v2/app/version")
if [[ -z "$qbittorrent_version" ]]; then
  fail "Release verification failed: qBittorrent did not answer through Bitwake."
fi

target_port=$(kubectl -n "$namespace" get "service/$service" \
  -o jsonpath='{.spec.ports[?(@.port==80)].targetPort}')
if [[ "$target_port" != "$listen_port" && "$target_port" != webui ]]; then
  fail "Release verification failed: Service $service sends port 80 to ${target_port:-nothing}, not Bitwake on $listen_port."
fi
rewrite=$(kubectl -n "$namespace" get "ingress/$ingress" \
  -o jsonpath='{.metadata.annotations.nginx\.ingress\.kubernetes\.io/rewrite-target}' || true)
if [[ -n "$rewrite" ]]; then
  fail "Release verification failed: Ingress $ingress still has rewrite-target $rewrite, which breaks Bitwake's paths."
fi

printf '\nDeployed and verified.\n  Pod:          %s\n  Image:        %s\n  qBittorrent:  %s\n  Media mode:   %s\n' \
  "$pod" "$image" "$qbittorrent_version" "$media_mode"
kubectl -n "$namespace" logs "$pod" -c "$container" --tail=20
printf 'Roll back with: kubectl -n %s rollout undo deployment/%s\n(then pin the previous image again in deploy.sh and %s)\n' \
  "$namespace" "$deployment" "$patch_file"
