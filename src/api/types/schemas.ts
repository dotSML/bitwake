import { z } from 'zod'
import type { MainDataResponse } from './models'

// Known fields are validated when present; unknown additions remain available.
// Every field is optional because sync responses contain only changed values.
const shareLimitActionSchema = z.enum([
  'Default',
  'Stop',
  'Remove',
  'RemoveWithContent',
  'EnableSuperSeeding'
])

const torrentDeltaSchema = z
  .object({
    hash: z.string(),
    name: z.string(),
    state: z.string(),
    size: z.number(),
    total_size: z.number(),
    progress: z.number(),
    dlspeed: z.number(),
    upspeed: z.number(),
    priority: z.number(),
    num_seeds: z.number(),
    num_complete: z.number(),
    num_leechs: z.number(),
    num_incomplete: z.number(),
    ratio: z.number(),
    eta: z.number(),
    category: z.string(),
    tags: z.string(),
    save_path: z.string(),
    content_path: z.string(),
    tracker: z.string(),
    added_on: z.number(),
    completion_on: z.number(),
    last_activity: z.number(),
    downloaded: z.number(),
    downloaded_session: z.number(),
    uploaded: z.number(),
    uploaded_session: z.number(),
    amount_left: z.number(),
    availability: z.number(),
    time_active: z.number(),
    seeding_time: z.number(),
    dl_limit: z.number(),
    up_limit: z.number(),
    ratio_limit: z.number(),
    seeding_time_limit: z.number(),
    inactive_seeding_time_limit: z.number(),
    share_limit_action: shareLimitActionSchema,
    auto_tmm: z.boolean(),
    force_start: z.boolean(),
    seq_dl: z.boolean(),
    f_l_piece_prio: z.boolean(),
    super_seeding: z.boolean(),
    magnet_uri: z.string(),
    infohash_v1: z.string(),
    infohash_v2: z.string(),
    private: z.boolean(),
    popularity: z.number(),
    created_on: z.number(),
    piece_size: z.number(),
    comment: z.string()
  })
  .partial()
  .loose()

const categoryDeltaSchema = z
  .object({
    name: z.string(),
    savePath: z.string(),
    download_path: z.union([z.string(), z.literal(false), z.null()]),
    ratio_limit: z.number(),
    seeding_time_limit: z.number(),
    inactive_seeding_time_limit: z.number(),
    share_limit_action: shareLimitActionSchema,
    downloadLimit: z.number(),
    uploadLimit: z.number()
  })
  .partial()
  .loose()

const serverStateDeltaSchema = z
  .object({
    connection_status: z.string(),
    dht_nodes: z.number(),
    dl_info_data: z.number(),
    dl_info_speed: z.number(),
    dl_rate_limit: z.number(),
    up_info_data: z.number(),
    up_info_speed: z.number(),
    up_rate_limit: z.number(),
    free_space_on_disk: z.number(),
    queueing: z.boolean(),
    use_alt_speed_limits: z.boolean(),
    refresh_interval: z.number(),
    alltime_dl: z.number(),
    alltime_ul: z.number(),
    average_time_queue: z.number(),
    global_ratio: z.string(),
    total_buffers_size: z.number(),
    total_peer_connections: z.number(),
    total_queued_size: z.number(),
    total_wasted_session: z.number()
  })
  .partial()
  .loose()

export const mainDataSchema = z
  .object({
    rid: z.number(),
    full_update: z.boolean().optional(),
    torrents: z.record(z.string(), torrentDeltaSchema).optional(),
    torrents_removed: z.array(z.string()).optional(),
    categories: z.record(z.string(), categoryDeltaSchema).optional(),
    categories_removed: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    tags_removed: z.array(z.string()).optional(),
    trackers: z.record(z.string(), z.array(z.string())).optional(),
    trackers_removed: z.array(z.string()).optional(),
    server_state: serverStateDeltaSchema.optional()
  })
  .loose()
  .transform((value) => value as MainDataResponse)

export const buildInfoSchema = z.object({}).catchall(z.unknown())
export const unknownObjectSchema = z.object({}).catchall(z.unknown())
