<script setup lang="ts">
import { appIdentity } from '@/config/appIdentity'

const licenseUrl = `${appIdentity.repositoryUrl}/blob/main/LICENSE`
</script>

<template>
  <aside class="legal-notice" aria-label="Open source and license information">
    <div>
      <strong>Bitwake is open source</strong>
      <span>© 2026 Sten-Mark Laur · AGPL-3.0-or-later · no warranty</span>
    </div>
    <nav aria-label="Bitwake source and license links">
      <a :href="appIdentity.repositoryUrl" target="_blank" rel="noopener noreferrer">Source</a>
      <a :href="licenseUrl" target="_blank" rel="noopener noreferrer">License</a>
    </nav>
  </aside>
</template>

<style scoped>
.legal-notice {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: rgb(var(--color-muted));
  padding: 11px 13px;
}
.legal-notice > div {
  min-width: 0;
}
.legal-notice strong,
.legal-notice span {
  display: block;
}
.legal-notice strong {
  color: rgb(var(--color-ink));
  font-size: 13px;
}
.legal-notice span {
  margin-top: 2px;
  font-size: 10px;
  line-height: 1.35;
}
.legal-notice nav {
  display: flex;
  flex: none;
  gap: 10px;
}
.legal-notice a {
  color: rgb(var(--color-accent));
  font-size: 11px;
  font-weight: 700;
  text-decoration: none;
}
.legal-notice a:hover,
.legal-notice a:focus-visible {
  text-decoration: underline;
}
@media (max-width: 420px) {
  .legal-notice {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
