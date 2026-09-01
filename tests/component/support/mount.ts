import { createPinia, type Pinia } from 'pinia'
import { mount, type ComponentMountingOptions, type VueWrapper } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import { createApp, type Component } from 'vue'
import { createQbittorrentApi, type QbittorrentApi } from '@/api'
import { apiKey } from '@/app/providers/api'
import { i18n } from '@/i18n'

const EmptyRoute = { template: '<div />' }

export interface TestContext {
  api: QbittorrentApi
  pinia: Pinia
  router: Router
  run<T>(operation: () => T): T
}

export function createTestContext(): TestContext {
  const api = createQbittorrentApi()
  const pinia = createPinia()
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: EmptyRoute },
      { path: '/login', component: EmptyRoute },
      { path: '/torrents', component: EmptyRoute },
      { path: '/torrents/:hash/:tab?', component: EmptyRoute },
      { path: '/rss', component: EmptyRoute },
      { path: '/settings', component: EmptyRoute },
      { path: '/search', component: EmptyRoute },
      { path: '/creator', component: EmptyRoute },
      { path: '/statistics', component: EmptyRoute },
      { path: '/diagnostics', component: EmptyRoute },
      { path: '/logs', component: EmptyRoute }
    ]
  })
  const provider = createApp(EmptyRoute)
  provider.provide(apiKey, api)
  provider.use(pinia)
  return { api, pinia, router, run: <T>(operation: () => T) => provider.runWithContext(operation) }
}

export async function mountWithContext(
  component: Component,
  context: TestContext,
  options: ComponentMountingOptions<Component> = {}
): Promise<VueWrapper> {
  await context.router.push('/')
  await context.router.isReady()
  return mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [context.pinia, context.router, i18n, ...(options.global?.plugins ?? [])],
      provide: {
        [apiKey as symbol]: context.api,
        ...options.global?.provide
      }
    }
  })
}
