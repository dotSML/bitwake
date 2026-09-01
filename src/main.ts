import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import { createQbittorrentApi } from '@/api'
import App from '@/app/App.vue'
import { apiKey } from '@/app/providers/api'
import { router } from '@/app/router'
import { i18n, readBootstrapLocalePreference, setApplicationLocale } from '@/i18n'
import { useOperationsHistoryStore } from '@/stores/operationsHistory'
import { usePwaStore } from '@/stores/pwa'
import { appEvents } from '@/config/appIdentity'
import '@/styles/main.css'

async function bootstrap(): Promise<void> {
  setApplicationLocale(readBootstrapLocalePreference())
  if (__MOCK_BACKEND__) {
    const { worker } = await import('@/mocks/browser')
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: './mockServiceWorker.js' }
    })
  }

  const app = createApp(App)
  const pinia = createPinia()
  const operationsHistory = useOperationsHistoryStore(pinia)
  const pwa = usePwaStore(pinia)
  pwa.initialize()
  const api = createQbittorrentApi({
    onAuthenticationExpired: () => window.dispatchEvent(new Event(appEvents.authenticationExpired)),
    onOperation: operationsHistory.record
  })
  app.use(pinia)
  app.use(router)
  app.use(i18n)
  app.provide(apiKey, api)
  await router.isReady()
  app.mount('#app')

  const updateServiceWorker = registerSW({
    immediate: false,
    onNeedRefresh: pwa.markUpdateAvailable,
    onOfflineReady: pwa.markOfflineReady
  })
  pwa.setUpdater(updateServiceWorker)
}

void bootstrap()
