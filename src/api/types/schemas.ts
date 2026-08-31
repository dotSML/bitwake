import { z } from 'zod'
import type { MainDataResponse } from './models'

const torrentDeltaSchema = z.object({}).catchall(z.unknown())

export const mainDataSchema = z
  .object({
    rid: z.number(),
    full_update: z.boolean().optional(),
    torrents: z.record(z.string(), torrentDeltaSchema).optional(),
    torrents_removed: z.array(z.string()).optional(),
    categories: z.record(z.string(), z.object({}).catchall(z.unknown())).optional(),
    categories_removed: z.array(z.string()).optional(),
    tags: z.array(z.string()).optional(),
    tags_removed: z.array(z.string()).optional(),
    trackers: z.record(z.string(), z.array(z.string())).optional(),
    trackers_removed: z.array(z.string()).optional(),
    server_state: z.object({}).catchall(z.unknown()).optional()
  })
  .loose()
  .transform((value) => value as unknown as MainDataResponse)

export const buildInfoSchema = z.object({}).catchall(z.unknown())
export const unknownObjectSchema = z.object({}).catchall(z.unknown())
