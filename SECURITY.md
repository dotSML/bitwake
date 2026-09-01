# Security Policy

Bitwake is an administrative interface to qBittorrent. A vulnerability can
therefore affect authentication, private torrent data, filesystem operations,
or the qBittorrent service itself. Please report suspected security issues
privately.

See [docs/security.md](docs/security.md) for the threat model, implemented
controls, known gaps, and deployment hardening guidance.

## Supported versions

Security reports are evaluated against these targets:

| Target                         | Status                                      |
| ------------------------------ | ------------------------------------------- |
| Current `main` branch          | Supported                                   |
| Published releases             | None yet; publication is blocked by license |
| Older releases and other forks | Not routinely supported                     |

You may be asked to confirm an issue on `main` or upgrade from an older
release. Support for `main` does not imply a release schedule or stability
guarantee.

## Report a vulnerability

Use GitHub's private vulnerability reporting form:

<https://github.com/dotSML/bitwake/security/advisories/new>

The repository may still be hosted under its former NeoTorrent name while the
rename branch is reviewed; GitHub repository redirects are expected after the
owner performs the separate repository cutover.

Include, where relevant:

- the affected Bitwake release or commit;
- qBittorrent and Web API versions;
- standalone, Alternative WebUI, or development deployment mode;
- the security impact and conditions required to reproduce it;
- minimal reproduction steps or a proof of concept using synthetic data;
- any known mitigation or workaround.

Bitwake's **Diagnostics and System Health** route can copy or download a
minimized support snapshot. It excludes torrent names, hashes, request bodies,
query strings, credentials, cookies, and Media Placement paths, but still
contains browser/build/version and operation-status metadata. Review and redact
it for your environment before attaching it.

Do not include real credentials, cookies, tokens, tracker passkeys, torrent
metadata, torrent contents, personal data, or private network details. Use
redacted or synthetic values even in a private report whenever possible.

If GitHub private vulnerability reporting is unavailable, open a
[new public issue](https://github.com/dotSML/bitwake/issues/new) with a title
such as `Private security report requested`. State only that the private form
is unavailable and that you need a private reporting path. Do **not** identify
the affected feature, impact, reproduction steps, or any other vulnerability
detail in that public issue.

Please avoid public issues, discussions, pull requests, or disclosures that
contain vulnerability details while the report is being assessed.
