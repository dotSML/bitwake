<script setup lang="ts">
import {
  Check,
  Download,
  FolderPlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  Rss,
  Settings2,
  Trash2
} from '@lucide/vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { computed, onMounted, ref, toRaw } from 'vue'
import type { RssArticle, RssItems } from '@/api/rss/rssApi'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import { useTorrentsStore } from '@/stores/torrents'
import { safeExternalUrl } from '@/utils/safeUrl'
import RouteScaffold from '@/ui/components/RouteScaffold.vue'
import SanitizedHtml from '@/ui/components/SanitizedHtml.vue'
import AppDialog from '@/ui/primitives/AppDialog.vue'

interface Feed {
  path: string
  title: string
  url: string
  articles: RssArticle[]
  error: boolean
}
type RssItemAction = 'add-feed' | 'add-folder' | 'remove'

const api = useApi()
const notifications = useNotificationsStore()
const torrents = useTorrentsStore()
const rawItems = ref<RssItems>({})
const feeds = ref<Feed[]>([])
const selectedFeed = ref<string | null>(null)
const selectedArticle = ref<RssArticle | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const articleFilter = ref('')
const articleScroller = ref<HTMLElement | null>(null)
const rssItemDialog = ref<{ action: RssItemAction; target: string } | null>(null)
const feedUrl = ref('')
const itemPath = ref('')
const rssItemError = ref<string | null>(null)
const rssItemWorking = ref(false)
const rulesOpen = ref(false)
const rules = ref<Record<string, Record<string, unknown>>>({})
const ruleName = ref('')
const originalRule = ref<Record<string, unknown> | null>(null)
const ruleDefinition = ref({
  enabled: true,
  mustContain: '',
  mustNotContain: '',
  useRegex: false,
  episodeFilter: '',
  smartFilter: false,
  savePath: '',
  category: '',
  tags: '',
  affectedFeeds: [] as string[]
})

const currentFeed = computed(
  () => feeds.value.find((feed) => feed.path === selectedFeed.value) ?? null
)
const articles = computed(() => {
  const needle = articleFilter.value.trim().toLocaleLowerCase()
  return (currentFeed.value?.articles ?? []).filter(
    (article) => !needle || article.title.toLocaleLowerCase().includes(needle)
  )
})
const rssItemDialogTitle = computed(() => {
  if (rssItemDialog.value?.action === 'add-feed') return 'Add RSS feed'
  if (rssItemDialog.value?.action === 'add-folder') return 'Add RSS folder'
  return 'Remove RSS item'
})
const rssItemDialogDescription = computed(() => {
  if (rssItemDialog.value?.action === 'add-feed') {
    return 'Add an HTTP or HTTPS feed, optionally inside an existing folder path.'
  }
  if (rssItemDialog.value?.action === 'add-folder') {
    return 'Create a folder for organizing RSS feeds.'
  }
  return 'This removes the selected feed or folder from qBittorrent.'
})
const rssItemSubmitLabel = computed(() => {
  if (rssItemWorking.value) {
    return rssItemDialog.value?.action === 'remove' ? 'Removing…' : 'Adding…'
  }
  if (rssItemDialog.value?.action === 'add-feed') return 'Add feed'
  if (rssItemDialog.value?.action === 'add-folder') return 'Add folder'
  return 'Remove item'
})
const rssItemSubmittable = computed(() => {
  if (rssItemWorking.value) return false
  if (rssItemDialog.value?.action === 'add-feed') return Boolean(feedUrl.value.trim())
  if (rssItemDialog.value?.action === 'add-folder') return Boolean(itemPath.value.trim())
  return Boolean(rssItemDialog.value?.target)
})
const articleVirtualizer = useVirtualizer({
  get count() {
    return articles.value.length
  },
  getScrollElement: () => articleScroller.value,
  estimateSize: () => 56,
  overscan: 9,
  getItemKey: (index) => articles.value[index]?.id ?? articles.value[index]?.title ?? index
})

function clonePlain<T>(value: T): T {
  return structuredClone(toRaw(value))
}

