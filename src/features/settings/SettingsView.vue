<script setup lang="ts">
import { AlertTriangle, Check, LoaderCircle, Search, ShieldAlert } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'
import { useApi } from '@/app/providers/api'
import { useNotificationsStore } from '@/stores/notifications'
import {
  usePreferencesStore,
  type DensityPreference,
  type ThemePreference
} from '@/stores/preferences'
import RouteScaffold from '@/ui/components/RouteScaffold.vue'
import MediaPlacementSettings from './MediaPlacementSettings.vue'
import { settingsSchema, type SettingDefinition, type SettingsSection } from './settingsSchema'

type SettingsNavigationSection = SettingsSection | 'Media Placement' | 'Interface'

const api = useApi()
const ui = usePreferencesStore()
const notifications = useNotificationsStore()
const serverValues = ref<Record<string, unknown>>({})
const draft = ref<Record<string, unknown>>({})
const search = ref('')
const activeSection = ref<SettingsNavigationSection>('Downloads')
const loading = ref(true)
const saving = ref(false)
const errors = ref<Record<string, string>>({})
const networkInterfaces = ref<Array<{ name: string; value: string }>>([])
const networkAddresses = ref<string[]>([])
const networkOptionsLoading = ref(false)
const networkOptionsError = ref<string | null>(null)
let networkAddressRequest = 0
let networkOptionsGeneration = 0
const sections: SettingsNavigationSection[] = [
  'Downloads',
  'Connection',
  'Speed',
  'BitTorrent',
  'Queueing and seeding',
  'RSS',
  'Web UI',
  'Advanced',
  'Media Placement',
  'Interface'
]
const shareLimitPairs = [
  { enabled: 'max_ratio_enabled', value: 'max_ratio', defaultValue: 1 },
  { enabled: 'max_seeding_time_enabled', value: 'max_seeding_time', defaultValue: 60 },
  {
    enabled: 'max_inactive_seeding_time_enabled',
    value: 'max_inactive_seeding_time',
    defaultValue: 60
  }
] as const
const schedulerTimePairs = [
  ['schedule_from_hour', 'schedule_from_min'],
  ['schedule_to_hour', 'schedule_to_min']
] as const
const sensitivePreferenceKey =
  /(?:password|passwd|secret|token|api[_-]?key|private[_-]?key|cookie)/i
const securityDisableKeys = [
  'web_ui_csrf_protection_enabled',
  'web_ui_clickjacking_protection_enabled',
  'web_ui_secure_cookie_enabled',
  'web_ui_host_header_validation_enabled'
] as const
const authenticationBypassKeys = [
  'bypass_local_auth',
  'bypass_auth_subnet_whitelist_enabled'
] as const

const visibleDefinitions = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase()
  return settingsSchema.filter((definition) =>
    !needle
      ? definition.section === activeSection.value
      : `${definition.label} ${definition.description ?? ''} ${definition.key}`
          .toLocaleLowerCase()
          .includes(needle)
  )
})
function hasSettingChanged(definition: SettingDefinition): boolean {
  const pair = shareLimitPairs.find(({ value }) => value === definition.key)
  if (pair && draft.value[pair.enabled] === false && serverValues.value[pair.enabled] === false) {
    return false
  }
  return draft.value[definition.key] !== serverValues.value[definition.key]
}

const changedServer = computed(() => settingsSchema.some(hasSettingChanged))
const criticalChanged = computed(() =>
  settingsSchema.some(
    (definition) =>
      definition.connectivityCritical &&
      draft.value[definition.key] !== serverValues.value[definition.key]
  )
)
const knownKeys = new Set(settingsSchema.map((definition) => definition.key))
const unknownKeys = computed(() =>
  Object.keys(serverValues.value)
    .filter((key) => !knownKeys.has(key) && !isSensitivePreferenceKey(key))
    .sort()
)

function isSensitivePreferenceKey(key: string): boolean {
  return key !== 'web_ui_secure_cookie_enabled' && sensitivePreferenceKey.test(key)
}

function sanitizePreferences(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => !isSensitivePreferenceKey(key))
  )
}

function selectSection(section: SettingsNavigationSection): void {
  activeSection.value = section
  search.value = ''
}

