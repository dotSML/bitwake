/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

import type { DeploymentMode } from './config/deployment'

declare global {
  const __DEPLOYMENT_MODE__: DeploymentMode
  const __MOCK_BACKEND__: boolean

  interface ImportMetaEnv {
    readonly VITE_QBITTORRENT_URL?: string
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv
  }
}

export {}
