import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/torrents' },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/features/authentication/LoginView.vue'),
      meta: { public: true, title: 'Sign in' }
    },
    {
      path: '/torrents',
      name: 'torrents',
      component: () => import('@/features/torrent-list/TorrentWorkspace.vue'),
      meta: { title: 'Torrents' }
    },
    {
      path: '/torrents/:hash/:tab?',
      name: 'torrent-detail',
      component: () => import('@/features/torrent-details/MobileTorrentDetail.vue'),
      meta: { title: 'Torrent details' }
    },
    {
      path: '/search',
      name: 'search',
      component: () => import('@/features/search/SearchView.vue'),
      meta: { title: 'Search' }
    },
    {
      path: '/rss',
      name: 'rss',
      component: () => import('@/features/rss/RssView.vue'),
      meta: { title: 'RSS' }
    },
    {
      path: '/creator',
      name: 'creator',
      component: () => import('@/features/torrent-creator/TorrentCreatorView.vue'),
      meta: { title: 'Torrent Creator' }
    },
    {
      path: '/logs',
      name: 'logs',
      component: () => import('@/features/logs/LogsView.vue'),
      meta: { title: 'Logs' }
    },
    {
      path: '/statistics',
      name: 'statistics',
      component: () => import('@/features/statistics/StatisticsView.vue'),
      meta: { title: 'Statistics' }
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/features/settings/SettingsView.vue'),
      meta: { title: 'Settings' }
    },
    {
      path: '/more',
      name: 'more',
      component: () => import('@/features/more/MoreView.vue'),
      meta: { title: 'More' }
    },
    { path: '/:pathMatch(.*)*', redirect: '/torrents' }
  ]
})
