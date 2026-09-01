# License decision

## Current status

Bitwake is currently `UNLICENSED`. The repository contains no owner-selected
license file, and public visibility does not grant permission to copy, modify,
or redistribute the project.

This rename does not choose or imply MIT, Apache-2.0, GPL, AGPL, or any other
license. `package.json` must remain `UNLICENSED`, and container metadata must
continue to use `NOASSERTION` where a license expression is required until the
owner makes and documents a decision.

## Release gate

Public release remains blocked. The release verifier's `--require-license`
mode must continue to fail closed until all of the following are deliberately
aligned:

- an owner-selected repository license file;
- the reviewed SPDX expression in `package.json`;
- container OCI license metadata;
- Alternative WebUI archive license and notice contents; and
- any attribution or distribution obligations for the selected terms.

Dependency notices and dependency-license checks do not license Bitwake itself
and are not a substitute for the owner's decision. Do not weaken or bypass the
gate as part of the product rename.

## Owner action

The repository owner must select the license explicitly in a separate reviewed
change. Until then, documentation, build metadata, and release automation must
describe the project as unlicensed and must not claim that a public Bitwake
release is available.
