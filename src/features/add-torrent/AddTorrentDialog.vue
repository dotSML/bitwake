<script setup lang="ts">
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  Copy,
  FileUp,
  Link2,
  LoaderCircle,
  Plus,
  XCircle
} from '@lucide/vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useApi } from '@/app/providers/api'
import {
  resolveCanonicalTvSeries,
  type CanonicalTvSeriesResolution
} from '@/features/media-placement/domain/resolveCanonicalTvSeries'
import { replaceControlCharacters } from '@/features/media-placement/domain/textSafety'
import MediaDestinationEditor from '@/features/media-placement/components/MediaDestinationEditor.vue'
import MediaPlacementWarning from '@/features/media-placement/components/MediaPlacementWarning.vue'
import {
  evaluateMediaDestination,
  type MediaDestinationValue
} from '@/features/media-placement/components/editorTypes'
import {
  useMediaPlacementStore,
  type EffectiveMediaPlacementConfig
} from '@/features/media-placement/stores/mediaPlacement'
import { useTvSeriesMappingsStore } from '@/features/media-placement/stores/tvSeriesMappings'
import { canonicalSeriesFolderName } from '@/features/media-placement/domain/resolveCanonicalTvSeries'
import {
  isPathInsideRoot,
  relativeMediaPath,
  tryParseMediaPath
} from '@/features/media-placement/domain/pathUtils'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import AppDialog from '@/ui/primitives/AppDialog.vue'
import { formatNumber } from '@/utils/format'
import type { AddSourcePlan, AddSummary } from './addTorrentTypes'
import { useAddTorrentPlans } from './useAddTorrentPlans'
import { responseSummary, submitTorrentPlans } from './submitTorrentPlans'
import { useTvDirectorySnapshot } from './useTvDirectorySnapshot'

type AddStep = 1 | 2 | 3
const stepLabels = ['Sources', 'Media and destination', 'Options and review'] as const

const props = defineProps<{ open: boolean; initialFiles?: File[]; initialUrls?: string[] }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:dirty': [value: boolean]
}>()
const api = useApi()
const torrents = useTorrentsStore()
const notifications = useNotificationsStore()
const placement = useMediaPlacementStore()
const tvSeriesMappings = useTvSeriesMappingsStore()
const sourceText = ref('')
const files = ref<File[]>([])
const savePath = ref('')
const category = ref('')
const tags = ref('')
const startImmediately = ref(true)
const autoManagement = ref(false)
const sequential = ref(false)
const firstLast = ref(false)
const advancedOpen = ref(false)

function safeFileName(file: File): string {
  return replaceControlCharacters(file.name) || 'Unnamed torrent file'
}
const submitting = ref(false)
const step = ref<AddStep>(1)
const stepHeading = ref<HTMLElement | null>(null)
const error = ref<string | null>(null)
const result = ref<AddSummary | null>(null)
const discardConfirmationOpen = ref(false)
let submissionGeneration = 0
let openGeneration = 0
let disposed = false
const sources = computed(() =>
  sourceText.value
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean)
)
const hasInput = computed(() => sources.value.length > 0 || files.value.length > 0)
const eligiblePlans = computed(() =>
  plans.value.filter((plan) => plan.status === 'ready' || plan.status === 'failed')
)
const terminalAcceptedResult = computed(() =>
  Boolean(
    result.value &&
    !eligiblePlans.value.length &&
    (result.value.success > 0 || result.value.pending > 0)
  )
)
const dirty = computed(
  () =>
    !terminalAcceptedResult.value &&
    (hasInput.value ||
      Boolean(savePath.value || category.value || tags.value) ||
      !startImmediately.value ||
      autoManagement.value ||
      sequential.value ||
      firstLast.value)
)
const assistMode = computed(() => placement.config.mode === 'assist')
const categoryNames = computed(() => [...torrents.categories.keys()])
const categoryPaths = computed(() =>
  Object.fromEntries(
    [...torrents.categories].map(([name, value]) => [name, value.savePath] as const)
  )
)
const editorConfig = computed<EffectiveMediaPlacementConfig>(() => ({
  ...placement.config,
  tvCategory: categoryNames.value.includes(placement.config.tvCategory)
    ? placement.config.tvCategory
    : '',
  movieCategory: categoryNames.value.includes(placement.config.movieCategory)
    ? placement.config.movieCategory
    : ''
}))
const { plans, analyzingFiles, reconcilePlans, clearPlacementAnalysis, fileKeyPart } =
  useAddTorrentPlans({
    sources,
    files,
    enabled: assistMode,
    config: editorConfig,
    isOpen: () => props.open && !disposed,
    planDestination
  })
