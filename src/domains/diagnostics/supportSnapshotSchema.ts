export const supportSnapshotSchema = Object.freeze({
  id: 'bitwake.support-diagnostics',
  version: 1
})

/**
 * Parser policy: schema v1 is the first canonical Bitwake envelope. Importers
 * that still accept pre-rename exports may treat an unversioned object with a
 * `neotorrent` build property as legacy schema v0. New exports never emit that
 * alias, so the compatibility surface cannot become permanent by accident.
 */
export const legacySupportSnapshotPolicy = Object.freeze({
  version: 0,
  versioned: false,
  buildProperty: 'neotorrent'
})
