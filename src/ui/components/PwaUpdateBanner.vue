<script setup lang="ts">
import { Download, RefreshCw, X } from 'lucide-vue-next'
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePwaStore } from '@/stores/pwa'

const pwa = usePwaStore()
const { t } = useI18n()
const banner = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

watch(
  () => pwa.updateAvailable,
  (available) => {
    if (!available) return
    const active = document.activeElement
    if (active instanceof HTMLElement && active !== document.body) returnFocus = active
  },
  { immediate: true }
)

function rememberReturnFocus(event: FocusEvent): void {
  const previous = event.relatedTarget
  if (previous instanceof HTMLElement && !banner.value?.contains(previous)) returnFocus = previous
}

async function dismissUpdate(): Promise<void> {
  const restoreFocus = banner.value?.contains(document.activeElement) === true
  pwa.dismissUpdate()
  await nextTick()
  if (restoreFocus) {
    const target = returnFocus?.isConnected ? returnFocus : document.getElementById('main-content')
    target?.focus()
  }
  returnFocus = null
}
</script>

<template>
  <aside
    v-if="pwa.updateAvailable"
    ref="banner"
    class="pwa-update"
    role="status"
    aria-live="polite"
    @focusin="rememberReturnFocus"
  >
    <Download :size="18" aria-hidden="true" />
    <span
      ><strong>{{ t('pwa.updateAvailable') }}</strong
      ><small>{{ t('pwa.updateHint') }}</small></span
    >
    <button
      class="btn btn-primary"
      type="button"
      :disabled="pwa.applyingUpdate"
      @click="pwa.applyUpdate"
    >
      <RefreshCw :class="{ spin: pwa.applyingUpdate }" :size="15" />{{
        pwa.applyingUpdate ? t('pwa.updating') : t('pwa.reload')
      }}
    </button>
    <button class="dismiss" type="button" :aria-label="t('pwa.dismiss')" @click="dismissUpdate">
      <X :size="17" />
    </button>
  </aside>
</template>

<style scoped>
.pwa-update {
  position: fixed;
  z-index: 95;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(16px, env(safe-area-inset-bottom));
  display: flex;
  width: min(560px, calc(100vw - 28px));
  align-items: center;
  gap: 11px;
  border: 1px solid rgb(var(--color-line-strong));
  border-left: 4px solid rgb(var(--color-accent));
  border-radius: 11px;
  background: rgb(var(--color-surface-raised));
  box-shadow: var(--shadow-float);
  padding: 10px 10px 10px 13px;
}
.pwa-update > svg {
  flex: 0 0 auto;
  color: rgb(var(--color-accent));
}
.pwa-update > span {
  min-width: 0;
  flex: 1;
}
.pwa-update strong,
.pwa-update small {
  display: block;
}
.pwa-update small {
  color: rgb(var(--color-muted));
}
.dismiss {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 767px) {
  .pwa-update {
    right: 10px;
    bottom: calc(72px + env(safe-area-inset-bottom));
    flex-wrap: wrap;
  }
  .pwa-update > span {
    min-width: 180px;
  }
  .pwa-update .btn {
    order: 4;
    width: 100%;
  }
  .pwa-update .dismiss {
    width: 44px;
    height: 44px;
  }
}
</style>
