<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import AppDialog from '@/ui/primitives/AppDialog.vue'

const props = defineProps<{ open: boolean; hashes: string[] }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const api = useApi()
const torrents = useTorrentsStore()
const notifications = useNotificationsStore()
const deleteFiles = ref(false)
const working = ref(false)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (open) {
      deleteFiles.value = false
      error.value = null
    }
  }
)

async function confirm(): Promise<void> {
  if (!props.hashes.length || working.value) return
  error.value = null
  const missingCount = props.hashes.filter((hash) => !torrents.byHash.has(hash)).length
  if (missingCount) {
    error.value =
      missingCount === props.hashes.length
        ? 'The selected torrents no longer exist. Close this dialog and review the current list.'
        : 'One or more selected torrents no longer exist. Close this dialog and review the current selection.'
    torrents.refreshNow()
    return
  }
  working.value = true
  try {
    await api.torrents.delete(props.hashes, deleteFiles.value)
    notifications.push(
      `${props.hashes.length} torrent${props.hashes.length === 1 ? '' : 's'} removed.`,
      'success'
    )
    torrents.clearSelection()
    torrents.refreshNow()
    emit('update:open', false)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'The torrents could not be removed.'
  } finally {
    working.value = false
  }
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Remove torrents"
    description="This action removes the selected torrents from qBittorrent."
    @update:open="emit('update:open', $event)"
  >
    <div class="delete-content">
      <p>Remove {{ hashes.length }} selected torrent{{ hashes.length === 1 ? '' : 's' }}?</p>
      <label class="delete-files-option">
        <input v-model="deleteFiles" type="checkbox" />
        <span
          ><strong>Also permanently delete downloaded files</strong
          ><small>This cannot be undone and is never selected by default.</small></span
        >
      </label>
      <p v-if="deleteFiles" class="delete-warning">
        <AlertTriangle :size="18" />Downloaded content will be permanently deleted from the
        qBittorrent host.
      </p>
      <p v-if="error" class="delete-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <button class="btn" type="button" @click="emit('update:open', false)">Cancel</button>
      <button class="btn btn-danger" type="button" :disabled="working" @click="confirm">
        {{ working ? 'Removing…' : deleteFiles ? 'Remove and delete files' : 'Remove torrents' }}
      </button>
    </template>
  </AppDialog>
</template>

<style scoped>
.delete-content > p:first-child {
  margin-top: 0;
}
.delete-files-option {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 9px;
  padding: 13px;
}
.delete-files-option input {
  width: 17px;
  height: 17px;
  margin-top: 2px;
  accent-color: rgb(var(--color-danger));
}
.delete-files-option strong,
.delete-files-option small {
  display: block;
}
.delete-files-option small {
  margin-top: 3px;
  color: rgb(var(--color-muted));
}
.delete-warning {
  display: flex;
  gap: 8px;
  border-radius: 8px;
  background: rgb(var(--color-danger) / 0.1);
  color: rgb(var(--color-danger));
  padding: 10px 12px;
}
.delete-error {
  color: rgb(var(--color-danger));
}
</style>
