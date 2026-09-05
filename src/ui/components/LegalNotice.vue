<script setup lang="ts">
import { appIdentity } from '@/config/appIdentity'

const licenseUrl = `${appIdentity.repositoryUrl}/blob/main/LICENSE`
</script>

<template>
  <aside class="legal-notice" aria-label="Open source and license information">
    <span>Bitwake © 2026 Sten-Mark Laur · AGPL-3.0-or-later · no warranty</span>
    <a :href="appIdentity.repositoryUrl" target="_blank" rel="noopener noreferrer">Source</a>
    <a :href="licenseUrl" target="_blank" rel="noopener noreferrer">License</a>
  </aside>
</template>

<style scoped>
.legal-notice {
  position: fixed;
  z-index: 50;
  right: 10px;
  bottom: 8px;
  display: flex;
  max-width: calc(100vw - 20px);
  align-items: center;
  gap: 8px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 8px;
  background: rgb(var(--color-surface) / 0.94);
  color: rgb(var(--color-muted));
  padding: 5px 8px;
  font-size: 10px;
  line-height: 1.25;
  backdrop-filter: blur(8px);
}
.legal-notice span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.legal-notice a {
  flex: none;
  color: rgb(var(--color-accent));
  font-weight: 700;
  text-decoration: none;
}
.legal-notice a:hover,
.legal-notice a:focus-visible {
  text-decoration: underline;
}
@media (max-width: 640px) {
  .legal-notice {
    right: 6px;
    bottom: 6px;
    left: 6px;
    justify-content: center;
  }
  .legal-notice span {
    display: none;
  }
}
</style>
