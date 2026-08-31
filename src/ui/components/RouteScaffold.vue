<script setup lang="ts">
defineProps<{ title: string; description?: string }>()
</script>

<template>
  <div class="route-page">
    <header class="route-header">
      <div>
        <h1>{{ title }}</h1>
        <p v-if="description">{{ description }}</p>
      </div>
      <slot name="actions" />
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
    display: none;
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
