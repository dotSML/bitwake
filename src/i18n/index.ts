import { createI18n } from 'vue-i18n'
import { setFormattingLocale } from '@/utils/format'
import { appIdentity, appStorageKeys } from '@/config/appIdentity'

const en = {
  app: { name: appIdentity.name, tagline: 'A focused qBittorrent workspace' },
  auth: {
    title: 'Sign in to qBittorrent',
    subtitle: 'Use the credentials configured in qBittorrent Web UI.',
    username: 'Username',
    password: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    submit: 'Sign in',
    signingIn: 'Signing in…',
    invalid: 'The username or password is incorrect.',
    forbidden: 'Too many attempts or access is blocked. Wait before trying again.',
    connection: 'qBittorrent could not be reached.',
    logout: 'Log out',
    privacy: 'Credentials are sent directly to this qBittorrent instance and are never stored.'
  },
  nav: {
    torrents: 'Torrents',
    search: 'Search',
    rss: 'RSS',
    more: 'More',
    creator: 'Torrent Creator',
    logs: 'Logs',
    statistics: 'Statistics',
    settings: 'Settings',
    diagnostics: 'Diagnostics'
  },
  routes: { signIn: 'Sign in', torrentDetails: 'Torrent details' },
  torrents: {
    add: 'Add torrent',
    filterPlaceholder: 'Filter name or hash',
    all: 'All',
    downloading: 'Downloading',
    seeding: 'Seeding',
    completed: 'Completed',
    stopped: 'Stopped',
    active: 'Active',
    stalled: 'Stalled',
    error: 'Error',
    empty: 'No torrents yet',
    emptyHint: 'Add a torrent file, magnet link, or URL to begin.',
    noResults: 'No torrents match these filters.',
    selected: '{count} selected',
    clearSelection: 'Clear selection',
    start: 'Start',
    stop: 'Stop',
    delete: 'Delete',
    recheck: 'Force recheck',
    reannounce: 'Reannounce',
    moreActions: 'More actions',
    columns: 'Columns',
    density: 'Density',
    sort: 'Sort',
    filters: 'Filters',
    activeFilters: '{count} active filters'
  },
  transfer: {
    download: 'Download',
    upload: 'Upload',
    connection: 'Connection',
    connected: 'Connected',
    disconnected: 'Disconnected',
    alternativeLimits: 'Alternative speed limits',
    localHistory: 'Browser-collected transfer history'
  },
  common: {
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    retry: 'Retry',
    loading: 'Loading…',
    unsupported: 'Not supported by this qBittorrent version',
    copy: 'Copy',
    copied: 'Copied',
    refresh: 'Refresh',
    remove: 'Remove',
    edit: 'Edit',
    add: 'Add',
    search: 'Search',
    clear: 'Clear'
  },
  a11y: { skipToMain: 'Skip to main content' },
  sidebar: {
    expand: 'Expand sidebar',
    collapse: 'Collapse sidebar',
    torrentFilters: 'Torrent filters',
    allTorrents: 'All torrents',
    library: 'Library',
    categories: 'Categories',
    tags: 'Tags',
    trackers: 'Trackers',
    trackerless: 'Trackerless',
    features: 'Features',
    tools: 'Tools',
    manager: 'qBittorrent manager'
  },
  settings: {
    title: 'Settings',
    description: "qBittorrent server preferences and this WebUI's interface settings.",
    interface: 'Interface',
    interfaceTitle: 'Bitwake interface',
    interfaceDescription: 'These preferences affect only this Alternative WebUI.',
    language: 'Language',
    languageHelp: 'Use the browser language or choose a supported interface language.',
    system: 'System',
    english: 'English',
    estonian: 'Eesti',
    theme: 'Theme',
    themeHelp: 'Choose a light, dark, or operating-system theme.',
    light: 'Light',
    dark: 'Dark',
    desktopDensity: 'Desktop density',
    desktopDensityHelp: 'Controls torrent table row height.',
    mobileDensity: 'Mobile density',
    mobileDensityHelp: 'Compact modes preserve minimum touch target sizes.',
    comfortable: 'Comfortable',
    compact: 'Compact',
    extraCompact: 'Extra compact',
    refreshInterval: 'Live refresh interval',
    refreshIntervalHelp: 'One second is recommended on the torrent screen.',
    oneSecond: '1 second',
    twoSeconds: '2 seconds',
    fiveSeconds: '5 seconds',
    transferUnits: 'Transfer units',
    binaryUnits: 'Binary (MiB/s)',
    decimalUnits: 'Decimal (MB/s)'
  },
  mediaPlacement: {
    title: 'Media Placement',
    description: 'Guide TV shows and movies into predictable Jellyfin library folders.',
    managed: 'Managed by deployment',
    retryLoading: 'Retry loading',
    loading: 'Loading Media Placement settings…',
    mode: 'Mode',
    modeHelp: 'Off keeps the generic Add Torrent form. Assist adds media-aware destinations.',
    off: 'Off',
    assist: 'Assist',
    tvRoot: 'TV root',
    tvRootHelp: 'Series folders are created beneath this qBittorrent-side path.',
    moviesRoot: 'Movies root',
    moviesRootHelp: 'One folder per movie is created beneath this path.',
    browseRoot: 'Directory browser root',
    browseRootHelp: 'Initial location for the qBittorrent folder picker.',
    tvCategory: 'TV category',
    tvCategoryHelp: 'Optional existing category suggested for TV torrents.',
    movieCategory: 'Movie category',
    movieCategoryHelp: 'Optional existing category suggested for movie torrents.',
    lockedExplanation:
      'The library settings are managed by this deployment. Manual Path remains available in Add Torrent and Set Location.',
    manualExplanation:
      'Manual paths remain available in Assist mode. Bitwake warns about unusual placement but allows an acknowledged custom destination. Paths refer to the qBittorrent host or container, not this browser device.',
    saving: 'Saving…',
    save: 'Save Media Placement',
    saved: 'Media Placement settings saved.',
    saveError: 'Media Placement settings could not be saved.',
    maxCharacters: 'Use no more than 4,096 characters.',
    invalidPathCharacters: 'Paths cannot contain control, direction, or line-separator characters.',
    absolutePath: 'Enter an absolute path visible to qBittorrent.',
    invalidCategoryCharacters:
      'Categories cannot contain control, direction, or line-separator characters.',
    overlappingRoots: 'TV and Movies roots must be separate, non-nested directories.',
    testing: 'Testing…',
    reachable: 'Reachable',
    empty: 'Empty or not readable',
    notFound: 'Not found or inaccessible',
    denied: 'Request denied',
    unavailable: 'Directory API unavailable',
    testAccess: 'Test access',
    resultCaveat:
      'An empty qBittorrent result cannot distinguish an empty directory from one it cannot read, and never proves the directory is writable.'
  },
  pwa: {
    updateAvailable: 'Bitwake update available',
    updateHint: 'Reload to use the new version.',
    updateBlocked: 'Finish or close the unsaved dialog before reloading.',
    updating: 'Updating…',
    reload: 'Reload and update',
    dismiss: 'Dismiss update'
  },
  advancedFilters: {
    title: 'Advanced filters',
    description:
      'Combine torrent fields or reuse a saved filter. Filtering never changes torrent data.',
    conditions: 'Filter conditions',
    nameOrHash: 'Name or hash',
    textPlaceholder: 'Text or regular expression',
    textMatching: 'Text matching',
    regex: 'Regular expression',
    exclude: 'Exclude matches',
    state: 'State',
    category: 'Category',
    tag: 'Tag',
    tracker: 'Tracker',
    path: 'Save path starts with',
    anyCategory: 'Any category',
    uncategorized: 'Uncategorized',
    anyTag: 'Any tag',
    anyTracker: 'Any tracker',
    trackerless: 'Trackerless',
    invalidRegex: 'This regular expression is invalid or unsafe.',
    matches: '{matched} of {total} torrents match.',
    saved: 'Saved filters',
    saveConditions: 'Save these conditions',
    filterName: 'Filter name',
    chooseCondition: 'Choose at least one condition before saving.',
    loading: 'Loading saved filters…',
    empty: 'No saved filters yet.',
    retryLoading: 'Retry loading',
    apply: 'Apply',
    rename: 'Rename',
    renameItem: 'Rename {name}',
    deleteItem: 'Delete {name}',
    saveRenamed: 'Save renamed filter {name}',
    cancelRenaming: 'Cancel renaming {name}',
    reset: 'Reset fields',
    applyFilters: 'Apply filters'
  },
  filterStates: {
    all: 'Any state',
    downloading: 'Downloading',
    seeding: 'Seeding',
    completed: 'Completed',
    running: 'Running',
    stopped: 'Stopped',
    active: 'Active transfers',
    inactive: 'Inactive',
    stalled: 'Any stalled',
    stalledDL: 'Stalled downloading',
    stalledUP: 'Stalled seeding',
    queued: 'Queued',
    checking: 'Checking',
    moving: 'Moving files',
    metaDL: 'Retrieving metadata',
    missingFiles: 'Missing files',
    error: 'Error'
  },
  diagnostics: {
    title: 'Diagnostics and System Health',
    description:
      'Connection, browser, build, and bounded operation information for troubleshooting.',
    refresh: 'Refresh diagnostics',
    copy: 'Copy sanitized diagnostics',
    download: 'Download JSON',
    liveSync: 'Live synchronization',
    versions: 'Versions and runtime',
    browser: 'Browser and PWA',
    operations: 'Operations history',
    sessionOnly: 'Session-only; newest first; limited to 100 entries.',
    clearHistory: 'Clear history',
    emptyHistory: 'No qBittorrent-changing operation has been observed in this session.',
    httpCompleted: 'HTTP completed',
    failed: 'failed',
    cancelled: 'cancelled'
  }
}

