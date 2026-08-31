import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import { createQbittorrentApi } from '@/api'
import App from '@/app/App.vue'
import { apiKey } from '@/app/providers/api'
import { router } from '@/app/router'
import { i18n } from '@/i18n'
import '@/styles/main.css'

async function bootstrap(): Promise<void> {
  if (__MOCK_API__) {
    const { worker } = await import('@/mocks/browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: './mockServiceWorker.js' }
    })
  }

  const app = createApp(App)
  const pinia = createPinia()
  const api = createQbittorrentApi({
    onAuthenticationExpired: () => window.dispatchEvent(new Event('neotorrent:auth-expired'))
  })
  app.use(pinia)
  app.use(router)
  app.use(i18n)
  app.provide(apiKey, api)
  app.mount('#app')

  const updateServiceWorker = registerSW({
    immediate: false,
    onNeedRefresh() {
      if (window.confirm('A new NeoTorrent version is available. Reload now?')) {
        void updateServiceWorker(true)
      }
    }
  })
}

void bootstrap()
