<script setup lang="ts">
import { X } from 'lucide-vue-next'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    wide?: boolean
    fullscreenMobile?: boolean
  }>(),
  { description: '', wide: false, fullscreenMobile: false }
)

const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

<template>
  <DialogRoot :open="open" @update:open="emit('update:open', $event)">
    <DialogPortal>
      <DialogOverlay class="dialog-overlay" />
      <DialogContent
        class="dialog-content"
        :class="{ 'dialog-wide': wide, 'dialog-fullscreen-mobile': fullscreenMobile }"
        @escape-key-down.stop
      >
        <header class="dialog-header">
          <div>
            <DialogTitle class="dialog-title">{{ title }}</DialogTitle>
            <DialogDescription v-if="description" class="dialog-description">
              {{ description }}
            </DialogDescription>
          </div>
          <DialogClose class="dialog-close" aria-label="Close dialog">
            <X :size="20" aria-hidden="true" />
          </DialogClose>
        </header>
        <div class="dialog-body"><slot /></div>
        <footer v-if="$slots.footer" class="dialog-footer"><slot name="footer" /></footer>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style>
.dialog-overlay {
  position: fixed;
  z-index: 80;
  inset: 0;
  background: rgb(2 6 23 / 0.58);
  animation: fade-in 120ms ease;
}
.dialog-content {
  position: fixed;
  z-index: 81;
  top: 50%;
  left: 50%;
  display: flex;
  width: min(560px, calc(100vw - 32px));
  max-height: min(780px, calc(100vh - 40px));
  flex-direction: column;
  transform: translate(-50%, -50%);
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 12px;
  background: rgb(var(--color-surface-raised));
  box-shadow: var(--shadow-float);
  overflow: hidden;
  animation: dialog-in 140ms ease;
}
.dialog-wide {
  width: min(850px, calc(100vw - 32px));
}
.dialog-header {
  display: flex;
  min-height: 66px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 16px 18px;
}
.dialog-title {
  margin: 0;
  font-size: 18px;
  font-weight: 720;
}
.dialog-description {
  margin: 3px 0 0;
  color: rgb(var(--color-muted));
  font-size: 13px;
}
.dialog-close {
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
.dialog-close:hover {
  background: rgb(var(--color-surface-muted));
}
.dialog-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 18px;
}
.dialog-footer {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid rgb(var(--color-line));
  padding: 12px 18px;
}
@keyframes fade-in {
  from {
    opacity: 0;
  }
}
@keyframes dialog-in {
  from {
    transform: translate(-50%, calc(-50% + 8px));
    opacity: 0;
  }
}
@media (max-width: 767px) {
  .dialog-fullscreen-mobile {
    top: 0;
    left: 0;
    width: 100%;
    height: 100dvh;
    max-height: none;
    transform: none;
    border: 0;
    border-radius: 0;
    padding-top: env(safe-area-inset-top);
    animation: sheet-in 160ms ease;
  }
  .dialog-fullscreen-mobile .dialog-footer {
    padding-bottom: max(12px, env(safe-area-inset-bottom));
  }
  @keyframes sheet-in {
    from {
      transform: translateY(16px);
      opacity: 0;
    }
  }
}
</style>
