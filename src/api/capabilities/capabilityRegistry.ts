import { versionAtLeast } from './versions'

export type Capability =
  | 'startStop'
  | 'clientData'
  | 'detailedAddResults'
  | 'torrentMetadataPreview'
  | 'pieceAvailability'
  | 'peerHostnames'
  | 'categoryShareLimits'
  | 'editableTrackerTiers'
  | 'webSeedManagement'
  | 'torrentCreator'
  | 'apiKeyManagement'
  | 'rssSmartEpisodeFilters'
  | 'processInfo'
  | 'exportTorrent'

interface CapabilityDefinition {
  minimumApi?: string
  minimumApp?: string
  description: string
}

export const capabilityDefinitions: Readonly<Record<Capability, CapabilityDefinition>> = {
  startStop: {
    minimumApi: '2.11.2',
    minimumApp: '5.0.0',
    description: 'Current start and stop torrent operations'
  },
  clientData: { minimumApi: '2.13.1', description: 'Server-side Alternative WebUI preferences' },
  detailedAddResults: {
    minimumApi: '2.14.0',
    description: 'Per-request torrent add counts and IDs'
  },
  torrentMetadataPreview: {
    minimumApi: '2.11.9',
    description: 'Preview torrent metadata before adding'
  },
  pieceAvailability: { minimumApi: '2.15.1', description: 'Per-file and piece availability' },
  peerHostnames: { minimumApi: '2.15.1', description: 'Resolved peer hostnames' },
  categoryShareLimits: { minimumApi: '2.11.6', description: 'Category-level share limits' },
  editableTrackerTiers: { minimumApi: '2.13.0', description: 'Edit tracker tiers' },
  webSeedManagement: { minimumApi: '2.11.4', description: 'Add, edit, and remove web seeds' },
  torrentCreator: { minimumApi: '2.11.2', description: 'Server-side Torrent Creator tasks' },
  apiKeyManagement: { minimumApi: '2.14.1', description: 'Web API key management' },
  rssSmartEpisodeFilters: { minimumApi: '2.11.2', description: 'RSS smart episode filters' },
  processInfo: { minimumApi: '2.15.1', description: 'qBittorrent process information' },
  exportTorrent: { minimumApi: '2.11.2', description: 'Download a completed torrent metadata file' }
}

export interface CapabilityRegistry {
  appVersion: string
  apiVersion: string
  has(capability: Capability): boolean
  reason(capability: Capability): string | null
}

export function createCapabilityRegistry(
  appVersion: string,
  apiVersion: string
): CapabilityRegistry {
  const has = (capability: Capability): boolean => {
    const definition = capabilityDefinitions[capability]
    if (definition.minimumApi && !versionAtLeast(apiVersion, definition.minimumApi)) return false
    if (definition.minimumApp && !versionAtLeast(appVersion, definition.minimumApp)) return false
    return true
  }

  return {
    appVersion,
    apiVersion,
    has,
    reason(capability) {
      if (has(capability)) return null
      const definition = capabilityDefinitions[capability]
      const requirements = [
        definition.minimumApi ? `Web API ${definition.minimumApi}+` : '',
        definition.minimumApp ? `qBittorrent ${definition.minimumApp}+` : ''
      ].filter(Boolean)
      return `${definition.description} requires ${requirements.join(' and ')}.`
    }
  }
}
