export interface TransferSample {
  timestamp: number
  download: number
  upload: number
  gap?: boolean
}

export class TransferGraphBuffer {
  readonly capacity: number
  #samples: Array<TransferSample | undefined>
  #start = 0
  #length = 0

  constructor(capacity = 3600) {
    if (!Number.isInteger(capacity) || capacity < 2)
      throw new RangeError('capacity must be at least 2')
    this.capacity = capacity
    this.#samples = new Array<TransferSample | undefined>(capacity)
  }

  get length(): number {
    return this.#length
  }

  push(sample: TransferSample): void {
    if (this.#length < this.capacity) {
      this.#samples[(this.#start + this.#length) % this.capacity] = sample
      this.#length += 1
      return
    }
    this.#samples[this.#start] = sample
    this.#start = (this.#start + 1) % this.capacity
  }

  clear(): void {
    this.#samples.fill(undefined)
    this.#start = 0
    this.#length = 0
  }

  toArray(since = Number.NEGATIVE_INFINITY): TransferSample[] {
    const result: TransferSample[] = []
    for (let index = 0; index < this.#length; index += 1) {
      const sample = this.#samples[(this.#start + index) % this.capacity]
      if (sample && sample.timestamp >= since) result.push(sample)
    }
    return result
  }
}

export function downsampleGraph(
  samples: readonly TransferSample[],
  targetPoints: number
): TransferSample[] {
  if (targetPoints < 2 || samples.length <= targetPoints) return [...samples]
  const bucketSize = samples.length / targetPoints
  const result: TransferSample[] = []
  for (let bucket = 0; bucket < targetPoints; bucket += 1) {
    const from = Math.floor(bucket * bucketSize)
    const to = Math.min(samples.length, Math.floor((bucket + 1) * bucketSize))
    const slice = samples.slice(from, Math.max(from + 1, to))
    if (slice.some((sample) => sample.gap)) {
      const last = slice.at(-1)
      if (last) result.push({ ...last, gap: true })
      continue
    }
    const last = slice.at(-1)
    if (!last) continue
    result.push({
      timestamp: last.timestamp,
      download: Math.max(...slice.map((sample) => sample.download)),
      upload: Math.max(...slice.map((sample) => sample.upload))
    })
  }
  return result
}