const {
  tvDirectorySnapshot,
  tvDirectorySettled,
  refreshTvDirectorySnapshot,
  resetTvDirectorySnapshot
} = useTvDirectorySnapshot({
  root: () => editorConfig.value.tvRoot,
  enabled: () => assistMode.value,
  isCurrent: (generation) => generation === openGeneration && !disposed && props.open
})
const missingConfiguredCategories = computed(() =>
  [placement.config.tvCategory, placement.config.movieCategory].filter(
    (value, index, values) =>
      Boolean(value) && values.indexOf(value) === index && !categoryNames.value.includes(value)
  )
)
const evaluations = computed(() =>
  plans.value.map((plan) =>
    evaluateMediaDestination(
      plan.destination,
      plan.analysis,
      editorConfig.value,
      autoManagement.value,
      categoryPaths.value[plan.destination.category] ?? '',
      'may-change-destination',
      plan.canonicalResolution
    )
  )
)
const retrying = computed(() => eligiblePlans.value.some((plan) => plan.status === 'failed'))

watch(dirty, (value) => emit('update:dirty', value), { immediate: true })

watch(
  () => props.open,
  async (open) => {
    const generation = ++openGeneration
    if (open) {
      files.value = [...(props.initialFiles ?? [])]
      sourceText.value = (props.initialUrls ?? []).join('\n')
      await placement.load()
      if (disposed || generation !== openGeneration || !props.open) return
      if (assistMode.value && editorConfig.value.tvRoot) {
        await tvSeriesMappings.load()
        await refreshTvDirectorySnapshot(generation)
      }
      if (disposed || generation !== openGeneration || !props.open) return
      void reconcilePlans()
    } else reset()
  },
  { immediate: true }
)

watch(
  () =>
    [
      `${sourceText.value}\u0000${files.value.map(fileKeyPart).join('\u0001')}`,
      assistMode.value
    ] as const,
  ([, enabled]) => {
    if (enabled) void reconcilePlans()
    else clearPlacementAnalysis()
  }
)

watch(autoManagement, () => {
  plans.value = plans.value.map((plan) => ({
    ...plan,
    destination: {
      ...plan.destination,
      acknowledgedWarningIds: plan.destination.acknowledgedWarningIds.filter(
        (id) => !id.startsWith('auto-tmm:')
      )
    }
  }))
})

onBeforeUnmount(() => {
  disposed = true
  openGeneration += 1
  reset()
})

function reset(): void {
  clearPlacementAnalysis()
  submissionGeneration += 1
  sourceText.value = ''
  files.value = []
  savePath.value = ''
  category.value = ''
  tags.value = ''
  startImmediately.value = true
  autoManagement.value = false
  sequential.value = false
  firstLast.value = false
  advancedOpen.value = false
  submitting.value = false
  analyzingFiles.value = false
  step.value = 1
  error.value = null
  result.value = null
  discardConfirmationOpen.value = false
  plans.value = []
  resetTvDirectorySnapshot()
}

function canonicalResolutionFor(
  destination: MediaDestinationValue
): CanonicalTvSeriesResolution | undefined {
  if (
    destination.kind !== 'tv' ||
    destination.destinationMethod !== 'suggested' ||
    !editorConfig.value.tvRoot
  )
    return undefined
  if (!tvDirectorySettled.value) {
    return { status: 'pending', reason: 'canonical-discovery-loading' }
  }
  if (!tvSeriesMappings.loaded) {
    return tvSeriesMappings.loadError
      ? { status: 'unavailable', reason: 'mapping-load-failed' }
      : { status: 'pending', reason: 'canonical-discovery-loading' }
  }
  const yearText = destination.year.trim()
  const year = /^\d{4}$/u.test(yearText) ? Number(yearText) : undefined
  return resolveCanonicalTvSeries({
    title: destination.title,
    ...(year === undefined ? {} : { year }),
    tvRoot: editorConfig.value.tvRoot,
    directoryNames: tvDirectorySnapshot.value.names,
    directoryListingStatus: tvDirectorySnapshot.value.status,
    mappings: tvSeriesMappings.items
  })
}