function collectFeeds(items: Record<string, unknown>, prefix = ''): Feed[] {
  const result: Feed[] = []
  for (const [name, node] of Object.entries(items)) {
    const path = prefix ? `${prefix}/${name}` : name
    if (!node || typeof node !== 'object') continue
    const record = node as Record<string, unknown>
    if (Array.isArray(record.articles) || typeof record.url === 'string') {
      result.push({
        path,
        title: typeof record.title === 'string' ? record.title : name,
        url: typeof record.url === 'string' ? record.url : '',
        articles: Array.isArray(record.articles)
          ? record.articles.filter((article): article is RssArticle =>
              Boolean(article && typeof article === 'object' && 'title' in article)
            )
          : [],
        error: record.hasError === true
      })
    } else result.push(...collectFeeds(record, path))
  }
  return result
}

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    rawItems.value = await api.rss.items(true)
    feeds.value = collectFeeds(rawItems.value)
    selectedFeed.value ??= feeds.value[0]?.path ?? null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'RSS feeds could not be loaded.'
  } finally {
    loading.value = false
  }
}

function openRssItemDialog(action: RssItemAction): void {
  const target = action === 'remove' ? (selectedFeed.value ?? '') : ''
  if (action === 'remove' && !target) return
  rssItemDialog.value = { action, target }
  feedUrl.value = ''
  itemPath.value = ''
  rssItemError.value = null
  rssItemWorking.value = false
}

function closeRssItemDialog(): void {
  if (rssItemWorking.value) return
  rssItemDialog.value = null
  rssItemError.value = null
}

