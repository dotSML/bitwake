# Releasing NeoTorrent

NeoTorrent releases are deliberately staged. A Git tag alone publishes no
GitHub Release. The container workflow must first verify and publish the tagged
image, and then a maintainer runs the manual Release workflow for the exact tag.

The workflow accepts strict `vMAJOR.MINOR.PATCH` tags and the same form with a
valid SemVer prerelease suffix. A hyphenated suffix is published with GitHub's
prerelease flag; a tag without one is published as a stable release. In both
cases the `package.json` version and changelog heading must match exactly. Build
metadata (`+...`) is deliberately not accepted by this release process.

## Current release blocker

The repository has no license. Public source visibility does not grant
permission to copy, modify, or redistribute it. The Release workflow therefore
uses `--require-license` and fails closed until the project owner chooses and
adds an appropriate `LICENSE`, `LICENSE.md`, `LICENSE.txt`, `LICENCE`, or
`COPYING` file. Do not remove or bypass that gate to ship a release.

The automated gate checks that a recognized license file is present, that
`package.json` has a reviewed non-`UNLICENSED`/`NOASSERTION` SPDX expression,
and that the file is copied into the archive. It cannot decide whether the
chosen terms are appropriate, complete, or legally compatible with
dependencies.

Selecting the license is not just adding a gate file. The owner must also align
the root `package.json` license metadata, the container's OCI license label,
Alternative WebUI archive license/notice contents, and any required attribution
with the chosen terms.

## Prepare a release

1. Start from a clean, reviewed `main` commit.
2. Set `package.json` to the intended semantic version without a leading `v`.
3. Move the release notes from `Unreleased` into a dated
   `## [<version>] - YYYY-MM-DD` section in `CHANGELOG.md`. The verifier renders
   only that matching version section, so it must contain every release note;
   text left under `Unreleased` is not published for the tag.
4. Confirm the license gate, package/container/archive metadata, and public
   documentation are accurate.
5. Run the complete source and browser gates:

   ```bash
   corepack pnpm install --frozen-lockfile
   corepack pnpm format:check
   corepack pnpm run ci
   corepack pnpm test:e2e
   corepack pnpm test:pwa
   corepack pnpm test:performance
   corepack pnpm audit --prod --audit-level high
   corepack pnpm run licenses
   ```

   `pnpm run licenses` inventories the production graph, rejects licenses
   outside the reviewed allow-list, and builds deterministic notice text from
   package license files. Inspect that allow-list and output; neither this
   command nor `pnpm audit` is a formal security or legal audit.

6. Build and inspect the versioned native package:

   ```bash
   release_version=$(node -p "require('./package.json').version")
   SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" corepack pnpm build:alt-webui
   corepack pnpm release:verify -- --tag "v${release_version}" \
     --require-license \
     --artifact "dist/neotorrent-alt-webui-v${release_version}.zip"
   ```

   A fixed `SOURCE_DATE_EPOCH`, sorted archive entries, and stripped host ZIP
   metadata make the release archive reproducible from the same source and
   dependency graph.

## Tag and publish

1. Create a signed or annotated tag whose value is exactly `v` plus the
   `package.json` version, and push only after review:

   ```bash
   git tag -s v0.1.0 -m "NeoTorrent v0.1.0"
   git push origin v0.1.0
   ```

2. Wait for the **Container** workflow on that commit to pass. It runs source,
   browser, image, proxy, and real-qBittorrent gates; scans both published
   architectures; then publishes the versioned GHCR manifest with provenance,
   SBOM, and an attestation.
3. Confirm the exact revision also has reviewed CI evidence (including its PWA
   suite), Performance evidence, and qBittorrent Compatibility evidence for
   both pinned official 5.0.5 / Web API 2.11.2 and 5.2.3 / 2.15.1 images.
   Scheduled/manual evidence is revision-specific; rerun those workflows for
   the release commit when needed.
4. Verify `ghcr.io/dotsml/neotorrent:<version>` resolves to the expected manifest.
5. Run the **Release** workflow from GitHub Actions and enter the exact tag. Its
   non-publishing verification job checks out that tag, rejects a package/tag or
   changelog mismatch, repeats the source release gates, builds the Alternative
   WebUI twice with the tag commit timestamp and requires identical archives,
   resolves the versioned container tag to a digest, checks both platform
   labels, verifies the container provenance attestation, and records the digest
   in the release metadata. A separate release-environment job downloads only
   that verified bundle, rechecks its file set, checksums, metadata, and image
   provenance without executing the archive, then creates the GitHub Release.
   The workflow refuses to overwrite an existing release. Hyphenated SemVer
   versions are marked as prereleases.

The GitHub Release contains:

- `neotorrent-alt-webui-v<version>.zip`;
- `SHA256SUMS` covering the ZIP, metadata, and rendered notes;
- `release-metadata.json` with the version, tag, revision, size, and ZIP digest;
- release notes rendered from the matching changelog entry.

The ZIP itself also contains deterministic `THIRD_PARTY_NOTICES.txt`, the
selected repository license file, and any recognized project notice files. The
metadata records the package SPDX expression, license filenames, notice
filename, and immutable container image reference.

If any asset or release already exists for the tag, stop and investigate. Never
silently replace a published artifact. Correct the source on a new version.

## Verify downloaded assets

Download all release assets into one directory, then run:

```bash
sha256sum --check SHA256SUMS
release_version=$(jq --raw-output .version release-metadata.json)
unzip -t "neotorrent-alt-webui-v${release_version}.zip"
release_image=$(jq --raw-output .image release-metadata.json)
docker buildx imagetools inspect "${release_image}"
```

Confirm that `release_image` is the expected `ghcr.io/dotsml/neotorrent@sha256:…`
reference and compare it to the Container workflow summary and deployment
review. Prefer digest-pinned deployments over version tags.

## Rollback

Container deployments roll back to the previously reviewed image digest.
Native deployments roll back by pointing qBittorrent at the previous complete
Alternative WebUI directory, or by disabling Alternative WebUI through the
retained desktop/configuration recovery path. Never combine `public/` and
`private/` directories from different releases.