async function retryCanonicalDiscovery(): Promise<void> {
  if (!props.open || !assistMode.value || !editorConfig.value.tvRoot) return
  const generation = openGeneration
  if (!tvSeriesMappings.loaded || tvSeriesMappings.loadError) await tvSeriesMappings.load()
  if (disposed || generation !== openGeneration || !props.open) return
  await refreshTvDirectorySnapshot(generation)
  if (disposed || generation !== openGeneration || !props.open) return
  await reconcilePlans()
}

function planDestination(
  destination: MediaDestinationValue
): Pick<AddSourcePlan, 'destination' | 'canonicalResolution'> {
  const resolution = canonicalResolutionFor(destination)
  if (resolution?.status === 'existing' && destination.existingSeriesPathOrigin !== 'manual') {
    return {
      destination: {
        ...destination,
        existingSeriesPath: resolution.seriesPath,
        existingSeriesPathOrigin: 'automatic'
      },
      canonicalResolution: resolution
    }
  }
  if (
    destination.kind === 'tv' &&
    destination.destinationMethod === 'suggested' &&
    destination.existingSeriesPathOrigin === 'automatic'
  ) {
    return {
      destination: { ...destination, existingSeriesPath: '', existingSeriesPathOrigin: 'none' },
      canonicalResolution: resolution
    }
  }
  return { destination, canonicalResolution: resolution }
}

function chooseFiles(event: Event): void {
  const input = event.target as HTMLInputElement
  files.value = [...(input.files ?? [])]
}

function dropFiles(event: DragEvent): void {
  const dropped = [...(event.dataTransfer?.files ?? [])].filter(
    (file) =>
      file.name.toLocaleLowerCase().endsWith('.torrent') || file.type === 'application/x-bittorrent'
  )
  if (dropped.length) files.value = [...files.value, ...dropped]
}

function removeFile(index: number): void {
  files.value = files.value.filter((_, itemIndex) => itemIndex !== index)
}

function validateSources(): boolean {
  for (const source of sources.value) {
    if (source.startsWith('magnet:?')) continue
    try {
      const url = new URL(source)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocol')
    } catch {
      error.value = `“${source.slice(0, 80)}” is not a magnet, HTTP, or HTTPS URL.`
      return false
    }
  }
  return true
}

function updateDestination(index: number, destination: MediaDestinationValue): void {
  const plan = plans.value[index]
  if (!plan) return
  const planned = planDestination(destination)
  plans.value[index] = {
    ...plan,
    destination: planned.destination,
    canonicalResolution: planned.canonicalResolution,
    userEdited: true,
    error: null
  }
}

function updateAcknowledgements(index: number, acknowledgedWarningIds: string[]): void {
  const plan = plans.value[index]
  if (!plan) return
  plans.value[index] = {
    ...plan,
    destination: { ...plan.destination, acknowledgedWarningIds },
    userEdited: true
  }
}

function applyPlanToAll(sourceIndex: number): void {
  const source = plans.value[sourceIndex]
  if (!source) return
  plans.value = plans.value.map((plan, index) =>
    index === sourceIndex || plan.status === 'success' || plan.status === 'pending'
      ? plan
      : {
          ...plan,
          destination: { ...source.destination, acknowledgedWarningIds: [] },
          canonicalResolution: source.canonicalResolution,
          userEdited: true,
          error: null
        }
  )
}

function continueFlow(): void {
  error.value = null
  if (step.value === 1) {
    if (!hasInput.value) {
      error.value = 'Add at least one magnet link, torrent URL, or .torrent file.'
      return
    }
    if (!validateSources()) return
    moveToStep(2)
    return
  }
  if (step.value === 2) {
    const invalid = evaluations.value.findIndex((evaluation) => !evaluation.valid)
    if (invalid >= 0) {
      error.value = `Review the media destination for ${plans.value[invalid]?.analysis.displayName ?? 'this source'}.`
      return
    }
    moveToStep(3)
  }
}

function moveToStep(next: AddStep): void {
  step.value = next
  void nextTick(() => stepHeading.value?.focus({ preventScroll: true }))
}

function goBack(): void {
  if (
    step.value > 1 &&
    !plans.value.some((plan) => plan.status === 'success' || plan.status === 'pending')
  )
    moveToStep((step.value - 1) as AddStep)
}

