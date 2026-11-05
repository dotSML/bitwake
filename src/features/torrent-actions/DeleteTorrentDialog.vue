<script setup lang="ts">
import { AlertTriangle, Lock } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useApi } from '@/app/providers/api'
import { protectedRemovalLabels } from '@/domains/torrents/removalProtection'
import { matchesTorrentState } from '@/domains/torrents/state'
import { useNotificationsStore } from '@/stores/notifications'
import { usePreferencesStore } from '@/stores/preferences'
import { useTorrentsStore } from '@/stores/torrents'
import AppDialog from '@/ui/primitives/AppDialog.vue'

const props = defineProps<{ open: boolean; hashes: string[] }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const api = useApi()
const torrents = useTorrentsStore()
const notifications = useNotificationsStore()
const preferences = usePreferencesStore()
const deleteFiles = ref(false)
const working = ref(false)
const error = ref<string | null>(null)
const seedableCount = computed(
  () =>
    props.hashes.filter((hash) => {
      const torrent = torrents.byHash.get(hash)
      return torrent ? matchesTorrentState(torrent, 'completed') : false
    }).length
)
const protectedTorrents = computed(() =>
  props.hashes.flatMap((hash) => {
    const torrent = torrents.byHash.get(hash)
    const labels = torrent ? protectedRemovalLabels(torrent, preferences.value) : []
    return torrent && labels.length ? [{ hash, name: torrent.name, labels }] : []
  })
)
const protectedPreviewLimit = 5

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
  if (!props.hashes.length || working.value || protectedTorrents.value.length) return
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
      <div
        v-if="protectedTorrents.length"
        class="protected-block"
        role="note"
        aria-labelledby="protected-block-title"
      >
        <Lock :size="22" aria-hidden="true" />
        <div>
          <strong id="protected-block-title">Protected torrents can't be removed</strong>
          <p>
            {{
              hashes.length === 1
                ? 'This torrent has a protected category or tag.'
                : `${protectedTorrents.length} of ${hashes.length} selected torrents have a protected category or tag.`
            }}
          </p>
          <ul>
            <li v-for="item in protectedTorrents.slice(0, protectedPreviewLimit)" :key="item.hash">
              <span class="protected-name" :title="item.name">{{ item.name }}</span>
              <span class="protected-labels" :title="item.labels.join(', ')">{{
                item.labels.join(', ')
              }}</span>
            </li>
          </ul>
          <p v-if="protectedTorrents.length > protectedPreviewLimit">
            and {{ protectedTorrents.length - protectedPreviewLimit }} more.
          </p>
          <p>
            {{
              hashes.length === 1
                ? 'To remove it, change its category or tags, or update Protected from removal in Settings → Interface.'
                : 'Deselect them to remove the others, or update Protected from removal in Settings → Interface.'
            }}
          </p>
        </div>
      </div>
      <template v-else>
        <div class="seeding-warning" role="note" aria-labelledby="seeding-warning-title">
          <AlertTriangle :size="22" aria-hidden="true" />
          <div>
            <strong id="seeding-warning-title">Don't remove torrents you could still seed</strong>
            <p>
              Removed torrents stop seeding immediately: other peers lose a source and your upload
              ratio stops growing. To seed again you have to add the torrent again and recheck its
              data.
            </p>
            <p v-if="seedableCount" class="seeding-warning-count">
              {{
                hashes.length === 1
                  ? 'This torrent has finished downloading and can be seeded.'
                  : `${seedableCount} of ${hashes.length} selected torrents have finished downloading and can be seeded.`
              }}
            </p>
            <p>Only want to pause transfers? Choose Keep seeding, then use Stop.</p>
          </div>
        </div>
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
      </template>
      <p v-if="error" class="delete-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <button
        class="btn btn-danger"
        type="button"
        :disabled="working || protectedTorrents.length > 0"
        @click="confirm"
      >
        {{ working ? 'Removing…' : deleteFiles ? 'Remove and delete files' : 'Remove torrents' }}
      </button>
      <button class="btn btn-primary" type="button" @click="emit('update:open', false)">
        Keep seeding
      </button>
    </template>
  </AppDialog>
</template>

<style scoped>
.protected-block {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
  border: 1px solid rgb(var(--color-danger) / 0.6);
  border-left-width: 5px;
  border-radius: 9px;
  background: rgb(var(--color-danger) / 0.08);
  padding: 13px 14px;
}
.protected-block > svg {
  flex: 0 0 auto;
  margin-top: 1px;
  color: rgb(var(--color-danger));
}
.protected-block strong {
  display: block;
  font-size: 1.05rem;
  line-height: 1.3;
}
.protected-block p {
  margin: 6px 0 0;
}
.protected-block ul {
  display: grid;
  gap: 4px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.protected-block li {
  display: grid;
  grid-template-columns: minmax(6ch, 1fr) minmax(0, max-content);
  gap: 8px;
}
.protected-name,
.protected-labels {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.protected-name {
  font-weight: 600;
}
.protected-labels {
  color: rgb(var(--color-muted));
}
.seeding-warning {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  border: 1px solid rgb(var(--color-warning-foreground) / 0.65);
  border-left-width: 5px;
  border-radius: 9px;
  background: rgb(var(--color-warning) / 0.14);
  color: rgb(var(--color-warning-foreground));
  padding: 13px 14px;
}
.seeding-warning > svg {
  flex: 0 0 auto;
  margin-top: 1px;
}
.seeding-warning strong {
  display: block;
  font-size: 1.05rem;
  line-height: 1.3;
}
.seeding-warning p {
  margin: 6px 0 0;
}
.seeding-warning .seeding-warning-count {
  font-weight: 600;
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
