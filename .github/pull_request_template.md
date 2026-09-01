## Summary

Describe the problem and the focused change that solves it. Link the relevant
issue when one exists.

## Verification

List the exact commands run and their results. Include manual scenarios,
browsers, qBittorrent/Web API versions, and deployment modes when relevant.

```text
corepack pnpm format:check
corepack pnpm run ci
```

## Checklist

- [ ] The change is focused, and compatibility implications are described.
- [ ] Tests cover new or changed behavior, including a regression test for a
      bug fix; no failing test was bypassed, skipped, weakened, or removed.
- [ ] `corepack pnpm format:check` and `corepack pnpm run ci` pass, or the reason a
      check could not run is documented above.
- [ ] Relevant browser, build, container, or proxy checks were run for the
      affected area.
- [ ] User, deployment, API-capability, feature-parity, and security
      documentation was updated where needed, or the summary explains why no
      documentation change is needed.
- [ ] Security and privacy boundaries were reviewed; fixtures, logs,
      screenshots, and commits contain no credentials, cookies, tokens,
      private torrent data, tracker passkeys, or private network details.
- [ ] UI changes remain keyboard-usable and include appropriate accessible
      names, focus behavior, and responsive coverage.