async function learnExplicitTvSeriesMapping(
  plan: AddSourcePlan,
  evaluation: ReturnType<typeof evaluateMediaDestination>
): Promise<void> {
  const destination = plan.destination
  if (
    plan.analysis.kind !== 'tv' ||
    destination.kind !== 'tv' ||
    destination.destinationMethod !== 'suggested' ||
    destination.existingSeriesPathOrigin !== 'manual' ||
    !destination.existingSeriesPath ||
    !evaluation.valid
  )
    return
  const root = editorConfig.value.tvRoot
  const parsed = tryParseMediaPath(destination.existingSeriesPath)
  const relative = root ? relativeMediaPath(destination.existingSeriesPath, root) : null
  const folderName = canonicalSeriesFolderName(destination.existingSeriesPath)
  if (
    !root ||
    !parsed ||
    !isPathInsideRoot(destination.existingSeriesPath, root) ||
    relative?.length !== 1 ||
    !folderName
  )
    return
  const yearText = destination.year.trim()
  const year = /^\d{4}$/u.test(yearText) ? Number(yearText) : undefined
  await tvSeriesMappings.remember(destination.title, folderName, year)
}

async function addLegacy(): Promise<void> {
  if (!hasInput.value || submitting.value || !validateSources()) return
  const generation = ++submissionGeneration
  const submittedSourceCount = files.value.length + sources.value.length
  submitting.value = true
  error.value = null
  result.value = null
  try {
    const response = await api.torrents.add({
      sources: sources.value,
      files: files.value,
      ...(savePath.value ? { savepath: savePath.value } : {}),
      ...(category.value ? { category: category.value } : {}),
      ...(tags.value.trim()
        ? {
            tags: tags.value
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          }
        : {}),
      stopped: !startImmediately.value,
      autoTMM: autoManagement.value,
      sequentialDownload: sequential.value,
      firstLastPiecePrio: firstLast.value
    })
    if (generation !== submissionGeneration || disposed || !props.open) return
    const summary = responseSummary(response, submittedSourceCount)
    result.value = summary
    finishSubmission(summary)
  } catch (cause) {
    if (generation !== submissionGeneration || disposed || !props.open) return
    error.value =
      cause instanceof Error ? cause.message : 'qBittorrent could not add these sources.'
  } finally {
    if (generation === submissionGeneration) submitting.value = false
  }
}

async function addPlanned(): Promise<void> {
  if (submitting.value || !plans.value.length) return
  error.value = null
  result.value = null
  const currentEvaluations = plans.value.map((plan) =>
    evaluateMediaDestination(
      plan.destination,
      plan.analysis,
      editorConfig.value,
      autoManagement.value,
      categoryPaths.value[plan.destination.category] ?? '',
      'may-change-destination',
      plan.canonicalResolution
    )
  )
  const invalid = currentEvaluations.findIndex(
    (evaluation, index) =>
      (plans.value[index]?.status === 'ready' || plans.value[index]?.status === 'failed') &&
      !evaluation.valid
  )
  if (invalid >= 0) {
    error.value = `Review and acknowledge the destination for ${plans.value[invalid]?.analysis.displayName ?? 'this source'}.`
    return
  }

  const candidates = plans.value
    .map((plan, index) => ({ plan, evaluation: currentEvaluations[index]! }))
    .filter(({ plan }) => plan.status === 'ready' || plan.status === 'failed')
  if (!candidates.length) return
  const generation = ++submissionGeneration
  const submissionOptions = {
    stopped: !startImmediately.value,
    autoTMM: autoManagement.value,
    sequentialDownload: sequential.value,
    firstLastPiecePrio: firstLast.value
  }
  submitting.value = true
  try {
    const summary = await submitTorrentPlans({
      candidates,
      submissionOptions,
      add: (options) => api.torrents.add(options),
      isCurrent: () => generation === submissionGeneration && !disposed && props.open,
      update(key, status, error) {
        const index = plans.value.findIndex((plan) => plan.key === key)
        if (index < 0) return false
        plans.value[index] = { ...plans.value[index]!, status, error }
        return true
      },
      async accepted(key) {
        const plan = plans.value.find((item) => item.key === key)
        if (!plan) return
        await learnExplicitTvSeriesMapping(
          plan,
          evaluateMediaDestination(
            plan.destination,
            plan.analysis,
            editorConfig.value,
            autoManagement.value,
            categoryPaths.value[plan.destination.category] ?? '',
            'may-change-destination',
            plan.canonicalResolution
          )
        )
      },
      learningFailed() {
        notifications.push(
          'The torrent was accepted, but Bitwake could not remember the TV series alias.',
          'warning'
        )
      }
    })
    if (generation !== submissionGeneration || disposed || !props.open) return
    result.value = summary
    finishSubmission(summary)
  } finally {
    if (generation === submissionGeneration) submitting.value = false
  }
}

