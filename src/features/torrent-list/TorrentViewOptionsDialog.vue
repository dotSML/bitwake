<script setup lang="ts">
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from '@lucide/vue'
import { computed } from 'vue'
import AppDialog from '@/ui/primitives/AppDialog.vue'
import {
  getOrderedTorrentTableColumns,
  torrentTableColumns,
  type TorrentTableColumnId
} from '@/domains/torrents/tableColumns'
import { useMediaQuery, MOBILE_MEDIA_QUERY } from '@/ui/composables/useMediaQuery'
import { usePreferencesStore, type DensityPreference } from '@/stores/preferences'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const preferences = usePreferencesStore()
const isMobile = useMediaQuery(MOBILE_MEDIA_QUERY)
const orderedColumns = computed(() => getOrderedTorrentTableColumns(preferences.value.columnOrder))
const density = computed(() =>
  isMobile.value ? preferences.value.mobileDensity : preferences.value.density
)
const unusedSortColumns = computed(() =>
  torrentTableColumns.filter((column) => !preferences.value.sort.some(({ id }) => id === column.id))
)

function setDensity(value: DensityPreference): void {
  preferences.patch(isMobile.value ? { mobileDensity: value } : { density: value })
}

function setSortField(index: number, id: TorrentTableColumnId): void {
  const sort = [...preferences.value.sort]
  if (sort.some((entry, entryIndex) => entryIndex !== index && entry.id === id)) return
  const current = sort[index]
  if (!current) return
  sort[index] = { ...current, id }
  preferences.patch({ sort })
}

function setSortDirection(index: number, desc: boolean): void {
  const sort = [...preferences.value.sort]
  const current = sort[index]
  if (!current) return
  sort[index] = { ...current, desc }
  preferences.patch({ sort })
}

function addSort(): void {
  const next = unusedSortColumns.value[0]
  if (next) preferences.patch({ sort: [...preferences.value.sort, { id: next.id, desc: false }] })
}

function removeSort(index: number): void {
  const sort = preferences.value.sort.filter((_, entryIndex) => entryIndex !== index)
  preferences.patch({ sort: sort.length ? sort : [{ id: 'name', desc: false }] })
}

function toggleColumn(id: TorrentTableColumnId): void {
  if (id === 'name') return
  const visible = new Set(preferences.value.visibleColumns)
  if (visible.has(id)) visible.delete(id)
  else visible.add(id)
  preferences.patch({ visibleColumns: [...visible, 'name'] })
}

function moveColumn(id: TorrentTableColumnId, direction: -1 | 1): void {
  const order = orderedColumns.value.map((column) => column.id)
  const from = order.indexOf(id)
  const to = from + direction
  if (from < 0 || to < 0 || to >= order.length) return
  ;[order[from], order[to]] = [order[to]!, order[from]!]
  preferences.patch({ columnOrder: order })
}

function resetColumns(): void {
  preferences.patch({ columnOrder: [], columnWidths: {} })
}
</script>

<template>
  <AppDialog
    :open="props.open"
    title="View options"
    description="Changes apply immediately."
    fullscreen-mobile
    @update:open="emit('update:open', $event)"
  >
    <div class="view-options">
      <section>
        <h3>Sort</h3>
        <div
          v-for="(rule, index) in preferences.value.sort"
          :key="`${rule.id}-${index}`"
          class="sort-rule"
        >
          <select
            :value="rule.id"
            :aria-label="`Sort priority ${index + 1} field`"
            @change="
              setSortField(
                index,
                ($event.target as HTMLSelectElement).value as TorrentTableColumnId
              )
            "
          >
            <option
              v-for="column in torrentTableColumns"
              :key="column.id"
              :value="column.id"
              :disabled="
                preferences.value.sort.some(
                  (entry, entryIndex) => entryIndex !== index && entry.id === column.id
                )
              "
            >
              {{ column.label }}
            </option>
          </select>
          <select
            :value="rule.desc ? 'desc' : 'asc'"
            :aria-label="`Sort priority ${index + 1} direction`"
            @change="setSortDirection(index, ($event.target as HTMLSelectElement).value === 'desc')"
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
          <button
            class="icon-option"
            type="button"
            :aria-label="`Remove ${rule.id} sort rule`"
            @click="removeSort(index)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
        <button
          class="btn option-add"
          type="button"
          :disabled="!unusedSortColumns.length"
          @click="addSort"
        >
          <Plus :size="16" />Add sort
        </button>
      </section>
      <section>
        <h3>Row density</h3>
        <div class="density-options" role="radiogroup" aria-label="Row density">
          <label
            v-for="option in ['comfortable', 'compact', 'extra-compact'] as const"
            :key="option"
          >
            <input
              type="radio"
              name="row-density"
              :checked="density === option"
              @change="setDensity(option)"
            />
            {{
              option === 'extra-compact'
                ? 'Extra compact'
                : option[0]?.toUpperCase() + option.slice(1)
            }}
          </label>
        </div>
      </section>
      <section v-if="!isMobile">
        <h3>Columns</h3>
        <div v-for="(column, index) in orderedColumns" :key="column.id" class="column-option">
          <label>
            <input
              type="checkbox"
              :checked="preferences.value.visibleColumns.includes(column.id)"
              :disabled="column.id === 'name'"
              @change="toggleColumn(column.id)"
            />
            <Check v-if="column.id === 'name'" :size="14" aria-hidden="true" />{{ column.label }}
            <small v-if="column.id === 'name'">Required</small>
          </label>
          <span>
            <button
              class="icon-option"
              type="button"
              :disabled="index === 0"
              :aria-label="`Move ${column.label} column earlier`"
              @click="moveColumn(column.id, -1)"
            >
              <ArrowUp :size="15" />
            </button>
            <button
              class="icon-option"
              type="button"
              :disabled="index === orderedColumns.length - 1"
              :aria-label="`Move ${column.label} column later`"
              @click="moveColumn(column.id, 1)"
            >
              <ArrowDown :size="15" />
            </button>
          </span>
        </div>
        <button class="btn option-add" type="button" @click="resetColumns">
          Reset column layout and widths
        </button>
      </section>
    </div>
    <template #footer
      ><button class="btn btn-primary" type="button" @click="emit('update:open', false)">
        Close
      </button></template
    >
  </AppDialog>
</template>

<style scoped>
.view-options {
  display: grid;
  gap: 24px;
}
.view-options section {
  display: grid;
  gap: 9px;
}
.view-options h3 {
  margin: 0;
  font-size: 14px;
}
.sort-rule,
.column-option {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.sort-rule select {
  min-width: 0;
  height: 37px;
  flex: 1;
}
.density-options {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.density-options label,
.column-option label {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  gap: 7px;
}
.column-option {
  justify-content: space-between;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 4px 0;
}
.column-option small {
  color: rgb(var(--color-muted));
}
.icon-option {
  display: inline-grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: inherit;
}
.icon-option:disabled {
  opacity: 0.38;
}
.option-add {
  justify-self: start;
}
@media (max-width: 767px) {
  .icon-option {
    width: 44px;
    height: 44px;
  }
  .density-options label {
    min-height: 44px;
  }
}
</style>
