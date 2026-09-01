<script setup lang="ts">
import { AlertTriangle, CircleAlert, Info } from 'lucide-vue-next'
import type { MediaPlacementWarning } from '../domain/types'
import { replaceControlCharacters } from '../domain/textSafety'

defineProps<{ warnings: MediaPlacementWarning[] }>()
const acknowledged = defineModel<string[]>('acknowledged', { required: true })

function safeWarningText(value: string): string {
  return replaceControlCharacters(value)
}

function setAcknowledged(id: string, checked: boolean): void {
  const current = new Set(acknowledged.value)
  if (checked) current.add(id)
  else current.delete(id)
  acknowledged.value = [...current]
}
</script>

<template>
  <div v-if="warnings.length" class="warnings" aria-label="Media placement warnings">
    <article
      v-for="warning in warnings"
      :key="warning.id"
      :class="['warning-card', warning.severity]"
      :role="warning.severity === 'warning' ? 'alert' : 'note'"
    >
      <AlertTriangle v-if="warning.acknowledgementRequired" :size="18" />
      <CircleAlert v-else-if="warning.severity === 'warning'" :size="18" />
      <Info v-else :size="18" />
      <div>
        <strong>{{ safeWarningText(warning.title) }}</strong>
        <p>{{ safeWarningText(warning.message) }}</p>
        <p v-if="warning.saferPath" class="safer-path">
          Safer example: <code>{{ safeWarningText(warning.saferPath) }}</code>
        </p>
        <label v-if="warning.acknowledgementRequired" class="warning-acknowledgement">
          <input
            type="checkbox"
            :checked="acknowledged.includes(warning.id)"
            @change="setAcknowledged(warning.id, ($event.target as HTMLInputElement).checked)"
          />
          <span>I understand and want to use this custom placement.</span>
        </label>
      </div>
    </article>
  </div>
</template>

<style scoped>
.warnings {
  display: grid;
  gap: 7px;
}
.warning-card {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr);
  gap: 8px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 8px;
  background: rgb(var(--color-surface-muted));
  padding: 9px 10px;
  font-size: 11px;
  line-height: 1.45;
}
.warning-card.warning {
  border-color: rgb(var(--color-warning-foreground) / 0.7);
  background: rgb(var(--color-warning) / 0.1);
}
.warning-card > svg {
  margin-top: 1px;
  color: rgb(var(--color-warning-foreground));
}
.warning-card.notice > svg {
  color: rgb(var(--color-muted));
}
strong,
p {
  display: block;
  margin: 0;
  unicode-bidi: plaintext;
}
p {
  margin-top: 2px;
}
.safer-path code {
  overflow-wrap: anywhere;
  unicode-bidi: plaintext;
}
.warning-acknowledgement {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin-top: 8px;
  font-weight: 700;
}
.warning-acknowledgement input {
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  accent-color: rgb(var(--color-accent));
}
</style>
