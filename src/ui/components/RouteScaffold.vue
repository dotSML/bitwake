<script setup lang="ts">
import { computed, useSlots } from 'vue'

defineProps<{ title: string; description?: string }>()

// Callers only provide this slot when they have a real, visible action.  Keeping
// the wrapper conditional means a route without actions does not acquire a
// mostly-empty header at compact breakpoints.
const slots = useSlots()
const hasActions = computed(() => Boolean(slots.actions))
</script>

<template>
  <div class="route-page">
    <header class="route-header" :class="{ 'has-actions': hasActions }">
      <div class="route-heading">
        <h1>{{ title }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
      <div v-if="hasActions" class="route-actions"><slot name="actions" /></div>
    </header>
    <div class="route-body"><slot /></div>
  </div>
</template>

<style scoped>
.route-page {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  background: rgb(var(--color-canvas));
}
.route-header {
  display: flex;
  min-height: 68px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  padding: 11px 20px;
}
.route-heading {
  min-width: 0;
}
.route-actions {
  display: flex;
  min-width: 0;
  flex: 0 1 auto;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.route-header h1 {
  margin: 0;
  font-size: 18px;
  letter-spacing: -0.01em;
}
.route-header p {
  margin: 2px 0 0;
  color: rgb(var(--color-muted));
  font-size: 12px;
}
.route-body {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 18px 20px 30px;
}
@media (max-width: 1199px) {
  .route-header {
    display: block;
    min-height: 0;
    border: 0;
    background: transparent;
    padding: 0;
  }
  .route-heading {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  .route-actions {
    width: 100%;
    min-height: 0;
    justify-content: flex-start;
    border-bottom: 1px solid rgb(var(--color-line));
    background: rgb(var(--color-surface));
    padding: 8px 14px;
  }
  .route-body {
    padding: 14px;
  }
}
@media (max-width: 767px) {
  .route-body {
    padding: 10px 10px 24px;
  }
}
</style>