function finishSubmission(summary: AddSummary): void {
  if (summary.failed === 0 && summary.pending === 0) {
    notifications.push(
      `${summary.success} torrent${summary.success === 1 ? '' : 's'} added.`,
      'success'
    )
    emit('update:open', false)
    torrents.refreshNow()
  } else if (summary.failed > 0) {
    notifications.push('Some torrent sources could not be added.', 'warning')
    if (summary.success > 0 || summary.pending > 0) torrents.refreshNow()
  }
}

function submit(): void {
  if (assistMode.value) {
    if (step.value < 3) continueFlow()
    else void addPlanned()
  } else void addLegacy()
}

function requestClose(): void {
  if (submitting.value) return
  if (dirty.value) {
    discardConfirmationOpen.value = true
    return
  }
  emit('update:open', false)
}

function discardAndClose(): void {
  discardConfirmationOpen.value = false
  emit('update:open', false)
}
</script>

<template>
  <AppDialog
    :open="open"
    title="Add torrents"
    description="Add files, magnet links, or torrent URLs. Sources are not saved by Bitwake."
    wide
    fullscreen-mobile
    :dismissible="!submitting"
    @update:open="!$event && requestClose()"
  >
    <nav v-if="assistMode" class="stepper" aria-label="Add torrent steps">
      <span
        v-for="item in 3"
        :key="item"
        :class="{ active: step === item, complete: step > item }"
        :aria-current="step === item ? 'step' : undefined"
        :aria-label="`${stepLabels[item - 1]}, step ${item} of 3${step > item ? ', completed' : step === item ? ', current' : ''}`"
      >
        <b>{{ item }}</b
        >{{ stepLabels[item - 1] }}
      </span>
    </nav>
    <h2 v-if="assistMode" ref="stepHeading" class="sr-only" tabindex="-1">
      Step {{ step }} of 3: {{ stepLabels[step - 1] }}
    </h2>

    <form id="add-torrent-form" class="add-form" @submit.prevent="submit">
      <template v-if="!assistMode || step === 1">
        <section>
          <h3><Link2 :size="17" aria-hidden="true" /> Links</h3>
          <label class="sr-only" for="torrent-sources"
            >Magnet links and torrent URLs, one per line</label
          >
          <textarea
            id="torrent-sources"
            v-model="sourceText"
            class="field source-area"
            rows="4"
            placeholder="Paste magnet links or HTTP(S) torrent URLs, one per line"
            spellcheck="false"
            autocapitalize="none"
          />
        </section>

        <section>
          <h3><FileUp :size="17" aria-hidden="true" /> Torrent files</h3>
          <label class="file-drop" for="torrent-files" @dragover.prevent @drop.prevent="dropFiles">
            <Plus :size="18" aria-hidden="true" />
            <span>Choose or drop one or more .torrent files</span>
            <input
              id="torrent-files"
              type="file"
              accept=".torrent,application/x-bittorrent"
              multiple
              @change="chooseFiles"
            />
          </label>
          <ul v-if="files.length" class="file-list" aria-label="Selected torrent files">
            <li v-for="(file, index) in files" :key="`${file.name}-${file.size}-${index}`">
              <span>{{ safeFileName(file) }}</span
              ><small>{{ formatNumber(file.size) }} bytes</small>
              <button
                type="button"
                :aria-label="`Remove ${safeFileName(file)}`"
                @click="removeFile(index)"
              >
                <XCircle :size="17" />
              </button>
            </li>
          </ul>
          <p v-if="assistMode && analyzingFiles" class="analysis-state" role="status">
            <LoaderCircle class="spin" :size="15" />Inspecting local torrent structure…
          </p>
        </section>
      </template>

      <template v-if="!assistMode">
        <div class="form-grid">
          <div>
            <label class="label" for="save-path">Save path</label>
            <input
              id="save-path"
              v-model="savePath"
              class="field"
              placeholder="Use qBittorrent default"
            />
          </div>
          <div>
            <label class="label" for="add-category">Category</label>
            <select id="add-category" v-model="category" class="field">
              <option value="">No category</option>
              <option v-for="[name] in torrents.categories" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
          </div>
          <div class="wide-field">
            <label class="label" for="add-tags">Tags</label>
            <input id="add-tags" v-model="tags" class="field" placeholder="Comma-separated tags" />
          </div>
        </div>
      </template>

      <template v-else-if="step === 2">
        <div v-if="missingConfiguredCategories.length" class="category-notice" role="note">
          <AlertTriangle :size="17" />
          <span
            >The configured categor{{
              missingConfiguredCategories.length === 1 ? 'y is' : 'ies are'
            }}
            not available in qBittorrent: {{ missingConfiguredCategories.join(', ') }}. Bitwake will
            not create or apply
            {{ missingConfiguredCategories.length === 1 ? 'it' : 'them' }} automatically.</span
          >
        </div>
        <article
          v-for="(plan, index) in plans"
          :key="plan.key"
          class="source-plan"
          :data-source-id="plan.analysis.id"
        >
          <header>
            <div>
              <small>Source {{ index + 1 }}</small
              ><strong>{{ plan.analysis.displayName }}</strong
              ><span
                >{{ plan.analysis.confidence }} confidence<span
                  v-if="plan.analysis.shape !== 'unknown'"
                >
                  · {{ plan.analysis.shape }}</span
                ></span
              >
            </div>
            <button
              v-if="plans.length > 1"
              class="btn copy-plan"
              type="button"
              @click="applyPlanToAll(index)"
            >
              <Copy :size="14" />Apply to all
            </button>
          </header>
          <ul v-if="plan.analysis.warnings.length" class="source-warnings">
            <li v-for="warning in plan.analysis.warnings" :key="warning">{{ warning }}</li>
          </ul>
          <MediaDestinationEditor
            :model-value="plan.destination"
            :analysis="plan.analysis"
            :config="editorConfig"
            :categories="categoryNames"
            :category-paths="categoryPaths"
            :auto-management="autoManagement"
            :canonical-resolution="plan.canonicalResolution"
            :retry-canonical-discovery="retryCanonicalDiscovery"
            :id-prefix="`source-${index}`"
            @update:model-value="updateDestination(index, $event)"
          />
        </article>
      </template>

      <template v-else-if="assistMode && step === 3">
        <section class="review-section">
          <h3>Review destinations</h3>
          <article v-for="(plan, index) in plans" :key="plan.key" class="review-plan">
            <div>
              <strong>{{ plan.analysis.displayName }}</strong>
              <span
                >{{
                  plan.destination.kind === 'tv'
                    ? 'TV show'
                    : plan.destination.kind === 'movie'
                      ? 'Movie'
                      : 'Other'
                }}
                ·
                {{
                  plan.destination.destinationMethod === 'suggested'
                    ? 'Suggested folder'
                    : 'Manual path'
                }}</span
              >
              <code>{{ evaluations[index]?.effectiveSavePath }}</code>
            </div>
            <span :class="['source-status', plan.status]">{{
              plan.status === 'ready'
                ? 'Ready'
                : plan.status === 'submitting'
                  ? 'Adding…'
                  : plan.status === 'success'
                    ? 'Added'
                    : plan.status === 'pending'
                      ? 'Pending'
                      : 'Failed'
            }}</span>
            <p v-if="plan.error" class="source-error" role="alert">{{ plan.error }}</p>
            <MediaPlacementWarning
              v-if="evaluations[index]?.warnings.length"
              :acknowledged="plan.destination.acknowledgedWarningIds"
              :warnings="evaluations[index]!.warnings"
              @update:acknowledged="updateAcknowledgements(index, $event)"
            />
          </article>
        </section>
      </template>

      <div v-if="!assistMode || step === 3" class="option-row">
        <label
          ><input v-model="startImmediately" type="checkbox" :disabled="submitting" /> Start
          immediately</label
        >
        <label
          ><input v-model="autoManagement" type="checkbox" :disabled="submitting" /> Automatic
          torrent management</label
        >
      </div>

      <details
        v-if="!assistMode || step === 3"
        class="advanced-options"
        :open="advancedOpen"
        @toggle="advancedOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary>Advanced options</summary>
        <div class="option-row advanced-body">
          <label
            ><input v-model="sequential" type="checkbox" :disabled="submitting" /> Sequential
            download</label
          >
          <label
            ><input v-model="firstLast" type="checkbox" :disabled="submitting" /> First and last
            pieces first</label
          >
        </div>
      </details>

      <p v-if="error" class="form-error" role="alert"><AlertTriangle :size="17" />{{ error }}</p>
      <div v-if="result" class="result-panel" role="status">
        <CheckCircle2 v-if="result.failed === 0" :size="19" />
        <AlertTriangle v-else :size="19" />
        <div>
          <strong>Add result</strong>
          <p>
            {{ result.success }} added · {{ result.pending }} pending · {{ result.failed }} failed
          </p>
          <small v-if="result.pending"
            >Pending remote sources can still fail after qBittorrent finishes fetching them.</small
          >
        </div>
      </div>
    </form>

    <template #footer>
      <button
        v-if="assistMode && step > 1"
        class="btn back-button"
        type="button"
        :disabled="
          submitting || plans.some((plan) => plan.status === 'success' || plan.status === 'pending')
        "
        @click="goBack"
      >
        <ChevronLeft :size="16" />Back
      </button>
      <span class="footer-spacer" />
      <button class="btn" type="button" :disabled="submitting" @click="requestClose">
        {{ terminalAcceptedResult ? 'Done' : result ? 'Close' : 'Cancel' }}
      </button>
      <button
        v-if="!terminalAcceptedResult"
        class="btn btn-primary"
        type="submit"
        form="add-torrent-form"
        :disabled="
          !hasInput ||
          submitting ||
          (assistMode && analyzingFiles) ||
          (assistMode && step === 3 && !eligiblePlans.length)
        "
      >
        <LoaderCircle v-if="submitting || (assistMode && analyzingFiles)" class="spin" :size="17" />
        {{
          submitting
            ? 'Adding…'
            : assistMode && analyzingFiles
              ? 'Analyzing…'
              : assistMode && step < 3
                ? 'Continue'
                : retrying
                  ? 'Retry failed sources'
                  : 'Add torrents'
        }}
      </button>
    </template>
  </AppDialog>
  <AppDialog
    :open="discardConfirmationOpen"
    title="Discard Add torrent changes?"
    description="No torrent has been submitted yet."
    :dismissible="!submitting"
    @update:open="!$event && (discardConfirmationOpen = false)"
  >
    <p>Keep editing to retain sources, destination choices, and acknowledgements.</p>
    <template #footer>
      <button class="btn" type="button" @click="discardConfirmationOpen = false">
        Keep editing
      </button>
      <button class="btn btn-danger" type="button" @click="discardAndClose">Discard changes</button>
    </template>
  </AppDialog>