function uniqueOptions(
  options: Array<{ value: string; label: string }>
): Array<{ value: string; label: string }> {
  return [...new Map(options.map((option) => [option.value, option])).values()]
}

function optionsFor(
  definition: SettingDefinition
): Array<{ value: string | number; label: string }> {
  if (definition.dynamicOptions === 'network-interfaces') {
    const current = String(draft.value.current_network_interface ?? '')
    return uniqueOptions([
      { value: '', label: 'Any interface' },
      ...networkInterfaces.value.map(({ name, value }) => ({ value, label: name || value })),
      ...(current && !networkInterfaces.value.some(({ value }) => value === current)
        ? [{ value: current, label: `${current} (current selection)` }]
        : [])
    ])
  }
  if (definition.dynamicOptions === 'network-addresses') {
    const current = String(draft.value.current_interface_address ?? '')
    return uniqueOptions([
      { value: '', label: 'All addresses' },
      { value: '0.0.0.0', label: 'All IPv4 addresses' },
      { value: '::', label: 'All IPv6 addresses' },
      ...networkAddresses.value.map((value) => ({ value, label: value })),
      ...(current && !['0.0.0.0', '::', ...networkAddresses.value].includes(current)
        ? [{ value: current, label: `${current} (current selection)` }]
        : [])
    ])
  }
  return definition.options ?? []
}

async function loadNetworkAddresses(interfaceName: string): Promise<void> {
  const request = ++networkAddressRequest
  networkOptionsLoading.value = true
  try {
    const addresses = await api.app.networkInterfaceAddressList(interfaceName)
    if (request === networkAddressRequest) {
      networkAddresses.value = addresses
      networkOptionsError.value = null
    }
  } catch {
    if (request === networkAddressRequest) {
      networkAddresses.value = []
      networkOptionsError.value =
        'Network interface addresses could not be loaded. Current values remain available.'
    }
  } finally {
    if (request === networkAddressRequest) networkOptionsLoading.value = false
  }
}

async function loadNetworkOptions(values: Record<string, unknown>): Promise<void> {
  const generation = ++networkOptionsGeneration
  let interfaceLoadFailed = false
  networkOptionsLoading.value = true
  try {
    const interfaces = await api.app.networkInterfaceList()
    if (generation !== networkOptionsGeneration) return
    networkInterfaces.value = interfaces
    networkOptionsError.value = null
  } catch {
    if (generation !== networkOptionsGeneration) return
    interfaceLoadFailed = true
    networkInterfaces.value = []
    networkOptionsError.value =
      'Network interfaces could not be loaded. Current values remain available.'
  } finally {
    if (generation === networkOptionsGeneration) networkOptionsLoading.value = false
  }
  if (generation !== networkOptionsGeneration) return
  await loadNetworkAddresses(String(values.current_network_interface ?? ''))
  if (generation !== networkOptionsGeneration) return
  if (interfaceLoadFailed)
    networkOptionsError.value =
      'Network interfaces could not be loaded. Current values remain available.'
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const values = sanitizePreferences(await api.app.preferences())
    serverValues.value = values
    draft.value = structuredClone(values)
    loading.value = false
    void loadNetworkOptions(values)
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Settings could not be loaded.',
      'error'
    )
    loading.value = false
  }
}

