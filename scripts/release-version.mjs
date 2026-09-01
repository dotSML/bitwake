const releaseVersionPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u

/** Strict SemVer used for releases, intentionally excluding build metadata. */
export function isReleaseVersion(value) {
  if (typeof value !== 'string') return false
  const match = releaseVersionPattern.exec(value)
  if (!match) return false
  const prerelease = match[4]
  return (
    !prerelease ||
    prerelease
      .split('.')
      .every(
        (identifier) =>
          !/^\d+$/u.test(identifier) || identifier === '0' || !identifier.startsWith('0')
      )
  )
}
