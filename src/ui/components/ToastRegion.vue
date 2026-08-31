<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { useNotificationsStore } from '@/stores/notifications'

const notifications = useNotificationsStore()
</script>

<template>
  <div class="toast-region" role="region" aria-live="polite" aria-label="Notifications">
    <TransitionGroup name="toast">
      <div
        v-for="item in notifications.items"
        :key="item.id"
        class="toast"
        :class="`toast-${item.tone}`"
        role="status"
      >
        <span>{{ item.message }}</span>
        <button
          class="toast-close"
          type="button"
          aria-label="Dismiss"
          @click="notifications.remove(item.id)"
        >
          <X :size="16" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-region {
  position: fixed;
  z-index: 100;
  right: max(18px, env(safe-area-inset-right));
  bottom: max(18px, env(safe-area-inset-bottom));
  display: grid;
  width: min(390px, calc(100vw - 28px));
  gap: 8px;
  pointer-events: none;
}
.toast {
  display: flex;
  min-height: 46px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid rgb(var(--color-line-strong));
  border-left: 3px solid rgb(var(--color-accent));
  border-radius: 10px;
  background: rgb(var(--color-surface-raised));
  box-shadow: var(--shadow-float);
  padding: 10px 10px 10px 13px;
  pointer-events: auto;
}
.toast-success {
  border-left-color: rgb(var(--color-positive));
}
.toast-error {
  border-left-color: rgb(var(--color-danger));
}
.toast-warning {
  border-left-color: rgb(var(--color-warning));
}
.toast-close {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
.toast-close:hover {
  background: rgb(var(--color-surface-muted));
}
.toast-enter-active,
.toast-leave-active {
  transition: 140ms ease;
}
.toast-enter-from,
.toast-leave-to {
  transform: translateY(8px);
  opacity: 0;
}
@media (max-width: 767px) {
  .toast-region {
    right: 14px;
    bottom: calc(76px + env(safe-area-inset-bottom));
  }
}
</style>
