import type { MediaSourceAnalysis } from '@/features/media-placement/domain/types'
import type { MediaDestinationValue } from '@/features/media-placement/components/editorTypes'
import type { CanonicalTvSeriesResolution } from '@/features/media-placement/domain/resolveCanonicalTvSeries'

type SourceStatus = 'ready' | 'submitting' | 'success' | 'pending' | 'failed'

export interface AddSourcePlan {
  key: string
  sourceType: 'link' | 'file'
  source?: string
  file?: File
  analysis: MediaSourceAnalysis
  inspectionComplete: boolean
  destination: MediaDestinationValue
  canonicalResolution: CanonicalTvSeriesResolution | undefined
  userEdited: boolean
  status: SourceStatus
  error: string | null
}

export interface AddSummary {
  success: number
  pending: number
  failed: number
  ids: string[]
}