async function submitRssItemDialog(): Promise<void> {
  const dialog = rssItemDialog.value
  if (!dialog || rssItemWorking.value) return
  let normalizedFeedUrl: string | null = null
  if (dialog.action === 'add-feed') {
    const safeUrl = safeExternalUrl(feedUrl.value.trim())
    if (!safeUrl || !['http:', 'https:'].includes(safeUrl.protocol)) {
      rssItemError.value = 'RSS feeds must use an HTTP or HTTPS URL.'
      notifications.push(rssItemError.value, 'warning')
      return
    }
    normalizedFeedUrl = safeUrl.toString()
  }
  const path = itemPath.value.trim()
  if (dialog.action === 'add-folder' && !path) {
    rssItemError.value = 'Enter a folder path.'
    return
  }

  rssItemWorking.value = true
  rssItemError.value = null
  try {
    if (dialog.action === 'add-feed') {
      if (!normalizedFeedUrl) return
      await api.rss.addFeed(normalizedFeedUrl, path)
    } else if (dialog.action === 'add-folder') await api.rss.addFolder(path)
    else {
      await api.rss.removeItem(dialog.target)
      selectedFeed.value = null
      selectedArticle.value = null
    }
    await load()
    rssItemDialog.value = null
    notifications.push(
      dialog.action === 'add-feed'
        ? 'RSS feed added.'
        : dialog.action === 'add-folder'
          ? 'RSS folder added.'
          : 'RSS item removed.',
      'success'
    )
  } catch (cause) {
    rssItemError.value =
      cause instanceof Error
        ? cause.message
        : dialog.action === 'add-feed'
          ? 'Feed could not be added.'
          : dialog.action === 'add-folder'
            ? 'Folder could not be added.'
            : 'RSS item could not be removed.'
    notifications.push(rssItemError.value, 'error')
  } finally {
    rssItemWorking.value = false
  }
}
async function refresh(): Promise<void> {
  if (!selectedFeed.value) return
  try {
    await api.rss.refreshItem(selectedFeed.value)
    await load()
    notifications.push('Feed refreshed.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Feed could not be refreshed.',
      'error'
    )
  }
}
async function selectArticle(article: RssArticle): Promise<void> {
  selectedArticle.value = article
  if (!article.isRead && selectedFeed.value && article.id) {
    try {
      await api.rss.markAsRead(selectedFeed.value, article.id)
      article.isRead = true
    } catch (cause) {
      notifications.push(
        cause instanceof Error ? cause.message : 'The RSS article could not be marked as read.',
        'error'
      )
    }
  }
}
function selectFeed(path: string): void {
  selectedFeed.value = path
  selectedArticle.value = null
}
async function downloadArticle(article: RssArticle): Promise<void> {
  if (!article.torrentURL) return
  const safeUrl = safeExternalUrl(article.torrentURL)
  if (!safeUrl) {
    notifications.push('This RSS article uses an unsupported torrent URL scheme.', 'warning')
    return
  }
  try {
    await api.torrents.add({ sources: [safeUrl.toString()] })
    torrents.refreshNow()
    notifications.push('RSS article sent to qBittorrent.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Article could not be downloaded.',
      'error'
    )
  }
}
async function openRules(): Promise<void> {
  rulesOpen.value = true
  try {
    rules.value = await api.rss.rules()
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'RSS rules could not be loaded.',
      'error'
    )
  }
}
function editRule(name: string): void {
  ruleName.value = name
  const rule = rules.value[name] ?? {}
  originalRule.value = clonePlain(rule)
  const torrentParams =
    rule.torrentParams && typeof rule.torrentParams === 'object'
      ? (rule.torrentParams as Record<string, unknown>)
      : {}
  const tags = Array.isArray(torrentParams.tags)
    ? torrentParams.tags.filter((tag): tag is string => typeof tag === 'string').join(', ')
    : String(rule.addTags ?? '')
  ruleDefinition.value = {
    enabled: rule.enabled !== false,
    mustContain: String(rule.mustContain ?? ''),
    mustNotContain: String(rule.mustNotContain ?? ''),
    useRegex: rule.useRegex === true,
    episodeFilter: String(rule.episodeFilter ?? ''),
    smartFilter: rule.smartFilter === true,
    savePath: String(torrentParams.save_path ?? rule.savePath ?? ''),
    category: String(torrentParams.category ?? rule.assignedCategory ?? ''),
    tags,
    affectedFeeds: Array.isArray(rule.affectedFeeds)
      ? rule.affectedFeeds.filter((item): item is string => typeof item === 'string')
      : []
  }
}
function newRule(): void {
  ruleName.value = ''
  originalRule.value = {
    enabled: true,
    mustContain: '',
    mustNotContain: '',
    useRegex: false,
    episodeFilter: '',
    smartFilter: false,
    previouslyMatchedEpisodes: [],
    affectedFeeds: [],
    ignoreDays: 0,
    lastMatch: '',
    addPaused: null,
    assignedCategory: '',
    savePath: '',
    priority: 0,
    torrentContentLayout: null,
    torrentParams: {
      save_path: '',
      category: '',
      tags: []
    }
  }
  ruleDefinition.value = {
    enabled: true,
    mustContain: '',
    mustNotContain: '',
    useRegex: false,
    episodeFilter: '',
    smartFilter: false,
    savePath: '',
    category: '',
    tags: '',
    affectedFeeds: []
  }
}
async function saveRule(): Promise<void> {
  if (!ruleName.value.trim()) return
  const originalTorrentParams =
    originalRule.value?.torrentParams && typeof originalRule.value.torrentParams === 'object'
      ? clonePlain(originalRule.value.torrentParams as Record<string, unknown>)
      : {}
  const tags = ruleDefinition.value.tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
  const definition = {
    ...(originalRule.value ? clonePlain(originalRule.value) : {}),
    enabled: ruleDefinition.value.enabled,
    mustContain: ruleDefinition.value.mustContain,
    mustNotContain: ruleDefinition.value.mustNotContain,
    useRegex: ruleDefinition.value.useRegex,
    episodeFilter: ruleDefinition.value.episodeFilter,
    smartFilter: ruleDefinition.value.smartFilter,
    affectedFeeds: ruleDefinition.value.affectedFeeds,
    savePath: ruleDefinition.value.savePath,
    assignedCategory: ruleDefinition.value.category,
    torrentParams: {
      ...originalTorrentParams,
      save_path: ruleDefinition.value.savePath,
      category: ruleDefinition.value.category,
      tags
    }
  }
  try {
    await api.rss.setRule(ruleName.value.trim(), definition)
    rules.value = await api.rss.rules()
    notifications.push('RSS rule saved.', 'success')
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'RSS rule could not be saved.',
      'error'
    )
  }
}

onMounted(() => void load())
</script>

