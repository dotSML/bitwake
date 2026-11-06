---
name: bitwake-release
description: Ship Bitwake to the homelab. Gets the finished work onto main, runs the local release gate, builds the image, pushes it to Docker Hub with a registry-verified digest, pins it in deploy.sh and the Kubernetes release patch, pushes main to origin, and hands the user the `bash deploy.sh <host>` command. Use when the user says "build push deploy", "release", "ship it" or similar. Not for questions about how releases work, and never runs ssh or kubectl.
---

# Bitwake release

One release = work on `main`, local gate, build, push, pin, push git, hand over the deploy command. The user's request ("build push deploy") authorizes the merge onto `main`, `git push origin main`, `docker push`, and the edits to `deploy.sh` and the release patch. It does **not** authorize running the deploy.

There is no GitHub Actions and no CI. The gate is Step 3, run here, and nothing else checks the release. The homelab-skills `neotorrent-k8s-deploy` skill gates on those removed workflows and on GHCR; it no longer applies, don't use it.

## Hard rules

- **Never run `ssh`, `kubectl`, or `bash deploy.sh`.** Not even read-only checks. "Deploy" means: give the user the command. Only if they say "run it yourself" in so many words, confirm the cluster context first and treat it as a separate operation. The rollout restarts the Pod that holds qBittorrent and Gluetun, so it interrupts downloads and the VPN.
- **Stop on failure.** A failed gate, registry lookup, build, push or digest check: report what failed and whether an image is already published, and do not touch `deploy.sh`, the patch or git. A failed Docker command is not an empty result.
- **Never reuse or overwrite a tag, and never push `latest`.** Nodes keep the old image under `IfNotPresent`.
- **Build from the commit, not the working tree** (Step 4), so the image matches a commit.
- **Stage by path, never `git add -A`.** Leave unrelated files out and say so.
- No force-push, no pruning local images, and never print or ask for Docker credentials; on an auth error tell the user to `docker login`.
- If a push (git or docker) is blocked by the permission system, say exactly which one and stop. Don't route around it.

## Steps

### 1. Get the work onto main

`git status`, `git branch --show-current`, `git fetch origin main`, `git branch --no-merged main`.

- Work on a branch: from the main checkout run `git merge --ff-only <branch>`. Do **not** `git switch` the shared checkout. If it can't fast-forward, or `main` isn't checked out, stop and ask. No merge commits unasked.
- `main` must contain `origin/main` (`git merge-base --is-ancestor origin/main main`). If origin is ahead, stop: the push in Step 6 would be rejected.
- Uncommitted changes that belong to the release: ask before committing them. Unrelated ones stay uncommitted.

### 2. Decide whether anything shipped changed

Read the pinned ref: `grep '^expected_image=' deploy.sh`. A digest of all zeros means nothing has been released yet: build.

Otherwise find the commit that last changed the pin and list the files that go into the image since:

```bash
base=$(git log -1 --format=%h -G"^expected_image=" -- deploy.sh)
git diff --name-only $base..HEAD -- . ':(exclude)docs' ':(exclude)deploy' ':(exclude)tests' \
  ':(exclude).github' ':(exclude).claude' ':(exclude)deploy.sh' ':(exclude)*.md' \
  ':(exclude)playwright*.ts' ':(exclude)vitest.config.ts' ':(exclude)eslint.config.js' \
  ':(exclude).prettierrc.json' ':(exclude).prettierignore'
```

Nothing listed = nothing shipped changed: say so and stop; there is nothing to build. Docs, tests and the deploy files don't ship. Say what will be built and why, in one line, before building.

### 3. Gate

This replaces the removed CI. From the repo root:

```bash
pnpm format:check && pnpm run ci
```

`pnpm run ci` runs the identity check, typecheck, lint, all Vitest projects and both production builds. Any failure stops the release. Keep the output in the scratchpad and quote the failing lines.

The browser suites (`pnpm test:e2e`, `pnpm test:pwa`, about 10 minutes) run when the user asks, or when the diff touches layout (`src/ui`, `src/styles`, `*.vue`). The 320px layout tests depend on the default sans font: DejaVu Sans, the usual Linux default, is much wider than most desktop fonts, so a pass on a narrow-font desktop doesn't prove the smallest viewport.

The image gates come after the build in Step 4.

### 4. Pick the tag, then build, gate the image, push, verify

**Tag.** The repository is `stenml/bitwake` on Docker Hub.

```bash
curl -s -m 20 -w '\n%{http_code}' "https://hub.docker.com/v2/repositories/stenml/bitwake/tags?page_size=100"
```

HTTP 404 means the repository doesn't exist yet: this is the first release (see "First push"). Any other failure stops the release. Otherwise take the highest `X.Y.Z` tag. The candidate is the patch bump of the highest of (registry, the tag in `deploy.sh`), but never below `version` in `package.json`; with no tags and the placeholder pin that is `package.json`'s version. Confirm the candidate is free right before pushing:

```bash
curl -s -m 20 -o /dev/null -w '%{http_code}' https://hub.docker.com/v2/repositories/stenml/bitwake/tags/<tag>   # must be 404
```

A lookup that errors (not a clean 404) stops the release.

