export type MediaKind = 'tv' | 'movie' | 'other' | 'unknown'

export type DestinationMethod = 'suggested' | 'manual'

export type MediaSourceShape =
  | 'single-file'
  | 'flat-multi-file'
  | 'single-root-directory'
  | 'single-season-pack'
  | 'multi-season-pack'
  | 'unknown'

export type MediaAnalysisConfidence = 'high' | 'medium' | 'low'

export type ContentLayout = 'Original' | 'Subfolder' | 'NoSubfolder'

export type MediaPathStyle = 'posix' | 'windows-drive' | 'unc'

export type TvDirectoryListingStatus = 'ready' | 'truncated' | 'error'

/**
 * The local, deliberately conservative description of one add-torrent source.
 * `filePaths` are bounded, torrent-relative path hints used only for previews;
 * they never contain piece data or the uploaded torrent bytes.
 */
export interface MediaSourceAnalysis {
  id: string
  displayName: string
  kind: MediaKind
  suggestedTitle: string
  suggestedYear?: number
  suggestedSeason?: number
  detectedSeasons: number[]
  detectedEpisodes?: number[]
  shape: MediaSourceShape
  topLevelPaths: string[]
  filePaths?: string[]
  torrentRootName?: string
  confidence: MediaAnalysisConfidence
  warnings: string[]
  inspectionError?: 'invalid-bencode' | 'limit-exceeded' | 'unsafe-path' | 'unreadable'
}

export type MediaPlacementWarningSeverity = 'notice' | 'warning'

export interface MediaPlacementWarning {
  /** Stable identifier suitable for acknowledgement state in the UI. */
  id: string
  code:
    | 'exact-tv-root'
    | 'exact-movies-root'
    | 'wrong-media-root'
    | 'outside-media-roots'
    | 'structure-not-evaluated'
    | 'missing-series-folder'
    | 'missing-season-folder'
    | 'missing-movie-folder'
    | 'loose-root-file'
    | 'double-nesting'
    | 'loose-content'
    | 'auto-tmm-conflict'
    | 'unknown-layout'
  severity: MediaPlacementWarningSeverity
  title: string
  message: string
  acknowledgementRequired: boolean
  saferPath?: string
}

export interface MediaPlacementPlan {
  sourceId: string
  kind: MediaKind
  destinationMethod: DestinationMethod
  title?: string
  year?: number
  season?: number
  multiSeason?: boolean
  suggestedPath?: string
  manualPath?: string
  effectiveSavePath: string
  contentLayout?: ContentLayout
  category?: string
  tags: string[]
  warnings: MediaPlacementWarning[]
  acknowledgementRequired: boolean
}

export interface ManualPathValidationContext {
  kind: MediaKind
  tvRoot?: string
  moviesRoot?: string
}

export type ManualPathLocation =
  | 'tv-root'
  | 'inside-tv-root'
  | 'movies-root'
  | 'inside-movies-root'
  | 'outside-roots'
  | 'unconfigured'

export interface ManualPathValidation {
  valid: boolean
  /** The exact value supplied by the user. Submit this value unchanged. */
  path: string
  /** Lexically normalized only for comparisons and previews. */
  normalizedPath?: string
  style?: MediaPathStyle
  location?: ManualPathLocation
  errors: string[]
  warnings: MediaPlacementWarning[]
  observations: string[]
  acknowledgementRequired: boolean
}

export interface BuildSuggestedPathOptions {
  kind: Extract<MediaKind, 'tv' | 'movie'>
  tvRoot?: string
  moviesRoot?: string
  title?: string
  year?: number
  season?: number
  multiSeason?: boolean
  /** A previously browsed absolute series directory under `tvRoot`. */
  existingSeriesPath?: string
  /** A previously browsed absolute season directory under the selected series. */
  existingSeasonPath?: string
  /** A previously browsed absolute individual movie directory under `moviesRoot`. */
  existingMoviePath?: string
  /** The inspected torrent already carries a canonical Season NN directory. */
  sourceIncludesSeasonDirectory?: boolean
}

export interface SuggestedPathResult {
  valid: boolean
  path: string
  root: string
  folderName?: string
  seasonFolderName?: string
  errors: string[]
}

export interface CalculateEffectiveLayoutOptions {
  analysis: MediaSourceAnalysis
  savePath: string
  contentLayout?: ContentLayout
  tvRoot?: string
  moviesRoot?: string
  /** Overrides the display name when qBittorrent will use a renamed root. */
  torrentName?: string
}

export interface EffectiveLayoutResult {
  contentLayout: ContentLayout
  savePath: string
  effectiveContentPath: string
  predictedPaths: string[]
  treeLines: string[]
  warnings: MediaPlacementWarning[]
  recommendedContentLayout: ContentLayout
  confidence: MediaAnalysisConfidence
}

export interface ExistingTorrentPlacement {
  name: string
  save_path?: string
  content_path?: string
  category?: string
  state?: string
  /** Optional explicit user classification; otherwise local name/category hints are used. */
  kind?: MediaKind
}

export interface ExistingPlacementContext {
  tvRoot?: string
  moviesRoot?: string
  tvCategory?: string
  movieCategory?: string
  /** Optional on-demand qBittorrent file names; row-level callers should omit this. */
  filePaths?: readonly string[]
}
