import { deploymentMode } from './deployment'

export const bitwakeBuild = Object.freeze({
  version: __BITWAKE_VERSION__,
  revision: __BITWAKE_REVISION__,
  created: __BITWAKE_BUILD_DATE__,
  deploymentMode
})
