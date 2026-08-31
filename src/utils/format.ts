const binaryUnits = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] as const
const decimalUnits = ['B', 'kB', 'MB', 'GB', 'TB', 'PB'] as const

export function formatBytes(
  value: number | null | undefined,
  options: { unit?: 'binary' | 'decimal'; maximumFractionDigits?: number } = {}
): string {
  if (value === null || value === undefined || Number.isNaN(value) || value < 0)
    return 'Not available'
  if (!Number.isFinite(value)) return '∞'
  const binary = options.unit !== 'decimal'
  const base = binary ? 1024 : 1000
  const units = binary ? binaryUnits : decimalUnits
  let scaled = value
  let index = 0
  while (scaled >= base && index < units.length - 1) {
    scaled /= base
    index += 1
  }
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: options.maximumFractionDigits ?? (index === 0 ? 0 : 2)
  }).format(scaled)} ${units[index]}`
}

export function formatSpeed(
  value: number | null | undefined,
  unit: 'binary' | 'decimal' = 'binary'
): string {
  if (!value) return '0 B/s'
  const formatted = formatBytes(value, { unit })
  return formatted === 'Not available' ? formatted : `${formatted}/s`
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'Unknown'
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: value > 0 && value < 1 ? 1 : 0,
    maximumFractionDigits: 1
  }).format(value)
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0 || !Number.isFinite(seconds))
    return 'Unknown'
  if (seconds >= 8_640_000) return '∞'
  if (seconds === 0) return '0s'
  const parts: string[] = []
  const days = Math.floor(seconds / 86_400)
  const hours = Math.floor((seconds % 86_400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remaining = Math.floor(seconds % 60)
  if (days) parts.push(`${days}d`)
  if (hours && parts.length < 2) parts.push(`${hours}h`)
  if (minutes && parts.length < 2) parts.push(`${minutes}m`)
  if (remaining && parts.length < 2) parts.push(`${remaining}s`)
  return parts.join(' ')
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0 || seconds >= 8_640_000) return '∞'
  return formatDuration(seconds)
}

export function formatRatio(value: number | null | undefined): string {
  if (value === null || value === undefined || value < 0 || Number.isNaN(value))
    return 'Not available'
  if (!Number.isFinite(value) || value >= 9999) return '∞'
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

export function formatTimestamp(value: number | null | undefined): string {
  if (!value || value < 0) return 'Never'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value * 1000)
  )
}

export function formatLimit(
  value: number | null | undefined,
  unit: 'binary' | 'decimal' = 'binary'
): string {
  if (value === null || value === undefined || value <= 0) return 'Unlimited'
  return formatSpeed(value, unit)
}
