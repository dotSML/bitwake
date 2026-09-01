/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

import type { DeploymentMode } from './config/deployment'

declare global {
  const __DEPLOYMENT_MODE__: DeploymentMode
  const __MOCK_BACKEND__: boolean
  const __NEOTORRENT_VERSION__: string
  const __NEOTORRENT_REVISION__: string
  const __NEOTORRENT_BUILD_DATE__: string

  interface ImportMetaEnv {
    readonly VITE_QBITTORRENT_URL?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
