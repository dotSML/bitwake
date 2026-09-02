import { describe, expect, it } from 'vitest'
import {
  i18n,
  readBootstrapLocalePreference,
  resolveApplicationLocale,
  setApplicationLocale
} from '@/i18n'
import { formatBytes, formatTimestamp } from '@/utils/format'
import { appStorageKeys } from '@/config/appIdentity'

function messageKeys(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [prefix]
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    messageKeys(child, prefix ? `${prefix}.${key}` : key)
  )
}

describe('internationalization catalog', () => {
  it('keeps every supported locale structurally complete', () => {
    const english = messageKeys(i18n.global.getLocaleMessage('en')).sort()
    const estonian = messageKeys(i18n.global.getLocaleMessage('et')).sort()
    expect(estonian).toEqual(english)
    expect(english.length).toBeGreaterThan(50)
  })

  it('resolves the system locale conservatively and updates the active locale', () => {
    expect(resolveApplicationLocale('system', 'et-EE')).toBe('et')
    expect(resolveApplicationLocale('system', 'fi-FI')).toBe('en')
    expect(resolveApplicationLocale('en', 'et-EE')).toBe('en')

    setApplicationLocale('et')
    expect(i18n.global.locale.value).toBe('et')
    expect(i18n.global.t('sidebar.allTorrents')).toBe('Kõik torrentid')
    setApplicationLocale('en')
    expect(i18n.global.t('sidebar.allTorrents')).toBe('All torrents')
  })

  it('restores only a valid persisted locale before public or private bootstrap', () => {
    const storage = {
      getItem: (key: string) =>
        key === appStorageKeys.uiPreferences.browser
          ? JSON.stringify({ locale: 'et', privateValue: 'ignored' })
          : null
    }
    expect(readBootstrapLocalePreference(storage)).toBe('et')
    expect(readBootstrapLocalePreference({ getItem: () => '{broken' })).toBe('system')
    expect(
      readBootstrapLocalePreference({ getItem: () => JSON.stringify({ locale: 'future' }) })
    ).toBe('system')
  })

  it('keeps native number and date formatting aligned with the selected language', () => {
    const timestamp = 1_700_000_000
    setApplicationLocale('et')
    expect(formatBytes(1_536)).toBe(
      `${new Intl.NumberFormat('et', { maximumFractionDigits: 2 }).format(1.5)} KiB`
    )
    expect(formatTimestamp(timestamp)).toBe(
      new Intl.DateTimeFormat('et', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(timestamp * 1_000)
      )
    )

    setApplicationLocale('en')
    expect(formatBytes(1_536)).toBe(
      `${new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(1.5)} KiB`
    )
  })
})
