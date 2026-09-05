# Licensing decision

## Decision

Bitwake is licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`).

The project is a network-interactive, self-hosted web application. The AGPL was selected so users may run, study, modify, and redistribute Bitwake while improvements to modified network-deployed versions remain available to the users of those versions.

## Repository and package metadata

The licensing surface is intentionally aligned:

- root `LICENSE` notice: AGPL-3.0-or-later;
- `package.json`: `AGPL-3.0-or-later`;
- container OCI license metadata: derived from `package.json`;
- Alternative WebUI archives: include the repository license automatically;
- release metadata: records the package SPDX expression and included license files;
- UI: exposes Source and License links plus a no-warranty notice.

`private: true` remains in `package.json` only to prevent accidental npm publication. It does not make the repository proprietary and does not change the repository license.

## Contributor terms

Unless a contribution explicitly states otherwise and is accepted under compatible terms, contributions to Bitwake are submitted under the same `AGPL-3.0-or-later` license.

Contributors must have the right to submit their work and must not copy incompatible proprietary code, confidential material, or code whose license cannot be combined with Bitwake.

Bitwake currently uses no Contributor License Agreement (CLA). Contributors retain copyright in their contributions while licensing them under the project license.

## Network deployments

Section 13 of the AGPL applies to modified versions used interactively over a network. Operators of modified deployments must provide users interacting with that version an opportunity to receive the corresponding source code of the modified version at no charge.

Bitwake includes visible Source and License links in its UI. Downstream operators who modify Bitwake must ensure those links or an equivalent mechanism point users to the corresponding source for the version actually being served.

## Third-party software

Bitwake's dependencies remain under their own licenses. The build inventories the complete production dependency graph, rejects unreviewed production-license expressions, and generates deterministic `THIRD_PARTY_NOTICES.txt` output for distributable builds.

This project-level license does not relicense independent third-party dependencies.

## Release gate

The release verifier remains fail-closed. It requires a repository license file and a non-placeholder SPDX expression, verifies that distributable archives contain the project license, and records the license in release metadata.

The license gate is now intentionally satisfiable rather than permanently blocking releases.
