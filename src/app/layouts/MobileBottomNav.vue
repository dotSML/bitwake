<script setup lang="ts">
import { Download, Ellipsis, Rss, Search } from '@lucide/vue'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
const { t } = useI18n()
const route = useRoute()
const activeSection = computed<'torrents' | 'search' | 'rss' | 'more'>(() => {
  if (route.name === 'torrents' || route.name === 'torrent-detail') return 'torrents'
  if (route.name === 'search') return 'search'
  if (route.name === 'rss') return 'rss'
  return 'more'
})
</script>

<template>
  <nav class="mobile-bottom-nav" aria-label="Primary">
    <RouterLink
      to="/torrents"
      :class="{ active: activeSection === 'torrents' }"
      :aria-current="
        route.name === 'torrents' ? 'page' : activeSection === 'torrents' ? 'true' : undefined
      "
      ><Download :size="21" /><span>{{ t('nav.torrents') }}</span></RouterLink
    >
    <RouterLink
      to="/search"
      :class="{ active: activeSection === 'search' }"
      :aria-current="route.name === 'search' ? 'page' : undefined"
      ><Search :size="21" /><span>{{ t('nav.search') }}</span></RouterLink
    >
    <RouterLink
      to="/rss"
      :class="{ active: activeSection === 'rss' }"
      :aria-current="route.name === 'rss' ? 'page' : undefined"
      ><Rss :size="21" /><span>{{ t('nav.rss') }}</span></RouterLink
    >
    <RouterLink
      to="/more"
      :class="{ active: activeSection === 'more' }"
      :aria-current="route.name === 'more' ? 'page' : activeSection === 'more' ? 'true' : undefined"
      ><Ellipsis :size="21" /><span>{{ t('nav.more') }}</span></RouterLink
    >
  </nav>
</template>

<style scoped>
.mobile-bottom-nav {
  display: none;
}
@media (max-width: 767px) {
  .mobile-bottom-nav {
    position: fixed;
    z-index: 40;
    right: 0;
    bottom: 0;
    left: 0;
    display: grid;
    height: calc(62px + env(safe-area-inset-bottom));
    grid-template-columns: repeat(4, 1fr);
    border-top: 1px solid rgb(var(--color-line));
    background: rgb(var(--color-surface) / 0.96);
    padding-bottom: env(safe-area-inset-bottom);
    backdrop-filter: blur(12px);
  }
  .mobile-bottom-nav a {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 3px;
    color: rgb(var(--color-muted));
    font-size: 10px;
    text-decoration: none;
  }
  .mobile-bottom-nav a.active {
    color: rgb(var(--color-accent));
  }
}
</style>