function setValue(definition: SettingDefinition, raw: string | boolean): void {
  const value =
    definition.control === 'number' ||
    (definition.control === 'select' &&
      definition.options?.some((option) => typeof option.value === 'number'))
      ? Number(raw) * (definition.apiScale ?? 1)
      : raw
  draft.value = { ...draft.value, [definition.key]: value }
  if (definition.key === 'current_network_interface') {
    networkOptionsGeneration += 1
    draft.value = { ...draft.value, current_interface_address: '' }
    void loadNetworkAddresses(String(value))
  }
  const pair = shareLimitPairs.find(({ enabled }) => enabled === definition.key)
  if (pair && value === true && Number(draft.value[pair.value]) < 0) {
    draft.value = { ...draft.value, [pair.value]: pair.defaultValue }
  }
  validate(definition, value)
}
function validate(definition: SettingDefinition, value: unknown): void {
  const next = { ...errors.value }
  delete next[definition.key]
  if (definition.control === 'number') {
    const pair = shareLimitPairs.find(({ value: valueKey }) => valueKey === definition.key)
    if (pair && draft.value[pair.enabled] === false) {
      errors.value = next
      return
    }
    const number = Number(value) / (definition.apiScale ?? 1)
    if (!Number.isFinite(number)) next[definition.key] = 'Enter a valid number.'
    else if (definition.min !== undefined && number < definition.min)
      next[definition.key] = `Minimum: ${definition.min}.`
    else if (definition.max !== undefined && number > definition.max)
      next[definition.key] = `Maximum: ${definition.max}.`
  }
  errors.value = next
}
function displayValue(definition: SettingDefinition): string {
  const value = Number(draft.value[definition.key])
  if (definition.control === 'number' && Number.isFinite(value)) {
    return String(value / (definition.apiScale ?? 1))
  }
  return String(draft.value[definition.key] ?? '')
}
function isSettingDisabled(definition: SettingDefinition): boolean {
  if (saving.value) return true
  const pair = shareLimitPairs.find(({ value }) => value === definition.key)
  if (pair && draft.value[pair.enabled] === false) return true
  if (definition.key === 'torrent_stop_condition' && draft.value.add_stopped_enabled === true)
    return true
  if (definition.key === 'ip_filter_path' && draft.value.ip_filter_enabled !== true) return true
  if (definition.key === 'current_interface_address' && networkOptionsLoading.value) return true
  if (
    definition.key === 'max_ratio_act' &&
    !shareLimitPairs.some(({ enabled }) => draft.value[enabled] === true)
  )
    return true
  return false
}
async function save(): Promise<void> {
  if (saving.value) return
  for (const definition of settingsSchema) {
    if (Object.prototype.hasOwnProperty.call(draft.value, definition.key)) {
      validate(definition, draft.value[definition.key])
    }
  }
  if (Object.keys(errors.value).length) return
  const pairedKeys = new Set<string>(
    shareLimitPairs.flatMap(({ enabled, value }) => [enabled, value])
  )
  const changed: Record<string, unknown> = Object.fromEntries(
    settingsSchema
      .filter(
        (definition) =>
          !pairedKeys.has(definition.key) &&
          draft.value[definition.key] !== serverValues.value[definition.key]
      )
      .map((definition) => [definition.key, draft.value[definition.key]])
  )
  for (const pair of shareLimitPairs) {
    if (draft.value[pair.enabled] === false && serverValues.value[pair.enabled] === false) continue
    if (
      draft.value[pair.enabled] === serverValues.value[pair.enabled] &&
      draft.value[pair.value] === serverValues.value[pair.value]
    )
      continue
    if (draft.value[pair.enabled] === false) changed[pair.enabled] = false
    else changed[pair.value] = draft.value[pair.value]
  }
  for (const [hourKey, minuteKey] of schedulerTimePairs) {
    if (
      draft.value[hourKey] !== serverValues.value[hourKey] ||
      draft.value[minuteKey] !== serverValues.value[minuteKey]
    ) {
      changed[hourKey] = draft.value[hourKey]
      changed[minuteKey] = draft.value[minuteKey]
    }
  }
  if (!Object.keys(changed).length) return
  const weakenedProtections = securityDisableKeys.filter(
    (key) => serverValues.value[key] === true && draft.value[key] === false
  )
  const enabledBypasses = authenticationBypassKeys.filter(
    (key) => serverValues.value[key] !== true && draft.value[key] === true
  )
  const securityRiskChanged = weakenedProtections.length > 0 || enabledBypasses.length > 0
  if (securityRiskChanged) {
    const changes = [...weakenedProtections, ...enabledBypasses].join(', ')
    if (
      !window.confirm(
        `Security warning: this weakens Web UI protections (${changes}) and may expose or disconnect this session. Save anyway?`
      )
    )
      return
  } else if (
    criticalChanged.value &&
    !window.confirm(
      'These Web UI or network changes may disconnect this browser. Save them anyway?'
    )
  )
    return
  const autorunChanged =
    (serverValues.value.autorun_enabled !== true && draft.value.autorun_enabled === true) ||
    draft.value.autorun_program !== serverValues.value.autorun_program
  if (
    autorunChanged &&
    !window.confirm(
      'Host command warning: this changes a program qBittorrent can execute on the server. Run only commands you trust. Save anyway?'
    )
  )
    return
  const shareAction = Number(draft.value.max_ratio_act)
  const destructiveShareLimitsChanged = shareLimitPairs.some(
    ({ enabled, value }) =>
      draft.value[enabled] === true &&
      (serverValues.value[enabled] !== true || draft.value[value] !== serverValues.value[value])
  )
  if (
    (shareAction !== Number(serverValues.value.max_ratio_act) || destructiveShareLimitsChanged) &&
    (shareAction === 1 || shareAction === 3) &&
    !window.confirm(
      shareAction === 3
        ? 'Destructive action warning: reaching a global share limit will remove the torrent and delete its content files. Save anyway?'
        : 'Removal warning: reaching a global share limit will remove the torrent from qBittorrent. Save anyway?'
    )
  )
    return
  saving.value = true
  try {
    await api.app.setPreferences(changed)
    notifications.push('qBittorrent settings saved.', 'success')
    await load()
  } catch (cause) {
    notifications.push(
      cause instanceof Error ? cause.message : 'Settings could not be saved.',
      'error'
    )
  } finally {
    saving.value = false
  }
}

