import { deploymentMode } from './deployment'

export const neotorrentBuild = Object.freeze({
  version: __NEOTORRENT_VERSION__,
  revision: __NEOTORRENT_REVISION__,
  created: __NEOTORRENT_BUILD_DATE__,
  deploymentMode
})
