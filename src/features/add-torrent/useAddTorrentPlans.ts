import { onScopeDispose, ref, type ComputedRef, type Ref } from 'vue'
import {
  analyzeSourceName,
  analyzeTextSource
} from '@/features/media-placement/domain/analyzeSourceName'
import { analyzeTorrentFile } from '@/features/media-placement/domain/analyzeTorrentFile'
import {
  createMediaDestinationValue,
  type MediaDestinationValue
} from '@/features/media-placement/components/editorTypes'
import type { MediaSourceAnalysis } from '@/features/media-placement/domain/types'
import type { EffectiveMediaPlacementConfig } from '@/features/media-placement/stores/mediaPlacement'
import type { AddSourcePlan } from './addTorrentTypes'

/** Owns bounded file inspection and preserves user edits during source reconciliation. */
export function useAddTorrentPlans(options: {
  sources: ComputedRef<string[]>
  files: Ref<File[]>
  enabled: ComputedRef<boolean>
  config: ComputedRef<EffectiveMediaPlacementConfig>
  isOpen: () => boolean
  planDestination: (
    destination: MediaDestinationValue
  ) => Pick<AddSourcePlan, 'destination' | 'canonicalResolution'>
}) {
  const {
    sources,
    files,
    enabled: assistMode,
    config: editorConfig,
    isOpen,
    planDestination
  } = options
  const plans = ref<AddSourcePlan[]>([])
  const analyzingFiles = ref(false)
  let analysisGeneration = 0
  let disposed = false
  const fileObjectIds = new WeakMap<File, number>()
  let nextFileObjectId = 1
  interface FileInspectionTask {
    file: File
    planKey: string
    generation: number
    promise: Promise<MediaSourceAnalysis | null>
    resolve: (analysis: MediaSourceAnalysis | null) => void
  }
  const fileInspectionTasks = new WeakMap<File, FileInspectionTask>()
  const fileInspectionQueue: FileInspectionTask[] = []
  let activeFileInspections = 0

  function fileKeyPart(file: File): string {
    let id = fileObjectIds.get(file)
    if (id === undefined) {
      id = nextFileObjectId
      nextFileObjectId += 1
      fileObjectIds.set(file, id)
    }
    return `${id}:${file.name}:${file.size}:${file.lastModified}`
  }

  function sourceKeys(values: readonly string[], prefix: string): string[] {
    const occurrences = new Map<string, number>()
    return values.map((value) => {
      const occurrence = occurrences.get(value) ?? 0
      occurrences.set(value, occurrence + 1)
      return `${prefix}:${value}:${occurrence}`
    })
  }

  function opaquePlanId(value: string): string {
    let hash = 0x811c9dc5
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 0x01000193)
    }
    return `placement-${(hash >>> 0).toString(16).padStart(8, '0')}`
  }

  function clearPlacementAnalysis(): void {
    analysisGeneration += 1
    cancelQueuedFileInspections()
    analyzingFiles.value = false
    plans.value = []
  }

  function cancelQueuedFileInspections(): void {
    for (const task of fileInspectionQueue.splice(0)) {
      if (fileInspectionTasks.get(task.file) === task) fileInspectionTasks.delete(task.file)
      task.resolve(null)
    }
  }

  function drainFileInspectionQueue(): void {
    if (disposed) {
      cancelQueuedFileInspections()
      return
    }
    while (activeFileInspections < 2 && fileInspectionQueue.length) {
      const task = fileInspectionQueue.shift()
      if (!task) return
      if (
        task.generation !== analysisGeneration ||
        !assistMode.value ||
        !files.value.includes(task.file)
      ) {
        if (fileInspectionTasks.get(task.file) === task) fileInspectionTasks.delete(task.file)
        task.resolve(null)
        continue
      }
      activeFileInspections += 1
      void analyzeTorrentFile(task.file, {
        id: opaquePlanId(task.planKey),
        fileName: task.file.name
      })
        .then((inspected) => task.resolve(inspected))
        .finally(() => {
          activeFileInspections -= 1
          drainFileInspectionQueue()
        })
    }
  }

  function inspectTorrentFileOnce(
    file: File,
    planKey: string,
    generation: number
  ): Promise<MediaSourceAnalysis | null> {
    const existing = fileInspectionTasks.get(file)
    if (existing) {
      existing.generation = generation
      return existing.promise
    }
    let resolve!: (analysis: MediaSourceAnalysis | null) => void
    const promise = new Promise<MediaSourceAnalysis | null>((complete) => {
      resolve = complete
    })
    const task: FileInspectionTask = { file, planKey, generation, promise, resolve }
    fileInspectionTasks.set(file, task)
    fileInspectionQueue.push(task)
    drainFileInspectionQueue()
    return promise
  }

  async function reconcilePlans(): Promise<void> {
    if (disposed || !isOpen()) return
    if (!assistMode.value) {
      clearPlacementAnalysis()
      return
    }
    const generation = ++analysisGeneration
    const previous = new Map(plans.value.map((plan) => [plan.key, plan]))
    const linkKeys = sourceKeys(sources.value, 'link')
    const fileKeys = files.value.map((file) => `file:${fileKeyPart(file)}`)
    const next: AddSourcePlan[] = []

    sources.value.forEach((source, index) => {
      const key = linkKeys[index]!
      const old = previous.get(key)
      if (old) {
        const planned = planDestination(old.destination)
        next.push({
          ...old,
          source,
          destination: planned.destination,
          canonicalResolution: planned.canonicalResolution
        })
      } else {
        const analysis = analyzeTextSource(source, opaquePlanId(key))
        const destination = createMediaDestinationValue(analysis, editorConfig.value)
        const planned = planDestination(destination)
        next.push({
          key,
          sourceType: 'link',
          source,
          analysis,
          inspectionComplete: true,
          destination: planned.destination,
          canonicalResolution: planned.canonicalResolution,
          userEdited: false,
          status: 'ready',
          error: null
        })
      }
    })

    files.value.forEach((file, index) => {
      const key = fileKeys[index]!
      const old = previous.get(key)
      if (old) {
        const planned = planDestination(old.destination)
        next.push({
          ...old,
          file,
          destination: planned.destination,
          canonicalResolution: planned.canonicalResolution
        })
      } else {
        const analysis = analyzeSourceName(file.name, { id: opaquePlanId(key) })
        const destination = createMediaDestinationValue(analysis, editorConfig.value)
        const planned = planDestination(destination)
        next.push({
          key,
          sourceType: 'file',
          file,
          analysis,
          inspectionComplete: false,
          destination: planned.destination,
          canonicalResolution: planned.canonicalResolution,
          userEdited: false,
          status: 'ready',
          error: null
        })
      }
    })
    plans.value = next

    const newFilePlans = next.filter(
      (plan) => plan.sourceType === 'file' && plan.file && !plan.inspectionComplete
    )
    if (!newFilePlans.length) {
      analyzingFiles.value = false
      return
    }
    analyzingFiles.value = true

    try {
      await Promise.all(
        newFilePlans.map(async (plan) => {
          if (!plan.file) return
          const inspected = await inspectTorrentFileOnce(plan.file, plan.key, generation)
          if (!inspected || generation !== analysisGeneration) return
          plans.value = plans.value.map((current) =>
            current.key !== plan.key
              ? current
              : {
                  ...current,
                  analysis: inspected,
                  inspectionComplete: true,
                  destination: current.userEdited
                    ? current.destination
                    : planDestination(createMediaDestinationValue(inspected, editorConfig.value))
                        .destination,
                  canonicalResolution: current.userEdited
                    ? current.canonicalResolution
                    : planDestination(createMediaDestinationValue(inspected, editorConfig.value))
                        .canonicalResolution
                }
          )
        })
      )
    } finally {
      if (generation === analysisGeneration) analyzingFiles.value = false
    }
  }

  onScopeDispose(() => {
    disposed = true
    clearPlacementAnalysis()
  })
  return { plans, analyzingFiles, reconcilePlans, clearPlacementAnalysis, fileKeyPart }
}