onMounted(() => void load())
</script>

<template>
  <RouteScaffold
    title="Settings"
    description="qBittorrent server preferences and this WebUI's interface settings."
  >
    <template #actions
      ><button
        v-if="activeSection !== 'Media Placement'"
        class="btn btn-primary"
        type="button"
        :disabled="saving || !changedServer || Object.keys(errors).length > 0"
        @click="save"
      >
        <LoaderCircle v-if="saving" class="spin" :size="16" /><Check v-else :size="16" />{{
          saving ? 'Saving…' : 'Save changes'
        }}
      </button></template
    >
    <section class="settings-shell panel">
      <aside class="settings-nav">
        <div class="settings-search">
          <Search :size="15" /><input
            v-model="search"
            type="search"
            placeholder="Search settings"
          />
        </div>
        <button
          v-for="section in sections"
          :key="section"
          type="button"
          :class="{ active: activeSection === section && !search }"
          @click="selectSection(section)"
        >
          {{ section }}
        </button>
      </aside>
      <main class="settings-content">
        <div v-if="loading" class="settings-state">
          <LoaderCircle class="spin" :size="20" />Loading settings…
        </div>
        <MediaPlacementSettings v-else-if="activeSection === 'Media Placement' && !search" />
        <template v-else-if="activeSection === 'Interface' && !search">
          <header>
            <h2>NeoTorrent interface</h2>
            <p>These preferences affect only this Alternative WebUI.</p>
          </header>
          <div class="setting-list">
            <label class="setting-row"
              ><span
                ><strong>Theme</strong
                ><small>Choose a light, dark, or operating-system theme.</small></span
              ><select
                :value="ui.value.theme"
                @change="
                  ui.patch({ theme: ($event.target as HTMLSelectElement).value as ThemePreference })
                "
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select></label
            >
            <label class="setting-row"
              ><span
                ><strong>Desktop density</strong
                ><small>Controls torrent table row height.</small></span
              ><select
                :value="ui.value.density"
                @change="
                  ui.patch({
                    density: ($event.target as HTMLSelectElement).value as DensityPreference
                  })
                "
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
                <option value="extra-compact">Extra compact</option>
              </select></label
            >
            <label class="setting-row"
              ><span
                ><strong>Mobile density</strong
                ><small>Compact modes preserve minimum touch target sizes.</small></span
              ><select
                :value="ui.value.mobileDensity"
                @change="
                  ui.patch({
                    mobileDensity: ($event.target as HTMLSelectElement).value as DensityPreference
                  })
                "
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
                <option value="extra-compact">Extra compact</option>
              </select></label
            >
            <label class="setting-row"
              ><span
                ><strong>Live refresh interval</strong
                ><small>One second is recommended on the torrent screen.</small></span
              ><select
                :value="ui.value.pollingInterval"
                @change="
                  ui.patch({
                    pollingInterval: Number(($event.target as HTMLSelectElement).value) as
                      1000 | 2000 | 5000
                  })
                "
              >
                <option :value="1000">1 second</option>
                <option :value="2000">2 seconds</option>
                <option :value="5000">5 seconds</option>
              </select></label
            >
            <label class="setting-row"
              ><span><strong>Transfer units</strong></span
              ><select
                :value="ui.value.speedUnit"
                @change="
                  ui.patch({
                    speedUnit: ($event.target as HTMLSelectElement).value as 'binary' | 'decimal'
                  })
                "
              >
                <option value="binary">Binary (MiB/s)</option>
                <option value="decimal">Decimal (MB/s)</option>
              </select></label
            >
          </div>
        </template>
        <template v-else>
          <header>
            <h2>{{ search ? 'Search results' : activeSection }}</h2>
            <p>
              {{ visibleDefinitions.length }} known setting{{
                visibleDefinitions.length === 1 ? '' : 's'
              }}.
            </p>
          </header>
          <div v-if="criticalChanged" class="critical-banner">
            <ShieldAlert :size="18" /><span
              >Connectivity-critical values have changed. Saving may move or disconnect this Web
              UI.</span
            >
          </div>
          <div
            v-if="networkOptionsError && (activeSection === 'Connection' || search)"
            class="option-error"
          >
            <AlertTriangle :size="18" /><span>{{ networkOptionsError }}</span>
          </div>
          <div class="setting-list">
            <label
              v-for="definition in visibleDefinitions"
              :key="definition.key"
              class="setting-row"
              :for="`setting-${definition.key}`"
              ><span
                ><strong>{{ definition.label }}</strong
                ><small>{{ definition.description ?? definition.key }}</small></span
              >
              <input
                v-if="definition.control === 'boolean'"
                :id="`setting-${definition.key}`"
                class="toggle"
                type="checkbox"
                :checked="draft[definition.key] === true"
                :disabled="saving"
                @change="setValue(definition, ($event.target as HTMLInputElement).checked)"
              />
              <select
                v-else-if="definition.control === 'select'"
                :id="`setting-${definition.key}`"
                :value="draft[definition.key] as string | number"
                :disabled="isSettingDisabled(definition)"
                @change="setValue(definition, ($event.target as HTMLSelectElement).value)"
              >
                <option
                  v-for="option in optionsFor(definition)"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
              <div v-else class="input-wrap">
                <input
                  :id="`setting-${definition.key}`"
                  class="field"
                  :type="definition.control === 'number' ? 'number' : 'text'"
                  :min="definition.min"
                  :max="definition.max"
                  :value="displayValue(definition)"
                  :disabled="isSettingDisabled(definition)"
                  :aria-invalid="Boolean(errors[definition.key])"
                  @input="setValue(definition, ($event.target as HTMLInputElement).value)"
                /><small v-if="errors[definition.key]" class="input-error">{{
                  errors[definition.key]
                }}</small>
              </div>
            </label>
            <p v-if="!visibleDefinitions.length" class="no-settings">
              No known editable settings match this search.
            </p>
          </div>
          <details v-if="activeSection === 'Advanced' && !search" class="unknown-settings">
            <summary>Future or unknown preference keys ({{ unknownKeys.length }})</summary>
            <p>
              Shown read-only because NeoTorrent has no validated editor for these values. Sensitive
              keys are omitted.
            </p>
            <dl>
              <template v-for="key in unknownKeys" :key="key"
                ><dt>{{ key }}</dt>
                <dd>
                  {{
                    typeof serverValues[key] === 'object'
                      ? '[structured value]'
                      : String(serverValues[key])
                  }}
                </dd></template
              >
            </dl>
          </details>
        </template>
        <footer class="mobile-save">
          <button
            class="btn btn-primary"
            type="button"
            :disabled="saving || !changedServer || Object.keys(errors).length > 0"
            @click="save"
          >
            <AlertTriangle v-if="criticalChanged" :size="16" /><Check v-else :size="16" />Save
            changes
          </button>
        </footer>
      </main>
    </section>
  </RouteScaffold>