<template>
  <RouteScaffold
    title="RSS"
    description="Follow feeds and automate torrent additions with qBittorrent RSS rules."
  >
    <template #actions
      ><button class="btn" type="button" @click="openRules"><Settings2 :size="15" />Rules</button
      ><button class="btn btn-primary" type="button" @click="openRssItemDialog('add-feed')">
        <Plus :size="15" />Add feed
      </button></template
    >
    <div v-if="loading" class="rss-state">
      <LoaderCircle class="spin" :size="22" />Loading RSS feeds…
    </div>
    <div v-else-if="error" class="rss-state error">
      <p>{{ error }}</p>
      <button class="btn" type="button" @click="load">Retry</button>
    </div>
    <div v-else class="rss-layout">
      <aside class="feed-panel panel">
        <header>
          <strong>Feeds</strong
          ><span
            ><button type="button" aria-label="Add folder" @click="openRssItemDialog('add-folder')">
              <FolderPlus :size="16" /></button
            ><button type="button" aria-label="Add feed" @click="openRssItemDialog('add-feed')">
              <Plus :size="16" /></button
          ></span>
        </header>
        <button
          v-for="feed in feeds"
          :key="feed.path"
          class="feed-item"
          :class="{ active: selectedFeed === feed.path, error: feed.error }"
          type="button"
          @click="selectFeed(feed.path)"
        >
          <Rss :size="15" /><span>{{ feed.title }}</span
          ><small>{{ feed.articles.filter((article) => !article.isRead).length }}</small>
        </button>
        <p v-if="!feeds.length" class="empty-copy">No RSS feeds configured.</p>
        <footer v-if="selectedFeed">
          <button type="button" @click="refresh"><RefreshCw :size="14" />Refresh</button
          ><button type="button" @click="openRssItemDialog('remove')">
            <Trash2 :size="14" />Remove
          </button>
        </footer>
      </aside>
      <section ref="articleScroller" class="article-list panel" :data-total-count="articles.length">
        <header>
          <div>
            <strong>{{ currentFeed?.title ?? 'Articles' }}</strong
            ><small>{{ articles.length }} articles</small>
          </div>
          <input v-model="articleFilter" type="search" placeholder="Filter articles" />
        </header>
        <div
          v-if="articles.length"
          class="article-space"
          :style="{ height: `${articleVirtualizer.getTotalSize()}px` }"
        >
          <button
            v-for="virtualRow in articleVirtualizer.getVirtualItems()"
            :key="String(virtualRow.key)"
            class="article-item"
            :class="{
              active: selectedArticle === articles[virtualRow.index],
              unread: !articles[virtualRow.index]?.isRead
            }"
            type="button"
            :style="{ transform: `translateY(${virtualRow.start}px)` }"
            @click="articles[virtualRow.index] && selectArticle(articles[virtualRow.index]!)"
          >
            <span class="unread-dot" /><strong>{{ articles[virtualRow.index]?.title }}</strong
            ><small>{{ articles[virtualRow.index]?.date ?? '' }}</small>
          </button>
        </div>
        <p v-if="!articles.length" class="empty-copy">No articles in this feed.</p>
      </section>
      <article class="article-detail panel">
        <template v-if="selectedArticle"
          ><header>
            <div>
              <h2>{{ selectedArticle.title }}</h2>
              <p>{{ selectedArticle.date }}</p>
            </div>
            <button
              class="btn btn-primary"
              type="button"
              :disabled="!selectedArticle.torrentURL"
              @click="downloadArticle(selectedArticle)"
            >
              <Download :size="15" />Download
            </button>
          </header>
          <SanitizedHtml class="article-description" :html="selectedArticle.description ?? ''"
        /></template>
        <div v-else class="rss-state">
          <Check :size="24" />
          <p>Select an article to read it.</p>
        </div>
      </article>
    </div>

    <AppDialog
      :open="rssItemDialog !== null"
      :title="rssItemDialogTitle"
      :description="rssItemDialogDescription"
      fullscreen-mobile
      @update:open="!$event && closeRssItemDialog()"
    >
      <form id="rss-item-form" class="rss-item-form" @submit.prevent="submitRssItemDialog">
        <template v-if="rssItemDialog?.action === 'add-feed'">
          <label for="rss-feed-url">
            <span>Feed URL</span>
            <input
              id="rss-feed-url"
              v-model="feedUrl"
              class="field"
              type="url"
              inputmode="url"
              autocomplete="url"
              required
              autofocus
              :aria-describedby="rssItemError ? 'rss-item-error' : undefined"
            />
          </label>
          <label for="rss-feed-folder">
            <span>Folder path (optional)</span>
            <input id="rss-feed-folder" v-model="itemPath" class="field" autocomplete="off" />
          </label>
        </template>
        <label v-else-if="rssItemDialog?.action === 'add-folder'" for="rss-folder-path">
          <span>Folder path</span>
          <input
            id="rss-folder-path"
            v-model="itemPath"
            class="field"
            autocomplete="off"
            required
            autofocus
            :aria-describedby="rssItemError ? 'rss-item-error' : undefined"
          />
        </label>
        <div v-else class="rss-remove-copy">
          <p>Remove this RSS item?</p>
          <code>{{ rssItemDialog?.target }}</code>
        </div>
        <p v-if="rssItemError" id="rss-item-error" class="form-error" role="alert">
          {{ rssItemError }}
        </p>
      </form>
      <template #footer>
        <button class="btn" type="button" :disabled="rssItemWorking" @click="closeRssItemDialog">
          Cancel
        </button>
        <button
          class="btn"
          :class="rssItemDialog?.action === 'remove' ? 'btn-danger' : 'btn-primary'"
          type="submit"
          form="rss-item-form"
          :disabled="!rssItemSubmittable"
        >
          <LoaderCircle v-if="rssItemWorking" class="spin" :size="16" />{{ rssItemSubmitLabel }}
        </button>
      </template>
    </AppDialog>

    <AppDialog
      v-model:open="rulesOpen"
      title="RSS download rules"
      description="Rules are evaluated by qBittorrent on the host."
      wide
      fullscreen-mobile
    >
      <div class="rules-layout">
        <aside>
          <button class="btn new-rule" type="button" @click="newRule">
            <Plus :size="14" />New rule</button
          ><button
            v-for="(_, name) in rules"
            :key="name"
            type="button"
            :class="{ active: ruleName === name }"
            @click="editRule(name)"
          >
            {{ name }}
          </button>
        </aside>
        <form id="rss-rule-form" class="rule-form" @submit.prevent="saveRule">
          <label><span>Rule name</span><input v-model="ruleName" class="field" required /></label
          ><label class="check"
            ><input v-model="ruleDefinition.enabled" type="checkbox" />Enabled</label
          >
          <div class="rule-grid">
            <label
              ><span>Must contain</span
              ><input v-model="ruleDefinition.mustContain" class="field" /></label
            ><label
              ><span>Must not contain</span
              ><input v-model="ruleDefinition.mustNotContain" class="field" /></label
            ><label
              ><span>Episode filter</span
              ><input v-model="ruleDefinition.episodeFilter" class="field" /></label
            ><label
              ><span>Save path</span
              ><input v-model="ruleDefinition.savePath" class="field" /></label
            ><label
              ><span>Category</span><input v-model="ruleDefinition.category" class="field" /></label
            ><label><span>Tags</span><input v-model="ruleDefinition.tags" class="field" /></label>
          </div>
          <div class="rule-checks">
            <label
              ><input v-model="ruleDefinition.useRegex" type="checkbox" />Use regular
              expressions</label
            ><label
              ><input v-model="ruleDefinition.smartFilter" type="checkbox" />Smart episode
              filter</label
            >
          </div>
          <fieldset>
            <legend>Affected feeds</legend>
            <label v-for="feed in feeds" :key="feed.path"
              ><input
                v-model="ruleDefinition.affectedFeeds"
                type="checkbox"
                :value="feed.url"
                :disabled="!feed.url"
              />{{ feed.title }}</label
            >
          </fieldset>
        </form>
      </div>
      <template #footer
        ><button class="btn" type="button" @click="rulesOpen = false">Close</button
        ><button class="btn btn-primary" type="submit" form="rss-rule-form">
          Save rule
        </button></template
      >
    </AppDialog>
  </RouteScaffold>
