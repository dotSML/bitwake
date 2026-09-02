#!/bin/sh
set -eu

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
image=${BITWAKE_IMAGE-bitwake:test}
version=${BUILD_VERSION:-0.1.0-preview}

if [ -n "${BUILD_REVISION:-}" ]; then
  revision=$BUILD_REVISION
else
  revision=$(git -C "$repository_root" rev-parse HEAD 2>/dev/null || printf unknown)
  if [ "$revision" != unknown ] \
    && [ -n "$(git -C "$repository_root" status --porcelain --untracked-files=normal)" ]; then
    revision="${revision}-dirty"
  fi
fi

if [ -n "${BUILD_CREATED:-}" ]; then
  created=$BUILD_CREATED
elif [ "$revision" != unknown ] && [ "${revision%-dirty}" = "$revision" ]; then
  created=$(git -C "$repository_root" show -s --format=%cI "$revision" 2>/dev/null || printf unspecified)
else
  created=unspecified
fi

exec docker build \
  --build-arg "BUILD_CREATED=$created" \
  --build-arg "BUILD_REVISION=$revision" \
  --build-arg "BUILD_VERSION=$version" \
  --tag "$image" \
  "$repository_root"
