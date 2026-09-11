import type { AddTorrentOptions } from '@/api/torrents/torrentsApi'
import type { AddTorrentResult } from '@/api/types/models'
import type { MediaDestinationEvaluation } from '@/features/media-placement/components/editorTypes'
import type { AddSourcePlan, AddSummary } from './addTorrentTypes'

export function responseSummary(response: AddTorrentResult, count: number): AddSummary {
  return {
    success: response.success_count ?? (response.legacySuccess ? count : 0),
    pending: response.pending_count ?? 0,
    failed: response.failure_count ?? (response.legacySuccess ? 0 : count),
    ids: response.added_torrent_ids ?? []
  }
}

/** Submits at most two plans at once; each result remains associated with its source key. */
export async function submitTorrentPlans(options: {
  candidates: Array<{ plan: AddSourcePlan; evaluation: MediaDestinationEvaluation }>
  submissionOptions: Pick<
    AddTorrentOptions,
    'stopped' | 'autoTMM' | 'sequentialDownload' | 'firstLastPiecePrio'
  >
  add(value: AddTorrentOptions): Promise<AddTorrentResult>
  isCurrent(): boolean
  update(key: string, status: AddSourcePlan['status'], error: string | null): boolean
  accepted(key: string): Promise<void>
  learningFailed(): void
}): Promise<AddSummary> {
  const summary: AddSummary = { success: 0, pending: 0, failed: 0, ids: [] }
  let cursor = 0
  async function worker(): Promise<void> {
    while (options.isCurrent() && cursor < options.candidates.length) {
      const candidate = options.candidates[cursor++]!
      const { plan, evaluation } = candidate
      if (!options.update(plan.key, 'submitting', null)) continue
      try {
        const response = await options.add({
          ...(plan.source ? { sources: [plan.source] } : {}),
          ...(plan.file ? { files: [plan.file] } : {}),
          savepath: evaluation.effectiveSavePath,
          ...(plan.destination.category ? { category: plan.destination.category } : {}),
          ...(plan.destination.tags.length ? { tags: plan.destination.tags } : {}),
          contentLayout: plan.destination.contentLayout,
          ...options.submissionOptions
        })
        if (!options.isCurrent()) return
        const item = responseSummary(response, 1)
        summary.success += item.success
        summary.pending += item.pending
        summary.failed += item.failed
        summary.ids.push(...item.ids)
        const failed = item.failed > 0
        options.update(
          plan.key,
          failed ? 'failed' : item.pending > 0 ? 'pending' : 'success',
          failed ? 'qBittorrent did not accept this source. Review it and retry.' : null
        )
        if (!failed && (item.success > 0 || item.pending > 0)) {
          try {
            await options.accepted(plan.key)
          } catch {
            if (options.isCurrent()) options.learningFailed()
          }
        }
      } catch (cause) {
        if (!options.isCurrent()) return
        summary.failed += 1
        options.update(
          plan.key,
          'failed',
          cause instanceof Error ? cause.message : 'qBittorrent could not add this source.'
        )
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, options.candidates.length) }, () => worker()))
  return summary
}