**Build from the commit.** Export HEAD into the scratchpad and build there, so uncommitted files can't leak in:

```bash
rev=$(git rev-parse HEAD)
mkdir -p <scratchpad>/bitwake-build && git archive "$rev" | tar -x -C <scratchpad>/bitwake-build
docker build \
  --build-arg BUILD_VERSION=<tag> --build-arg BUILD_REVISION="$rev" \
  --build-arg BUILD_CREATED="$(git show -s --format=%cI "$rev")" \
  -t stenml/bitwake:<tag> <scratchpad>/bitwake-build
```

Log to the scratchpad and check the exit status. This builds for the host architecture only (amd64 on this machine, which is what the cluster runs).

**Gate the image** before pushing, on that local tag:

```bash
BITWAKE_IMAGE=stenml/bitwake:<tag> sh container/test-container.sh
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache \
  aquasec/trivy:0.74.0 image --quiet --severity HIGH,CRITICAL --ignore-unfixed=false \
  --exit-code 1 --skip-version-check stenml/bitwake:<tag>
```

Both must exit 0. A Trivy failure usually means the pinned nginx base image is outdated: bump its tag and digest in the `Dockerfile` (and the same pin in `docs/deployment.md`, `docs/architecture.md`, `docs/security.md`), commit that as its own change, and start again from Step 1. `sh container/test-qbittorrent.sh` (real qBittorrent 5.2.3, pulls an image) runs when `container/` or the `Dockerfile` changed, or when asked.

**Push and verify.** `docker push stenml/bitwake:<tag>`, read the digest from `<tag>: digest: sha256:… size: …`, and confirm it against the registry:

```bash
docker buildx imagetools inspect stenml/bitwake:<tag> | grep -E '^Name:|^Digest:'
```

The two digests must be identical. A local image ID is not a digest.

**First push.** If `stenml/bitwake` did not exist, the push creates it with the account's default visibility, which is usually public. The source has no license yet (`docs/releasing.md`), so say this in the report and let the user set the visibility on Docker Hub.

### 5. Pin the reference

Exactly two files carry the ref, as `stenml/bitwake:<tag>@sha256:<digest>`:

- `deploy.sh` (`expected_image`)
- `deploy/kubernetes/bitwake-release-patch.yaml` (the `image:` line of the `vuetorrent` container)

Read the current ref from `deploy.sh`, replace it with `sed` in both, then check each file contains the new digest exactly once, run `bash -n deploy.sh` (syntax only), and show `git diff -- deploy.sh deploy`. Change nothing else: the object names in `deploy.sh`, and the Bitwake `env` entries in the patch, stay. The patch is the only place the production settings live, and `deploy.sh` checks them in the running container. The example manifests under `deploy/kubernetes/sidecar` and `separate` are templates for other installations and are not pinned here.

### 6. Commit and push git

```bash
git add deploy.sh deploy/kubernetes/bitwake-release-patch.yaml
git commit -m "release: 0.1.1" -m "<one line: what shipped; full ref>"   # plus the session's attribution trailer
git push origin main
```

Subject names the tag, e.g. `release: 0.1.1`. A rejected push (non-fast-forward) means someone else pushed: report it, don't force.

### 7. Hand over

Give the user, in a code block, this line exactly (it is the same cluster host as the Relay deployment; copy it from here, never retype it):

```bash
bash deploy.sh stenmladm@10.73.20.20
```

Run from the repo root. Use the same line in prose too, not a paraphrase. Then a short report: tag and digest pushed, the gate results (what ran, what didn't), files changed, whether the tree was dirty and what was left out, git commit pushed, the Docker Hub visibility note if it was the first push, and plainly that **nothing is deployed until they run it**.

What the command does, if useful: refuses to run while the pin is the placeholder or the two pins disagree, checks that the Deployment `media/torrent-vpn` has the `vuetorrent` container and that a hostPort Pod uses `Recreate`, saves the live Deployment under `~/.local/state/bitwake-deploy/`, patches the image and Bitwake settings, waits for the rollout, then fails unless the running image digest, readiness, the runtime config (`/_bitwake/runtime-config.json`), qBittorrent through Bitwake, the Service's port 80 target and the absence of an Ingress `rewrite-target` are all right. The rollout restarts the Pod, so qBittorrent and the VPN restart with it. Rollback is `kubectl -n media rollout undo deployment/torrent-vpn`, after which the pins in the repository must be set back too.

If the release carried an earlier unreleased one (the user never ran the last deploy), say so. The first deploy of a Bitwake image onto a stack that last ran NeoTorrent replaces the `NEOTORRENT_*` settings with `BITWAKE_*`; old `NEOTORRENT_*` entries stay in the Deployment, unused.

### 8. Afterwards

If the session keeps release notes in memory, update them with the new tag and digest. Branches that were merged can be deleted by the user; don't delete them unasked.

## Why these rules

- The user runs cluster commands themselves; releases are handed over, never executed.
- Digest pinning makes a rollout reproducible, so the registry's digest is the only one that counts.
- With CI gone, the release gate is the only check between a commit and the cluster, so it runs before the push and its result goes in the report.
- The torrent Deployment is shared with qBittorrent and Gluetun, so a rollout is never free.
