<script setup lang="ts">
import { Download, Ellipsis, Rss, Search } from '@lucide/vue'
import { useI18n } from 'vue-i18n'
const { t } = useI18n()
</script>

<template>
  <nav class="mobile-bottom-nav" aria-label="Primary">
    <RouterLink to="/torrents"
      ><Download :size="21" /><span>{{ t('nav.torrents') }}</span></RouterLink
    >
    <RouterLink to="/search"
      ><Search :size="21" /><span>{{ t('nav.search') }}</span></RouterLink
    >
    <RouterLink to="/rss"
      ><Rss :size="21" /><span>{{ t('nav.rss') }}</span></RouterLink
    >
    <RouterLink to="/more"
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
  .mobile-bottom-nav a.router-link-active {
    color: rgb(var(--color-accent));
  }
}
</style>
