import { Buffer } from 'node:buffer'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const utf8Flag = 0x0800
const minimumZipEpoch = 315_532_800

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

function dosTimestamp(epochSeconds) {
  const date = new Date(Math.max(minimumZipEpoch, epochSeconds) * 1000)
  const year = Math.min(2107, Math.max(1980, date.getUTCFullYear()))
  return {
    date: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
    time: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1)
  }
}

function checkedSize(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${label} exceeds the deterministic ZIP32 limit`)
  }
  return value
}

/** Write a stable, uncompressed ZIP with sorted paths and no host metadata. */
export async function writeDeterministicZip({ archive, root, paths, epochSeconds }) {
  const sortedPaths = [...paths]
    .map((path) => path.replaceAll('\\', '/'))
    .sort((left, right) => left.localeCompare(right, 'en'))
  if (new Set(sortedPaths).size !== sortedPaths.length) {
    throw new Error('Deterministic ZIP input contains duplicate paths')
  }
  if (sortedPaths.length > 0xffff) throw new Error('Deterministic ZIP has too many entries')

  const timestamp = dosTimestamp(epochSeconds)
  const localParts = []
  const centralParts = []
  let offset = 0

  for (const path of sortedPaths) {
    if (!path || path.startsWith('/') || path.split('/').includes('..')) {
      throw new Error(`Unsafe deterministic ZIP path: ${path}`)
    }
    const name = Buffer.from(path, 'utf8')
    if (name.length > 0xffff) throw new Error(`ZIP path is too long: ${path}`)
    const data = await readFile(join(root, ...path.split('/')))
    const size = checkedSize(data.length, path)
    const checksum = crc32(data)

    const localHeader = Buffer.alloc(30)
    localHeader.writeUInt32LE(0x04034b50, 0)
    localHeader.writeUInt16LE(20, 4)
    localHeader.writeUInt16LE(utf8Flag, 6)
    localHeader.writeUInt16LE(0, 8)
    localHeader.writeUInt16LE(timestamp.time, 10)
    localHeader.writeUInt16LE(timestamp.date, 12)
    localHeader.writeUInt32LE(checksum, 14)
    localHeader.writeUInt32LE(size, 18)
    localHeader.writeUInt32LE(size, 22)
    localHeader.writeUInt16LE(name.length, 26)
    localHeader.writeUInt16LE(0, 28)
    localParts.push(localHeader, name, data)

    const centralHeader = Buffer.alloc(46)
    centralHeader.writeUInt32LE(0x02014b50, 0)
    centralHeader.writeUInt16LE(0x0314, 4)
    centralHeader.writeUInt16LE(20, 6)
    centralHeader.writeUInt16LE(utf8Flag, 8)
    centralHeader.writeUInt16LE(0, 10)
    centralHeader.writeUInt16LE(timestamp.time, 12)
    centralHeader.writeUInt16LE(timestamp.date, 14)
    centralHeader.writeUInt32LE(checksum, 16)
    centralHeader.writeUInt32LE(size, 20)
    centralHeader.writeUInt32LE(size, 24)
    centralHeader.writeUInt16LE(name.length, 28)
    centralHeader.writeUInt16LE(0, 30)
    centralHeader.writeUInt16LE(0, 32)
    centralHeader.writeUInt16LE(0, 34)
    centralHeader.writeUInt16LE(0, 36)
    centralHeader.writeUInt32LE((0o100644 << 16) >>> 0, 38)
    centralHeader.writeUInt32LE(checkedSize(offset, 'ZIP offset'), 42)
    centralParts.push(centralHeader, name)

    offset += localHeader.length + name.length + data.length
  }

  const centralSize = centralParts.reduce((size, part) => size + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(sortedPaths.length, 8)
  end.writeUInt16LE(sortedPaths.length, 10)
  end.writeUInt32LE(checkedSize(centralSize, 'ZIP central directory'), 12)
  end.writeUInt32LE(checkedSize(offset, 'ZIP central offset'), 16)
  end.writeUInt16LE(0, 20)

  await writeFile(archive, Buffer.concat([...localParts, ...centralParts, end]))
}
