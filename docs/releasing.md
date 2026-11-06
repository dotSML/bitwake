# Releasing Bitwake

Bitwake has no hosted CI and no GitHub Actions. A release is built, checked and pushed from
the maintainer's machine, and applied to the homelab cluster with `deploy.sh`. The
`bitwake-release` skill ([`.claude/skills/bitwake-release/SKILL.md`](../.claude/skills/bitwake-release/SKILL.md))
is the working checklist; this page describes the same process and what it does and does not
guarantee.

## What a release is

One release is one container image, `stenml/bitwake:<X.Y.Z>`, pinned by digest in two files:

- `deploy.sh` (`expected_image`)
- `deploy/kubernetes/bitwake-release-patch.yaml` (the image and the Bitwake runtime settings)

`deploy.sh` refuses to run while the pin is the all-zero placeholder, or when the two files
pin different images. Tags are never reused or overwritten, and `latest` is not pushed.

## The release gate

Nothing checks a release except these steps, so none is optional unless noted:

```bash
corepack pnpm format:check
corepack pnpm run ci          # identity, typecheck, lint, all Vitest projects, both production builds
```

Then, on the image built from the release commit (`git archive` of that commit, never the working
tree):

```bash
BITWAKE_IMAGE=stenml/bitwake:<tag> sh container/test-container.sh
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache \
  aquasec/trivy:0.74.0 image --severity HIGH,CRITICAL --ignore-unfixed=false --exit-code 1 \
  --skip-version-check stenml/bitwake:<tag>
```

Also run when they apply:

- `corepack pnpm test:e2e` and `corepack pnpm test:pwa` when layout or UI changed. About ten
  minutes. The 320px layout tests depend on the system sans font (DejaVu Sans is much wider than
  most desktop fonts), so a pass with narrow fonts does not prove the smallest viewport.
- `sh container/test-qbittorrent.sh` when `container/` or the `Dockerfile` changed. It runs the
  real-qBittorrent contract against the reviewed official 5.2.3 / Web API 2.15.1 image pinned by
  digest. Set `QBITTORRENT_IMAGE`, `QBITTORRENT_EXPECTED_VERSION` and
  `QBITTORRENT_EXPECTED_WEBAPI_VERSION` to run another reviewed image, such as 5.0.5.
- `corepack pnpm test:performance` when performance-sensitive code changed.

Results belong to the commit they ran on. Rerun them for the commit being released; do not carry
a pass forward from another commit.

What this does not give you, compared with the removed hosted workflows: a build on a clean
machine, a second architecture (the image is built for the machine's own architecture, amd64),
SBOM, provenance and artifact attestations, or a scheduled run against older qBittorrent
versions.

## Build, push, pin, hand over

1. Get the work onto `main` (fast-forward only).
2. Run the gate above.
3. Pick the next tag: the patch bump of the highest of the Docker Hub tags and the pinned tag,
   never below `version` in `package.json`.
4. Build from the commit, run the image gates, `docker push`, and confirm the pushed digest
   against the registry (`docker buildx imagetools inspect`).
5. Pin `stenml/bitwake:<tag>@sha256:<digest>` in `deploy.sh` and the release patch, commit as
   `release: <tag>`, and push `main`.
6. Run the deploy:

   ```bash
   bash deploy.sh stenmladm@10.73.20.20
   ```

   Without the host argument the script runs `kubectl` on the machine it is started on.

## What `deploy.sh` does

It is an image-only upgrade of the existing torrent stack, as described in
[deployment.md](deployment.md): the Deployment `media/torrent-vpn`, Service `torrent` and Ingress
`torrent-ingress` keep their names, and the container that runs Bitwake is `vuetorrent`.

Before changing anything it stops if that container is missing, or if a Pod that reserves a
`hostPort` is not on the `Recreate` strategy (a rolling update would deadlock). It saves the live
Deployment under `~/.local/state/bitwake-deploy/`, applies the release patch, waits for the
rollout, and then fails unless the running image digest, readiness, the runtime config at
`/_bitwake/runtime-config.json` (Media Placement mode, lock and roots), qBittorrent through
Bitwake, the Service's port 80 target and the absence of an Ingress `rewrite-target` are all
correct.

The Pod also holds qBittorrent and Gluetun, so a rollout restarts them and interrupts downloads
and the VPN for a short while.

The release patch carries Bitwake's runtime settings because `BITWAKE_MEDIA_MODE` defaults to
`off` when missing, which would switch Media Placement off without any message. Change a setting
in the patch and run `deploy.sh` again; do not use `kubectl set env`.

## Rollback

```bash
kubectl -n media rollout undo deployment/torrent-vpn
```

Then set the pins in `deploy.sh` and the release patch back to the previous release, or the next
`deploy.sh` run will apply the newer one again. The saved Deployment YAML from
`~/.local/state/bitwake-deploy/` is the exact previous state. Native Alternative WebUI
installations roll back as described in [deployment.md](deployment.md#rollback).

## Public releases and the license

The GitHub Release workflow (versioned Alternative WebUI archive, checksums and release metadata)
was removed with the rest of the hosted workflows, so GitHub Releases are no longer created. The
tools it used remain for manual use: `pnpm build:alt-webui` builds the native package, and
`pnpm release:verify` inspects a release archive.

The repository still has no license. Public source visibility does not grant permission to copy,
modify, or redistribute it, and the same applies to a public image or archive. Before publishing
either outside the homelab, choose and add a license (see [license-decision.md](license-decision.md)),
align the root `package.json` license metadata, the container's OCI license label and the
Alternative WebUI archive notices with it, and set the visibility of `stenml/bitwake` on Docker
Hub deliberately: the first push creates the repository with the account's default visibility.