</template>

<style scoped>
.add-form {
  display: grid;
  gap: 20px;
}
.stepper {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin-bottom: 18px;
}
.stepper span {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  border-bottom: 2px solid rgb(var(--color-line));
  padding: 0 3px 7px;
  color: rgb(var(--color-muted));
  font-size: 10px;
}
.stepper span.active,
.stepper span.complete {
  border-color: rgb(var(--color-accent));
  color: rgb(var(--color-ink));
}
.stepper b {
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: rgb(var(--color-surface-muted));
}
.stepper .active b,
.stepper .complete b {
  background: rgb(var(--color-accent));
  color: white;
}
h3 {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0 0 8px;
  font-size: 14px;
}
.source-area {
  min-height: 104px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
}
.file-drop {
  display: flex;
  min-height: 62px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px dashed rgb(var(--color-line-strong));
  border-radius: 9px;
  background: rgb(var(--color-canvas) / 0.5);
  color: rgb(var(--color-muted));
  cursor: pointer;
}
.file-drop:hover {
  border-color: rgb(var(--color-accent));
  color: rgb(var(--color-accent));
}
.file-drop input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}
.file-list {
  display: grid;
  gap: 4px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.file-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 32px;
  align-items: center;
  gap: 8px;
  border-radius: 7px;
  background: rgb(var(--color-surface-muted));
  padding: 6px 7px 6px 10px;
}
.file-list span {
  overflow: hidden;
  text-overflow: ellipsis;
  unicode-bidi: plaintext;
  white-space: nowrap;
}
.file-list small {
  color: rgb(var(--color-muted));
}
.file-list button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 0;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
}
.analysis-state {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 14px;
}
.wide-field {
  grid-column: 1 / -1;
}
.source-plan {
  display: grid;
  gap: 13px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 10px;
  padding: 13px;
}
.source-plan > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding-bottom: 10px;
}
.source-plan > header div {
  display: grid;
  min-width: 0;
}
.source-plan > header small,
.source-plan > header span {
  color: rgb(var(--color-muted));
  font-size: 10px;
}
.source-plan > header strong {
  overflow-wrap: anywhere;
  font-size: 13px;
}
.copy-plan {
  flex: 0 0 auto;
  font-size: 10px;
}
.source-warnings {
  margin: 0;
  border-radius: 8px;
  background: rgb(var(--color-warning) / 0.08);
  padding: 8px 10px 8px 27px;
  color: rgb(var(--color-muted));
  font-size: 10px;
}
.category-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 8px;
  background: rgb(var(--color-warning) / 0.1);
  padding: 9px 10px;
  font-size: 11px;
  line-height: 1.45;
}
.review-section {
  display: grid;
  gap: 9px;
}
.review-plan {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 9px;
  padding: 10px;
}
.review-plan > div:first-child {
  display: grid;
  min-width: 0;
  gap: 2px;
}
.review-plan strong {
  overflow-wrap: anywhere;
  font-size: 12px;
}
.review-plan span {
  color: rgb(var(--color-muted));
  font-size: 10px;
}
.review-plan code {
  margin-top: 3px;
  overflow-wrap: anywhere;
  white-space: normal;
  font-size: 10px;
}
.review-plan > :deep(.warnings),
.source-error {
  grid-column: 1 / -1;
}
.source-status {
  align-self: start;
  border-radius: 999px;
  background: rgb(var(--color-surface-muted));
  padding: 4px 7px;
  font-weight: 700;
}
.source-status.success {
  background: rgb(var(--color-success) / 0.12);
  color: rgb(var(--color-success));
}
.source-status.failed {
  background: rgb(var(--color-danger) / 0.1);
  color: rgb(var(--color-danger));
}
.source-status.pending,
.source-status.submitting {
  background: rgb(var(--color-warning) / 0.1);
  color: rgb(var(--color-warning-foreground));
}
.source-error {
  margin: 0;
  color: rgb(var(--color-danger));
  font-size: 11px;
}
.option-row {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 24px;
}
.option-row label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
.option-row input {
  width: 16px;
  height: 16px;
  accent-color: rgb(var(--color-accent));
}
.advanced-options {
  border-top: 1px solid rgb(var(--color-line));
  padding-top: 13px;
}
.advanced-options summary {
  color: rgb(var(--color-accent));
  font-weight: 650;
  cursor: pointer;
}
.advanced-body {
  margin-top: 13px;
}
.form-error,
.result-panel {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin: 0;
  border-radius: 8px;
  padding: 10px 12px;
}
.form-error {
  background: rgb(var(--color-danger) / 0.1);
  color: rgb(var(--color-danger));
}
.result-panel {
  background: rgb(var(--color-warning) / 0.1);
}
.result-panel strong,
.result-panel p,
.result-panel small {
  display: block;
  margin: 0;
}
.result-panel p {
  margin-top: 2px;
}
.result-panel small {
  margin-top: 3px;
  color: rgb(var(--color-muted));
}
.footer-spacer {
  flex: 1;
}
.spin {
  animation: spin 800ms linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 600px) {
  .stepper span {
    align-items: flex-start;
    flex-direction: column;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .wide-field {
    grid-column: auto;
  }
  .file-list li {
    grid-template-columns: minmax(0, 1fr) 32px;
  }
  .file-list small {
    display: none;
  }
  .option-row {
    align-items: flex-start;
    flex-direction: column;
  }
  .source-plan {
    border-right: 0;
    border-left: 0;
    border-radius: 0;
    padding-right: 0;
    padding-left: 0;
  }
  .source-plan > header {
    align-items: stretch;
    flex-direction: column;
  }
  .copy-plan {
    align-self: flex-start;
  }
  .review-plan {
    grid-template-columns: minmax(0, 1fr);
  }
  .source-status {
    justify-self: start;
  }
}
@media (max-width: 360px) {
  .stepper span {
    font-size: 9px;
  }
  :deep(.dialog-footer) {
    padding-right: 10px;
    padding-left: 10px;
  }
  :deep(.dialog-footer .btn) {
    padding-right: 8px;
    padding-left: 8px;
    font-size: 11px;
  }
}
</style>
