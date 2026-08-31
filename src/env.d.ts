/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __MOCK_API__: boolean

interface ImportMetaEnv {
  readonly VITE_QBITTORRENT_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
