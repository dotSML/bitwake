<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type Component
} from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import ConnectionBanner from './ConnectionBanner.vue'
import MobileBottomNav from './MobileBottomNav.vue'
import { usePreferencesStore } from '@/stores/preferences'
import ToastRegion from '@/ui/components/ToastRegion.vue'
import PwaUpdateBanner from '@/ui/components/PwaUpdateBanner.vue'
import { MOBILE_MEDIA_QUERY, useMediaQuery } from '@/ui/composables/useMediaQuery'
import { useWindowPointerDrag } from '@/ui/composables/useWindowPointerDrag'
import { usePwaStore } from '@/stores/pwa'

const AddTorrentDialog = defineAsyncComponent(async () => {
  const module: unknown = await import('@/features/add-torrent/AddTorrentDialog.vue')
  return (module as { default: Component }).default
})

const preferences = usePreferencesStore()
const pwa = usePwaStore()
const route = useRoute()
const { t } = useI18n()
const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
const sidebarDrag = useWindowPointerDrag()
const addOpen = ref(false)
const mainElement = ref<HTMLElement | null>(null)
const routeAnnouncement = ref('')
const pendingFiles = ref<File[]>([])
const routeTitle = computed(() => t(String(route.meta.titleKey ?? 'app.name')))
const focusRouteKey = computed(() =>
  route.name === 'torrent-detail'
    ? `${String(route.name)}:${String(route.params.hash ?? '')}`
    : route.fullPath
)

function openAddTorrent(files?: File[]): void {
  pendingFiles.value = files ? [...files] : []
  addOpen.value = true
}

function updateAddOpen(open: boolean): void {
  addOpen.value = open
  if (!open) {
    pendingFiles.value = []
    pwa.trackUnsavedDialog('add-torrent', false)
  }
}

function updateAddDirty(dirty: boolean): void {
  pwa.trackUnsavedDialog('add-torrent', dirty)
}

function setSidebarWidth(width: number): void {
  preferences.patch({ sidebarWidth: Math.min(380, Math.max(220, Math.round(width))) })
}

function resizeSidebar(event: PointerEvent): void {
  event.preventDefault()
  const startX = event.clientX
  const startWidth = preferences.value.sidebarWidth
  sidebarDrag.start((moveEvent) => setSidebarWidth(startWidth + moveEvent.clientX - startX))
}

function resizeSidebarWithKeyboard(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  if (event.key === 'Home') setSidebarWidth(220)
  else if (event.key === 'End') setSidebarWidth(380)
  else setSidebarWidth(preferences.value.sidebarWidth + (event.key === 'ArrowRight' ? 10 : -10))
}

function focusMain(): void {
  // Hash history owns location.hash, so the skip link must move focus without
  // navigating to a fragment that the router would interpret as a route.
  mainElement.value?.focus({ preventScroll: false })
}

watch(
  [focusRouteKey, routeTitle],
  async () => {
    await nextTick()
    const title = routeTitle.value
    document.title = `${title} · ${t('app.name')}`
    routeAnnouncement.value = title
    mainElement.value?.focus({ preventScroll: true })
  },
  { immediate: true }
)

onBeforeUnmount(() => pwa.trackUnsavedDialog('add-torrent', false))
</script>

<template>
  <a class="skip-link" href="#main-content" @click.prevent="focusMain">{{
    t('a11y.skipToMain')
  }}</a>
  <div
    class="app-shell"
    :class="{ 'detail-route': route.name === 'torrent-detail' }"
    :style="{ '--sidebar-width': `${preferences.value.sidebarWidth}px` }"
    data-private-shell
  >
    <AppSidebar v-if="!isMobile" @add="openAddTorrent()" />
    <div
      v-if="!isMobile"
      class="sidebar-resizer"
      role="separator"
      tabindex="0"
      aria-label="Resize sidebar"
      aria-orientation="vertical"
      aria-valuemin="220"
      aria-valuemax="380"
      :aria-valuenow="preferences.value.sidebarWidth"
      @pointerdown="resizeSidebar"
      @keydown="resizeSidebarWithKeyboard"
    />
    <div class="shell-workspace">
      <header class="mobile-header">
        <span class="mobile-header-spacer" aria-hidden="true" />
        <div>
          <strong>{{ routeTitle }}</strong
          ><span>{{ t('app.name') }}</span>
        </div>
        <button
          class="icon-btn mobile-add"
          type="button"
          :aria-label="t('torrents.add')"
          @click="openAddTorrent()"
        >
          <Plus :size="22" aria-hidden="true" />
        </button>
      </header>
      <ConnectionBanner />
      <main id="main-content" ref="mainElement" class="route-content" tabindex="-1">
        <RouterView @add-torrent="openAddTorrent" />
      </main>
    </div>
    <MobileBottomNav v-if="isMobile" />
    <AddTorrentDialog
      v-if="addOpen"
      :open="addOpen"
      :initial-files="pendingFiles"
      @update:open="updateAddOpen"
      @update:dirty="updateAddDirty"
    />
    <ToastRegion />
    <PwaUpdateBanner />
    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {{ routeAnnouncement }}
    </p>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  width: 100%;
  height: 100%;
  background: rgb(var(--color-canvas));
}
.skip-link {
  position: fixed;
  z-index: 200;
  top: 8px;
  left: 8px;
  transform: translateY(-160%);
  border-radius: 8px;
  background: rgb(var(--color-surface-raised));
  color: rgb(var(--color-ink));
  padding: 9px 12px;
}
.skip-link:focus {
  transform: translateY(0);
}
.shell-workspace {
  display: flex;
  min-width: 0;
  height: 100%;
  flex: 1;
  flex-direction: column;
}
.sidebar-resizer {
  position: relative;
  z-index: 4;
  width: 24px;
  margin-right: -12px;
  margin-left: -12px;
  flex: 0 0 auto;
  cursor: col-resize;
  touch-action: none;
}
.sidebar-resizer::after {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 11px;
  width: 2px;
  background: transparent;
  content: '';
}
.sidebar-resizer:hover,
.sidebar-resizer:focus-visible {
  outline-offset: -2px;
}
.sidebar-resizer:hover::after,
.sidebar-resizer:focus-visible::after {
  background: rgb(var(--color-accent) / 0.55);
}
.route-content {
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}
.route-content:focus {
  outline: none;
}
.mobile-header {
  display: none;
}
@media (max-width: 1199px) {
  .sidebar-resizer {
    display: none;
  }
  .mobile-header {
    display: flex;
    height: 58px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid rgb(var(--color-line));
    background: rgb(var(--color-surface));
    padding: 0 10px;
  }
  .mobile-header > div {
    min-width: 0;
    text-align: center;
  }
  .mobile-header strong,
  .mobile-header span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mobile-header strong {
    font-size: 14px;
  }
  .mobile-header span {
    color: rgb(var(--color-muted));
    font-size: 10px;
  }
  .mobile-header-spacer,
  .mobile-add {
    display: grid;
    width: 44px;
    height: 44px;
    place-items: center;
    border: 0;
    border-radius: 9px;
    background: transparent;
  }
  .mobile-add {
    color: rgb(var(--color-accent));
  }
}
@media (max-width: 767px) {
  .detail-route .mobile-header {
    display: none;
  }
  .mobile-header {
    height: calc(56px + env(safe-area-inset-top));
    padding-top: env(safe-area-inset-top);
  }
  .route-content {
    padding-bottom: calc(62px + env(safe-area-inset-bottom));
  }
}
</style>