const et = {
  app: { name: appIdentity.name, tagline: 'Selge qBittorrenti töölaud' },
  auth: {
    title: 'Logi qBittorrenti sisse',
    subtitle: 'Kasuta qBittorrenti veebiliideses seadistatud kasutajaandmeid.',
    username: 'Kasutajanimi',
    password: 'Parool',
    showPassword: 'Näita parooli',
    hidePassword: 'Peida parool',
    submit: 'Logi sisse',
    signingIn: 'Sisselogimine…',
    invalid: 'Kasutajanimi või parool on vale.',
    forbidden: 'Liiga palju katseid või juurdepääs on blokeeritud. Oota enne uut katset.',
    connection: 'qBittorrentiga ei saanud ühendust.',
    logout: 'Logi välja',
    privacy: 'Kasutajaandmed saadetakse otse sellele qBittorrenti serverile ja neid ei salvestata.'
  },
  nav: {
    torrents: 'Torrentid',
    search: 'Otsing',
    rss: 'RSS',
    more: 'Veel',
    creator: 'Torrenti looja',
    logs: 'Logid',
    statistics: 'Statistika',
    settings: 'Seaded',
    diagnostics: 'Diagnostika'
  },
  routes: { signIn: 'Sisselogimine', torrentDetails: 'Torrenti üksikasjad' },
  torrents: {
    add: 'Lisa torrent',
    filterPlaceholder: 'Filtreeri nime või räsi järgi',
    all: 'Kõik',
    downloading: 'Allalaadimisel',
    seeding: 'Jagamisel',
    completed: 'Valmis',
    stopped: 'Peatatud',
    active: 'Aktiivsed',
    stalled: 'Seiskunud',
    error: 'Viga',
    empty: 'Torrentid puuduvad',
    emptyHint: 'Alustamiseks lisa torrentifail, magnetlink või URL.',
    noResults: 'Ükski torrent ei vasta filtritele.',
    selected: '{count} valitud',
    clearSelection: 'Tühista valik',
    start: 'Käivita',
    stop: 'Peata',
    delete: 'Kustuta',
    recheck: 'Kontrolli uuesti',
    reannounce: 'Teata uuesti',
    moreActions: 'Veel toiminguid',
    columns: 'Veerud',
    density: 'Tihedus',
    sort: 'Sortimine',
    filters: 'Filtrid',
    activeFilters: '{count} aktiivset filtrit'
  },
  transfer: {
    download: 'Allalaadimine',
    upload: 'Üleslaadimine',
    connection: 'Ühendus',
    connected: 'Ühendatud',
    disconnected: 'Ühenduseta',
    alternativeLimits: 'Alternatiivsed kiirusepiirangud',
    localHistory: 'Brauseris kogutud edastusajalugu'
  },
  common: {
    close: 'Sulge',
    cancel: 'Loobu',
    save: 'Salvesta',
    delete: 'Kustuta',
    retry: 'Proovi uuesti',
    loading: 'Laadimine…',
    unsupported: 'See qBittorrenti versioon ei toeta funktsiooni',
    copy: 'Kopeeri',
    copied: 'Kopeeritud',
    refresh: 'Värskenda',
    remove: 'Eemalda',
    edit: 'Muuda',
    add: 'Lisa',
    search: 'Otsi',
    clear: 'Tühjenda'
  },
  a11y: { skipToMain: 'Liigu põhisisu juurde' },
  sidebar: {
    expand: 'Laienda külgriba',
    collapse: 'Ahenda külgriba',
    torrentFilters: 'Torrenti filtrid',
    allTorrents: 'Kõik torrentid',
    library: 'Kogu',
    categories: 'Kategooriad',
    tags: 'Sildid',
    trackers: 'Jälgijad',
    trackerless: 'Jälgijata',
    features: 'Funktsioonid',
    tools: 'Tööriistad',
    manager: 'qBittorrenti haldur'
  },
  settings: {
    title: 'Seaded',
    description: 'qBittorrenti serveri ja selle veebiliidese seaded.',
    interface: 'Kasutajaliides',
    interfaceTitle: 'Bitwake’i kasutajaliides',
    interfaceDescription: 'Need eelistused mõjutavad ainult seda alternatiivset veebiliidest.',
    language: 'Keel',
    languageHelp: 'Kasuta brauseri keelt või vali toetatud kasutajaliidese keel.',
    system: 'Süsteem',
    english: 'English',
    estonian: 'Eesti',
    theme: 'Kujundus',
    themeHelp: 'Vali hele, tume või operatsioonisüsteemi kujundus.',
    light: 'Hele',
    dark: 'Tume',
    desktopDensity: 'Töölaua tihedus',
    desktopDensityHelp: 'Määrab torrentitabeli rea kõrguse.',
    mobileDensity: 'Mobiilivaate tihedus',
    mobileDensityHelp: 'Kompaktvaade säilitab puutealade miinimumsuuruse.',
    comfortable: 'Mugav',
    compact: 'Kompaktne',
    extraCompact: 'Väga kompaktne',
    refreshInterval: 'Reaalajas värskendamise intervall',
    refreshIntervalHelp: 'Torrentivaates on soovitatav üks sekund.',
    oneSecond: '1 sekund',
    twoSeconds: '2 sekundit',
    fiveSeconds: '5 sekundit',
    transferUnits: 'Edastusühikud',
    binaryUnits: 'Kahendühikud (MiB/s)',
    decimalUnits: 'Kümnendühikud (MB/s)'
  },
  mediaPlacement: {
    title: 'Meedia paigutus',
    description: 'Suuna sarjad ja filmid etteaimatavatesse Jellyfini teegikaustadesse.',
    managed: 'Juurutus haldab',
    retryLoading: 'Proovi uuesti laadida',
    loading: 'Meedia paigutuse seadete laadimine…',
    mode: 'Režiim',
    modeHelp:
      'Väljas säilitab üldise torrenti lisamise vormi. Abirežiim lisab meediateadlikud sihtkohad.',
    off: 'Väljas',
    assist: 'Abirežiim',
    tvRoot: 'Sarjade juurkaust',
    tvRootHelp: 'Sarjakaustad luuakse selle qBittorrenti tee alla.',
    moviesRoot: 'Filmide juurkaust',
    moviesRootHelp: 'Iga filmi jaoks luuakse selle tee alla eraldi kaust.',
    browseRoot: 'Kaustavalija juurkaust',
    browseRootHelp: 'qBittorrenti kaustavalija algne asukoht.',
    tvCategory: 'Sarjade kategooria',
    tvCategoryHelp: 'Olemasolev valikuline kategooria sarjatorrentidele.',
    movieCategory: 'Filmide kategooria',
    movieCategoryHelp: 'Olemasolev valikuline kategooria filmitorrentidele.',
    lockedExplanation:
      'Teegi seadeid haldab see juurutus. Käsitsi tee jääb torrenti lisamisel ja asukoha määramisel kasutatavaks.',
    manualExplanation:
      'Käsitsi teed jäävad abirežiimis kasutatavaks. Bitwake hoiatab ebatavalise paigutuse eest, kuid lubab kinnitatud kohandatud sihtkoha. Teed viitavad qBittorrenti hostile või konteinerile, mitte sellele brauseriseadmele.',
    saving: 'Salvestamine…',
    save: 'Salvesta meedia paigutus',
    saved: 'Meedia paigutuse seaded salvestati.',
    saveError: 'Meedia paigutuse seadeid ei saanud salvestada.',
    maxCharacters: 'Kasuta kuni 4096 märki.',
    invalidPathCharacters: 'Tee ei tohi sisaldada juht-, suuna- ega reaeraldusmärke.',
    absolutePath: 'Sisesta qBittorrentile nähtav absoluutne tee.',
    invalidCategoryCharacters: 'Kategooria ei tohi sisaldada juht-, suuna- ega reaeraldusmärke.',
    overlappingRoots:
      'Sarjade ja filmide juurkaustad peavad olema eraldi ega tohi üksteises asuda.',
    testing: 'Kontrollimine…',
    reachable: 'Kättesaadav',
    empty: 'Tühi või loetamatu',
    notFound: 'Ei leitud või pole ligipääsetav',
    denied: 'Päring keelati',
    unavailable: 'Kausta API pole saadaval',
    testAccess: 'Kontrolli ligipääsu',
    resultCaveat:
      'Tühi qBittorrenti vastus ei erista tühja kausta loetamatust kaustast ega tõesta kunagi kirjutusõigust.'
  },
  pwa: {
    updateAvailable: 'Bitwake’i uuendus on saadaval',
    updateHint: 'Uue versiooni kasutamiseks laadi leht uuesti.',
    updateBlocked: 'Enne uuesti laadimist lõpeta või sulge salvestamata dialoog.',
    updating: 'Uuendamine…',
    reload: 'Laadi uuesti ja uuenda',
    dismiss: 'Peida uuendus'
  },
  advancedFilters: {
    title: 'Täpsemad filtrid',
    description:
      'Kombineeri torrentivälju või kasuta salvestatud filtrit. Filtreerimine ei muuda torrentiandmeid.',
    conditions: 'Filtritingimused',
    nameOrHash: 'Nimi või räsi',
    textPlaceholder: 'Tekst või regulaaravaldis',
    textMatching: 'Teksti sobitamine',
    regex: 'Regulaaravaldis',
    exclude: 'Välista vasted',
    state: 'Olek',
    category: 'Kategooria',
    tag: 'Silt',
    tracker: 'Jälgija',
    path: 'Salvestustee algab',
    anyCategory: 'Kõik kategooriad',
    uncategorized: 'Kategooriata',
    anyTag: 'Kõik sildid',
    anyTracker: 'Kõik jälgijad',
    trackerless: 'Jälgijata',
    invalidRegex: 'Regulaaravaldis on vigane või ebaturvaline.',
    matches: '{matched} torrentit {total}-st vastab filtrile.',
    saved: 'Salvestatud filtrid',
    saveConditions: 'Salvesta need tingimused',
    filterName: 'Filtri nimi',
    chooseCondition: 'Vali enne salvestamist vähemalt üks tingimus.',
    loading: 'Salvestatud filtrite laadimine…',
    empty: 'Salvestatud filtreid pole.',
    retryLoading: 'Proovi uuesti laadida',
    apply: 'Rakenda',
    rename: 'Nimeta ümber',
    renameItem: 'Nimeta {name} ümber',
    deleteItem: 'Kustuta {name}',
    saveRenamed: 'Salvesta filtri {name} uus nimi',
    cancelRenaming: 'Loobu filtri {name} ümbernimetamisest',
    reset: 'Lähtesta väljad',
    applyFilters: 'Rakenda filtrid'
  },
  filterStates: {
    all: 'Kõik olekud',
    downloading: 'Allalaadimisel',
    seeding: 'Jagamisel',
    completed: 'Valmis',
    running: 'Töötab',
    stopped: 'Peatatud',
    active: 'Aktiivsed edastused',
    inactive: 'Mitteaktiivne',
    stalled: 'Kõik seiskunud',
    stalledDL: 'Allalaadimine seiskunud',
    stalledUP: 'Jagamine seiskunud',
    queued: 'Järjekorras',
    checking: 'Kontrollimisel',
    moving: 'Failide teisaldamine',
    metaDL: 'Metaandmete hankimine',
    missingFiles: 'Failid puuduvad',
    error: 'Viga'
  },
  diagnostics: {
    title: 'Diagnostika ja süsteemi seisund',
    description: 'Ühenduse, brauseri, järgu ja piiritletud toimingute teave tõrkeotsinguks.',
    refresh: 'Värskenda diagnostikat',
    copy: 'Kopeeri puhastatud diagnostika',
    download: 'Laadi JSON alla',
    liveSync: 'Reaalajas sünkroonimine',
    versions: 'Versioonid ja käituskeskkond',
    browser: 'Brauser ja PWA',
    operations: 'Toimingute ajalugu',
    sessionOnly: 'Ainult selles seansis; uusim ees; kuni 100 kirjet.',
    clearHistory: 'Tühjenda ajalugu',
    emptyHistory: 'Selles seansis pole täheldatud ühtegi qBittorrenti muutvat toimingut.',
    httpCompleted: 'HTTP lõpetatud',
    failed: 'nurjus',
    cancelled: 'tühistatud'
  }
}

