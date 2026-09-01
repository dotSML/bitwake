import { fileURLToPath, URL } from 'node:url'
import { rm } from 'node:fs/promises'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { DeploymentMode } from './src/config/deployment'

function deploymentModeForViteMode(mode: string): DeploymentMode {
  switch (mode) {
    case 'alt-public':
    case 'alt-public-e2e':
      return 'alternative-public'
    case 'alt-private':
    case 'alt-private-e2e':
      return 'alternative-private'
    case 'mock':
      return 'mock'
    case 'development':
    case 'production':
    case 'standalone':
    case 'standalone-e2e':
      return 'standalone'
    default:
      throw new Error(`Unsupported Vite deployment mode: ${mode}`)
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.VITE_QBITTORRENT_URL
  const deploymentMode = deploymentModeForViteMode(mode)
  const alternativePublic = deploymentMode === 'alternative-public'
  const alternativePrivate = deploymentMode === 'alternative-private'
  const alternativeBuild = alternativePublic || alternativePrivate
  const mockBackendEnabled =
    deploymentMode === 'mock' || mode === 'standalone-e2e' || mode === 'alt-private-e2e'
  const outputDirectory = alternativePublic
    ? 'dist/alt-stage/public'
    : alternativePrivate
      ? 'dist/alt-stage/private'
      : 'dist/standalone'
  const assetsDirectory = alternativePublic
    ? 'login-assets'
    : alternativePrivate
      ? 'app-assets'
      : 'assets'

  return {
    base: './',
    plugins: [
      vue(),
      VitePWA({
        disable: alternativePublic,
        registerType: 'prompt',
        includeAssets: [
          'icons/neotorrent.svg',
          'icons/neotorrent-192.png',
          'icons/neotorrent-512.png'
        ],
        manifest: {
          name: 'NeoTorrent',
          short_name: 'NeoTorrent',
          description: 'A focused, responsive qBittorrent WebUI',
          theme_color: '#111827',
          background_color: '#0b0f17',
          display: 'standalone',
          start_url: './',
          scope: './',
          icons: [
            {
              src: 'icons/neotorrent-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: 'icons/neotorrent-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: 'icons/neotorrent.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          sourcemap: false,
          navigateFallback: null,
          globPatterns: ['**/*.{js,css,svg,png,woff2}'],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.includes('/api/'),
              handler: 'NetworkOnly',
              method: 'GET'
            },
            {
              urlPattern: ({ url }) => url.pathname.includes('/api/'),
              handler: 'NetworkOnly',
              method: 'POST'
            }
          ],
          cleanupOutdatedCaches: true
        },
        // MSW owns the development service-worker scope. Production builds still
        // generate the PWA worker; enabling both workers in dev breaks refreshes.
        devOptions: { enabled: false }
      }),
      {
        name: 'remove-production-mock-worker',
        async closeBundle() {
          if (mode !== 'mock') {
            await rm(new URL(`./${outputDirectory}/mockServiceWorker.js`, import.meta.url), {
              force: true
            })
          }
        }
      }
    ],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
    },
    define: {
      __DEPLOYMENT_MODE__: JSON.stringify(deploymentMode),
      __MOCK_BACKEND__: JSON.stringify(mockBackendEnabled)
    },
    ...(proxyTarget
      ? {
          server: {
            proxy: {
              '/api': {
                target: proxyTarget,
                changeOrigin: true,
                secure: false
              }
            }
          }
        }
      : {}),
    build: {
      outDir: outputDirectory,
      assetsDir: assetsDirectory,
      emptyOutDir: true,
      sourcemap: false,
      target: 'es2022',
      ...(alternativeBuild
        ? {
            rollupOptions: {
              input: fileURLToPath(
                new URL(
                  alternativePublic ? './public-entry.html' : './private-entry.html',
                  import.meta.url
                )
              )
            }
          }
        : {})
    }
  }
})
