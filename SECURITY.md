# Security Policy

Bitwake is an administrative interface to qBittorrent. A vulnerability can therefore affect authentication, private torrent data, filesystem operations, or the qBittorrent service itself. Please report suspected security issues privately.

See [docs/security.md](docs/security.md) for the threat model, implemented controls, known gaps, and deployment hardening guidance.

## Supported versions

Security reports are evaluated against:

| Target                    | Status    |
| ------------------------- | --------- |
| Current `main` branch     | Supported |
| Latest published release  | Supported |
| Older releases and forks  | Best effort only |

You may be asked to confirm an issue on `main` or upgrade from an older release.

## Report a vulnerability

Use GitHub private vulnerability reporting:

<https://github.com/dotSML/bitwake/security/advisories/new>

Include, where relevant:

- affected Bitwake release or commit;
- qBittorrent and Web API versions;
- standalone, Alternative WebUI, or development deployment mode;
- security impact and required conditions;
- minimal reproduction steps using synthetic data where possible;
- known mitigations or workarounds.

Do not include real credentials, cookies, tokens, tracker passkeys, torrent metadata, torrent contents, personal data, or private network details. Use redacted or synthetic values even in private reports whenever practical.

If GitHub private vulnerability reporting is unavailable, open a public issue titled `Private security report requested` and state only that you need a private reporting path. Do not include vulnerability details in that issue.

Please avoid public disclosure until the report has been assessed and a coordinated fix or disclosure plan exists.

## Security fixes and licensing

Security fixes are distributed under Bitwake's `AGPL-3.0-or-later` license. The license does not reduce the need for responsible disclosure before a fix is available.