export type ApplicationLocalePreference = 'system' | 'en' | 'et'

const supportedLocalePreferences = new Set<ApplicationLocalePreference>(['system', 'en', 'et'])

function localeFromSerializedPreference(
  serialized: string | null
): ApplicationLocalePreference | null {
  if (!serialized) return null
  try {
    const value = JSON.parse(serialized) as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const locale = (value as Record<string, unknown>).locale
    return supportedLocalePreferences.has(locale as ApplicationLocalePreference)
      ? (locale as ApplicationLocalePreference)
      : null
  } catch {
    return null
  }
}

/** Read only the non-sensitive locale field needed before either app shell mounts. */
export function readBootstrapLocalePreference(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage
): ApplicationLocalePreference {
  if (!storage) return 'system'
  try {
    return (
      localeFromSerializedPreference(storage.getItem(appStorageKeys.uiPreferences.browser)) ??
      localeFromSerializedPreference(storage.getItem(appStorageKeys.uiPreferences.legacyBrowser)) ??
      'system'
    )
  } catch {
    return 'system'
  }
}

export function resolveApplicationLocale(
  preference: ApplicationLocalePreference,
  browserLocale = typeof navigator === 'undefined' ? 'en' : navigator.language
): 'en' | 'et' {
  if (preference !== 'system') return preference
  return browserLocale.toLocaleLowerCase().startsWith('et') ? 'et' : 'en'
}

export function setApplicationLocale(preference: ApplicationLocalePreference): void {
  const locale = resolveApplicationLocale(preference)
  i18n.global.locale.value = locale
  setFormattingLocale(locale)
  if (typeof document !== 'undefined') document.documentElement.lang = locale
}

const initialLocale = resolveApplicationLocale('system')
export const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: { en, et }
})
setFormattingLocale(initialLocale)
