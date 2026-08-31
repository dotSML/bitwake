import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createQbittorrentApi } from '@/api'
import PublicApp from '@/app/PublicApp.vue'
import { apiKey } from '@/app/providers/api'
import { i18n } from '@/i18n'
import '@/styles/main.css'

const app = createApp(PublicApp)
const router = createRouter({ history: createMemoryHistory(), routes: [] })
const api = createQbittorrentApi()
app.use(createPinia())
app.use(router)
app.use(i18n)
app.provide(apiKey, api)
app.mount('#app')