</template>

<style scoped>
.settings-shell {
  display: grid;
  max-width: 1120px;
  min-height: 560px;
  height: 100%;
  grid-template-columns: 220px minmax(0, 1fr);
  margin: 0 auto;
  overflow: hidden;
}
.settings-nav {
  border-right: 1px solid rgb(var(--color-line));
  padding: 9px;
  overflow: auto;
}
.settings-search {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 8px;
  padding: 0 8px;
  margin-bottom: 9px;
}
.settings-search input {
  min-width: 0;
  height: 35px;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
}
.settings-nav > button {
  display: block;
  width: 100%;
  min-height: 36px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: rgb(var(--color-muted));
  padding: 0 9px;
  text-align: left;
}
.settings-nav > button.active {
  border-left: 3px solid rgb(var(--color-accent));
  background: rgb(var(--color-accent-soft));
  color: rgb(var(--color-ink));
  font-weight: 700;
}
.settings-content {
  min-width: 0;
  overflow: auto;
}
.settings-content > header {
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 15px 18px;
}
.settings-content h2 {
  margin: 0;
  font-size: 17px;
}
.settings-content header p {
  margin: 2px 0 0;
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.settings-state {
  display: flex;
  min-height: 300px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: rgb(var(--color-muted));
}
.critical-banner,
.option-error {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid rgb(var(--color-warning) / 0.4);
  background: rgb(var(--color-warning) / 0.1);
  color: rgb(var(--color-warning));
  padding: 9px 16px;
  font-size: 12px;
}
.setting-row {
  display: grid;
  min-height: 66px;
  grid-template-columns: minmax(180px, 1fr) minmax(150px, 280px);
  align-items: center;
  gap: 22px;
  border-bottom: 1px solid rgb(var(--color-line));
  padding: 10px 18px;
}
.setting-row > span strong,
.setting-row > span small {
  display: block;
}
.setting-row > span strong {
  font-size: 12px;
}
.setting-row > span small {
  margin-top: 2px;
  color: rgb(var(--color-muted));
  font-size: 10px;
}
.setting-row select {
  min-height: 37px;
  border: 1px solid rgb(var(--color-line-strong));
  border-radius: 8px;
  background: rgb(var(--color-surface));
  color: inherit;
  padding: 0 8px;
}
.toggle {
  justify-self: end;
  width: 18px;
  height: 18px;
  accent-color: rgb(var(--color-accent));
}
.input-wrap {
  min-width: 0;
}
.input-error {
  display: block;
  margin-top: 3px;
  color: rgb(var(--color-danger));
}
.no-settings {
  color: rgb(var(--color-muted));
  padding: 20px;
  text-align: center;
}
.unknown-settings {
  margin: 14px;
  border: 1px solid rgb(var(--color-line));
  border-radius: 8px;
  padding: 11px;
}
.unknown-settings summary {
  font-weight: 650;
  cursor: pointer;
}
.unknown-settings p {
  color: rgb(var(--color-muted));
  font-size: 11px;
}
.unknown-settings dl {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 12px;
  font-size: 10px;
}
.unknown-settings dt {
  color: rgb(var(--color-muted));
}
.unknown-settings dd {
  margin: 0;
  overflow: hidden;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mobile-save {
  display: none;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 767px) {
  .settings-shell {
    display: block;
    height: auto;
    overflow: visible;
  }
  .settings-nav {
    display: flex;
    gap: 4px;
    border-right: 0;
    border-bottom: 1px solid rgb(var(--color-line));
    overflow-x: auto;
  }
  .settings-search {
    min-width: 190px;
    margin: 0;
  }
  .settings-nav > button {
    width: auto;
    flex: 0 0 auto;
  }
  .setting-row {
    grid-template-columns: 1fr;
    gap: 7px;
    padding: 11px 13px;
  }
  .toggle {
    justify-self: start;
    width: 20px;
    height: 20px;
  }
  .mobile-save {
    position: sticky;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    border-top: 1px solid rgb(var(--color-line));
    background: rgb(var(--color-surface));
    padding: 9px;
  }
  .unknown-settings dl {
    grid-template-columns: 1fr;
  }
  .unknown-settings dd {
    margin-bottom: 5px;
    text-align: left;
  }
}
</style>
