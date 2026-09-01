import { defineStore } from 'pinia'
import { computed, markRaw, ref } from 'vue'
import type { ServerState } from '@/api/types/models'
import { TransferGraphBuffer } from '@/domains/transfer/graphBuffer'

export const useTransferStore = defineStore('transfer', () => {
  const serverState = ref<ServerState>({})
  const graph = markRaw(new TransferGraphBuffer(7200))
  const graphRevision = ref(0)
  let lastSampleAt = 0

  const downloadSpeed = computed(() => serverState.value.dl_info_speed ?? 0)
  const uploadSpeed = computed(() => serverState.value.up_info_speed ?? 0)
  const connected = computed(() => serverState.value.connection_status === 'connected')

  function applyServerState(update: ServerState): void {
    serverState.value = { ...serverState.value, ...update }
    const now = Date.now()
    const gap = lastSampleAt > 0 && now - lastSampleAt > 5000
    graph.push({
      timestamp: now,
      download: serverState.value.dl_info_speed ?? 0,
      upload: serverState.value.up_info_speed ?? 0,
      ...(gap ? { gap: true } : {})
    })
    lastSampleAt = now
    graphRevision.value += 1
  }

  function reset(): void {
    serverState.value = {}
    graph.clear()
    lastSampleAt = 0
    graphRevision.value += 1
  }

  return {
    serverState,
    graph,
    graphRevision,
    downloadSpeed,
    uploadSpeed,
    connected,
    applyServerState,
    reset
  }
})
