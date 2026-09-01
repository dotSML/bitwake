function containsUnsafeText(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (
      code <= 0x1f ||
      (code >= 0x7f && code <= 0x9f) ||
      code === 0x061c ||
      (code >= 0x200e && code <= 0x200f) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
    )
      return true
  }
  return false
}

export interface RenamePathValidation {
  newPath: string | null
  error: string | null
}

export function renamedTorrentPath(oldPath: string, requestedName: string): RenamePathValidation {
  if (!requestedName) return { newPath: null, error: 'Enter a new name.' }
  if (requestedName !== requestedName.trim()) {
    return { newPath: null, error: 'Names cannot start or end with whitespace.' }
  }
  if (requestedName.length > 255) {
    return { newPath: null, error: 'Names cannot exceed 255 characters.' }
  }
  if (requestedName === '.' || requestedName === '..') {
    return { newPath: null, error: '“.” and “..” are not valid names.' }
  }
  if (requestedName.includes('/') || requestedName.includes('\\')) {
    return { newPath: null, error: 'Enter a name only, without path separators.' }
  }
  if (containsUnsafeText(requestedName)) {
    return {
      newPath: null,
      error: 'Names cannot contain control, direction, or line-separator characters.'
    }
  }

  const separator = oldPath.lastIndexOf('/')
  const parent = separator >= 0 ? oldPath.slice(0, separator) : ''
  return { newPath: parent ? `${parent}/${requestedName}` : requestedName, error: null }
}
