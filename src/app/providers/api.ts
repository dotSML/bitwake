import type { InjectionKey } from 'vue'
import { inject } from 'vue'
import type { QbittorrentApi } from '@/api'

export const apiKey: InjectionKey<QbittorrentApi> = Symbol('qbittorrent-api')

export function useApi(): QbittorrentApi {
  const api = inject(apiKey)
  if (!api) throw new Error('qBittorrent API provider is not installed')
  return api
}
