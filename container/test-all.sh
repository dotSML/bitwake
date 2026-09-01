#!/bin/sh
set -eu

container_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

"$container_directory/test-container.sh"
"$container_directory/test-qbittorrent.sh"

