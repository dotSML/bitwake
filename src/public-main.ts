import { createApp } from 'vue'
import type { LoginCredentials } from '@/api/auth/authApi'
import { createAuthApi } from '@/api/auth/authApi'
import { HttpClient } from '@/api/core/httpClient'
import PublicApp from '@/app/PublicApp.vue'
import { i18n } from '@/i18n'
import '@/styles/main.css'

const auth = createAuthApi(new HttpClient())

async function authenticate(credentials: LoginCredentials): Promise<void> {
  await auth.login(credentials)
  window.location.reload()
}

const app = createApp(PublicApp, { authenticate })
app.use(i18n)
app.mount('#app')
