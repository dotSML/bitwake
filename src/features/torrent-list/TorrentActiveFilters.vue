<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { X } from '@lucide/vue'
import type { TorrentFilters } from '@/domains/torrents/filtering'
import { useTorrentsStore } from '@/stores/torrents'

type ClearableFilter = Exclude<keyof TorrentFilters, 'regex' | 'negative'> | 'regex' | 'negative'

interface FilterChip {
  id: ClearableFilter
  label: string
}

const torrents = useTorrentsStore()
const bar = ref<HTMLElement | null>(null)

const chips = computed<FilterChip[]>(() => {
  const filters = torrents.filters
  const result: FilterChip[] = []
  if (filters.text.trim()) result.push({ id: 'text', label: `Text: ${filters.text.trim()}` })
  if (filters.regex) result.push({ id: 'regex', label: 'Regular expression' })
  if (filters.negative) result.push({ id: 'negative', label: 'Exclude matches' })
  if (filters.state !== 'all') result.push({ id: 'state', label: `State: ${filters.state}` })
  if (filters.category !== null) {
    result.push({
      id: 'category',
      label: filters.category ? `Category: ${filters.category}` : 'Uncategorized'
    })
  }
  if (filters.tag !== null) result.push({ id: 'tag', label: `Tag: ${filters.tag}` })
  if (filters.tracker !== null) {
    result.push({
      id: 'tracker',
      label: filters.tracker === '__trackerless__' ? 'Trackerless' : `Tracker: ${filters.tracker}`
    })
  }
  if (filters.savePath !== null) result.push({ id: 'savePath', label: `Path: ${filters.savePath}` })
  return result
})

function focusAdvancedFilterTrigger(): void {
  document.querySelector<HTMLElement>('.advanced-filter-button')?.focus()
}

async function clearFilter(id: ClearableFilter, index: number, event: MouseEvent): Promise<void> {
  const restoreFocus = document.activeElement === event.currentTarget
  switch (id) {
    case 'text':
      torrents.updateFilters({ text: '' })
      break
    case 'state':
      torrents.updateFilters({ state: 'all' })
      break
    case 'regex':
    case 'negative':
      torrents.updateFilters({ [id]: false })
      break
    case 'category':
    case 'tag':
    case 'tracker':
    case 'savePath':
      torrents.updateFilters({ [id]: null })
      break
  }

  if (!restoreFocus) return
  await nextTick()
  const remaining = bar.value?.querySelectorAll<HTMLButtonElement>('.active-filter-chips button')
  const adjacent = remaining?.[Math.min(index, remaining.length - 1)]
  if (adjacent) adjacent.focus()
  else focusAdvancedFilterTrigger()
}

async function clearAllFilters(event: MouseEvent): Promise<void> {
  const restoreFocus = document.activeElement === event.currentTarget
  torrents.clearFilters()
  if (!restoreFocus) return
  await nextTick()
  focusAdvancedFilterTrigger()
}
</script>

<template>
  <div v-if="chips.length || torrents.invalidRegex" ref="bar" class="active-filter-bar">
    <span class="active-filter-count" aria-live="polite">
      {{ torrents.activeFilterCount }} active
    </span>
    <div class="active-filter-chips" aria-label="Active torrent filters">
      <button
        v-for="(chip, index) in chips"
        :key="chip.id"
        type="button"
        :title="chip.label"
        :aria-label="`Remove ${chip.label} filter`"
        @click="clearFilter(chip.id, index, $event)"
      >
        <span>{{ chip.label }}</span
        ><X :size="13" aria-hidden="true" />
      </button>
    </div>
    <span v-if="torrents.invalidRegex" class="active-filter-error" role="alert">
      Invalid or unsafe regular expression
    </span>
    <button class="clear-all-filters" type="button" @click="clearAllFilters">Clear all</button>
  </div>
</template>

<style scoped>
.active-filter-bar {
  display: flex;
  min-width: 0;
  min-height: 38px;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-line));
  background: rgb(var(--color-surface));
  padding: 5px 12px;
}
.active-filter-count {
  flex: 0 0 auto;
  color: rgb(var(--color-muted));
  font-size: 11px;
  font-weight: 700;
}
.active-filter-chips {
  display: flex;
  min-width: 0;
  flex: 1;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.active-filter-chips button {
  display: inline-flex;
  min-width: 0;
  min-height: 27px;
  flex: 0 0 auto;
  align-items: center;
  gap: 5px;
  max-width: 260px;
  border: 1px solid rgb(var(--color-accent) / 0.35);
  border-radius: 999px;
  background: rgb(var(--color-accent-soft));
  color: rgb(var(--color-ink));
  padding: 0 8px;
  cursor: pointer;
}
.active-filter-chips button span {
  overflow: hidden;
  text-overflow: ellipsis;
  unicode-bidi: plaintext;
  white-space: nowrap;
}
.active-filter-error {
  flex: 0 0 auto;
  color: rgb(var(--color-danger));
  font-size: 11px;
}
.clear-all-filters {
  min-height: 30px;
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: rgb(var(--color-accent));
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}
@media (max-width: 767px) {
  .active-filter-bar {
    min-height: 48px;
    padding: 4px 10px;
  }
  .active-filter-count {
    display: none;
  }
  .active-filter-chips button,
  .clear-all-filters {
    min-height: 40px;
  }
  .active-filter-error {
    position: absolute;
    left: -10000px;
  }
}
</style>