</template>

<style scoped>
.rss-layout {
  display: grid;
  min-height: 480px;
  height: 100%;
  grid-template-columns: 220px 320px minmax(300px, 1fr);
  gap: 10px;
}
.feed-panel,
.article-list,
.article-detail {
  min-height: 0;
  overflow: auto;
}
.feed-panel > header,
.article-list > header {
  position: sticky;
  z-index: 2;
  top: 0;
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  padding: 8px 10px;
}
.feed-panel header span {
  display: flex;
}
.feed-panel header button {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  background: transparent;
  color: rgb(var(--color-accent));
}
.feed-item {
  display: grid;
  width: 100%;
  min-height: 38px;
  grid-template-columns: 20px minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  border: 0;
  border-bottom: 1px solid rgb(var(--color-line));
  background: transparent;
  color: inherit;
  padding: 0 9px;
  text-align: left;
}
.feed-item span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.feed-item small {
  color: rgb(var(--color-muted));
}
.feed-item.active {
  background: rgb(var(--color-accent-soft));
  color: rgb(var(--color-ink));
  font-weight: 650;
}
.feed-item.error {
  color: rgb(var(--color-danger));
}
.feed-panel footer {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 5px;
  border-top: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  padding: 6px;
}
.feed-panel footer button {
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.article-list header strong,
.article-list header small {
  display: block;
}
.article-list header small {
  color: rgb(var(--color-muted));
}
.article-list header input {
  width: 135px;
  height: 32px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 7px;
  background: transparent;
  color: inherit;
  padding: 0 7px;
}
.article-item {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  width: 100%;
  min-height: 56px;
  grid-template-columns: 9px minmax(0, 1fr);
  gap: 2px 5px;
  border: 0;
  border-bottom: 1px solid rgb(var(--color-line));
  background: transparent;
  color: inherit;
  padding: 8px 10px;
  text-align: left;
}
.article-space {
  position: relative;
  width: 100%;
}
.article-item strong {
  overflow: hidden;
  font-size: 12px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.article-item small {
  grid-column: 2;
  color: rgb(var(--color-muted));
}
.article-item.active {
  background: rgb(var(--color-accent-soft));
}
.article-item.unread strong {
  font-weight: 750;
}
.unread-dot {
  width: 6px;
  height: 6px;
  align-self: center;
  border-radius: 50%;
  background: transparent;
}
.unread .unread-dot {
  background: rgb(var(--color-accent));
}
.article-detail > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 15px;
}
.article-detail h2 {
  margin: 0;
  font-size: 16px;
}
.article-detail p {
  margin: 3px 0 0;
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.article-description {
  padding: 16px;
  line-height: 1.65;
}
.rss-state {
  display: flex;
  min-height: 270px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: rgb(var(--color-muted));
}
.rss-state.error {
  color: rgb(var(--color-danger));
}
.empty-copy {
  color: rgb(var(--color-muted));
  padding: 9px;
  font-size: 12px;
}
.rss-item-form,
.rss-item-form label {
  display: grid;
  gap: 9px;
}
.rss-item-form {
  gap: 14px;
}
.rss-item-form label > span {
  font-size: 12px;
  font-weight: 650;
}
.rss-item-form .form-error {
  margin: 0;
  color: rgb(var(--color-danger));
}
.rss-remove-copy p {
  margin-top: 0;
}
.rss-remove-copy code {
  display: block;
  overflow-wrap: anywhere;
  border-radius: 7px;
  background: rgb(var(--color-surface-muted));
  padding: 10px;
  white-space: pre-wrap;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.rules-layout {
  display: grid;
  min-height: 440px;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 16px;
}
.rules-layout aside {
  border-right: 1px solid rgb(var(--color-line));
  padding-right: 10px;
}
.rules-layout aside > button {
  display: flex;
  width: 100%;
  min-height: 34px;
  align-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
  padding: 0 8px;
  text-align: left;
}
.rules-layout aside > button.active {
  background: rgb(var(--color-accent-soft));
  color: rgb(var(--color-accent));
}
.rules-layout .new-rule {
  margin-bottom: 8px;
}
.rule-form {
  display: grid;
  align-content: start;
  gap: 13px;
}
.rule-form label > span {
  display: block;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: 650;
}
.rule-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 11px;
}
.check,
.rule-checks label {
  display: flex;
  align-items: center;
  gap: 7px;
}
.rule-checks {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
}
.rule-form fieldset {
  display: grid;
  gap: 5px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 8px;
}
.rule-form fieldset label {
  display: flex;
  gap: 6px;
}
@media (max-width: 1000px) {
  .rss-layout {
    grid-template-columns: 210px 290px minmax(280px, 1fr);
    overflow-x: auto;
  }
}
@media (max-width: 767px) {
  .rss-layout {
    display: block;
    height: auto;
    overflow: visible;
  }
  .feed-panel,
  .article-list,
  .article-detail {
    max-height: 360px;
    margin-bottom: 10px;
  }
  .article-detail {
    min-height: 320px;
  }
  .rules-layout {
    grid-template-columns: 1fr;
  }
  .rules-layout aside {
    display: flex;
    gap: 4px;
    border-right: 0;
    border-bottom: 1px solid rgb(var(--color-line));
    padding: 0 0 9px;
    overflow-x: auto;
  }
  .rules-layout aside > button {
    width: auto;
    flex: 0 0 auto;
  }
  .rule-grid {
    grid-template-columns: 1fr;
  }
}
</style>
