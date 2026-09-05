# Releasing Bitwake

Bitwake releases are deliberately staged. A Git tag alone does not create a GitHub Release. The container workflow verifies and publishes the tagged image first; the manual Release workflow then publishes the exact reviewed tag.

The workflow accepts `vMAJOR.MINOR.PATCH` tags and valid SemVer prerelease suffixes. `package.json` and the matching dated `CHANGELOG.md` section must agree exactly.

## Licensing gate

Bitwake is licensed under `AGPL-3.0-or-later`.

Release verification remains fail-closed and checks that:

- a repository license file is present;
- `package.json` declares a reviewed SPDX expression rather than `UNLICENSED`/`NOASSERTION`;
- distributable Alternative WebUI archives include the project license;
- release metadata records the license expression and included license files;
- container OCI license metadata is derived from the same package metadata.

See [license-decision.md](license-decision.md) for the licensing rationale and contributor/network-deployment implications.

## Prepare a release

1. Start from a clean, reviewed `main` commit.
2. Set `package.json` to the intended semantic version without a leading `v`.
3. Move release notes from `Unreleased` into a dated `## [<version>] - YYYY-MM-DD` section in `CHANGELOG.md`.
4. Confirm repository, package, container, archive, and public documentation licensing metadata agree.
5. Run the source/browser gates:

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

6. Build and verify the versioned Alternative WebUI archive:

   ```bash
   release_version=$(node -p "require('./package.json').version")
   SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)" corepack pnpm build:alt-webui
   corepack pnpm release:verify -- --tag "v${release_version}" \
     --require-license \
     --artifact "dist/bitwake-alt-webui-v${release_version}.zip"
   ```

`pnpm run licenses` inventories the production dependency graph and generates deterministic third-party notices. It is a mechanical compatibility gate, not legal advice.

## Tag and publish

Create a signed or annotated tag matching the package version:

```bash
git tag -s v0.1.0 -m "Bitwake v0.1.0"
git push origin v0.1.0
```

Then:

1. Wait for the **Container** workflow on that commit to pass.
2. Confirm CI, browser/PWA, performance, and qBittorrent compatibility evidence for the release revision.
3. Verify the versioned GHCR image resolves to the expected immutable manifest.
4. Run the **Release** workflow for that exact tag.

The release workflow re-verifies source and artifacts, builds the Alternative WebUI reproducibly, resolves the container image to a digest, verifies platform labels/provenance, and publishes a GitHub Release without overwriting existing artifacts.

The GitHub Release contains:

- `bitwake-alt-webui-v<version>.zip`;
- `bitwake-v<version>-checksums.txt`;
- `release-metadata.json`;
- release notes rendered from the matching changelog entry.

The ZIP includes `LICENSE` and deterministic `THIRD_PARTY_NOTICES.txt`.

## Verify downloaded assets

```bash
release_version=$(jq --raw-output .version release-metadata.json)
sha256sum --check "bitwake-v${release_version}-checksums.txt"
unzip -t "bitwake-alt-webui-v${release_version}.zip"
release_image=$(jq --raw-output .image release-metadata.json)
docker buildx imagetools inspect "${release_image}"
```

Prefer digest-pinned deployments over mutable tags.

## Rollback

Container deployments roll back to the previously reviewed image digest. Native deployments roll back by selecting the previous complete Alternative WebUI directory or disabling Alternative WebUI through the retained recovery path. Never combine `public/` and `private/` directories from different releases.
