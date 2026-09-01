import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/torrents' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/features/authentication/LoginView.vue'),
      meta: { public: true, titleKey: 'routes.signIn' }
    },
    {
      path: '/torrents',
      name: 'torrents',
      component: () => import('@/features/torrent-list/TorrentWorkspace.vue'),
      meta: { titleKey: 'nav.torrents' }
    },
    {
      path: '/torrents/:hash/:tab?',
      name: 'torrent-detail',
      component: () => import('@/features/torrent-details/MobileTorrentDetail.vue'),
      meta: { titleKey: 'routes.torrentDetails' }
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/features/search/SearchView.vue'),
      meta: { titleKey: 'nav.search' }
    },
    {
      path: '/rss',
      name: 'rss',
      component: () => import('@/features/rss/RssView.vue'),
      meta: { titleKey: 'nav.rss' }
    },
    {
      path: '/creator',
      name: 'creator',
      component: () => import('@/features/torrent-creator/TorrentCreatorView.vue'),
      meta: { titleKey: 'nav.creator' }
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/features/logs/LogsView.vue'),
      meta: { titleKey: 'nav.logs' }
    },
    {
      path: '/statistics',
      name: 'statistics',
      component: () => import('@/features/statistics/StatisticsView.vue'),
      meta: { titleKey: 'nav.statistics' }
    },
    {
      path: '/diagnostics',
      name: 'diagnostics',
      component: () => import('@/features/diagnostics/DiagnosticsView.vue'),
      meta: { titleKey: 'nav.diagnostics' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/features/settings/SettingsView.vue'),
      meta: { titleKey: 'nav.settings' }
    },
    {
      path: '/more',
      name: 'more',
      component: () => import('@/features/more/MoreView.vue'),
      meta: { titleKey: 'nav.more' }
    },
    { path: '/:pathMatch(.*)*', redirect: '/torrents' }
  ]
})
