function isUnsafeTextCodeUnit(value: number): boolean {
  return (
    value <= 0x1f ||
    (value >= 0x7f && value <= 0x9f) ||
    value === 0x061c ||
    (value >= 0x200e && value <= 0x200f) ||
    (value >= 0x2028 && value <= 0x202e) ||
    (value >= 0x2066 && value <= 0x2069)
  )
}

export function containsControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isUnsafeTextCodeUnit(value.charCodeAt(index))) return true
  }
  return false
}

export function replaceControlCharacters(value: string, replacement = ' '): string {
  let result = ''
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? ''
    result += isUnsafeTextCodeUnit(value.charCodeAt(index)) ? replacement : character
  }
  return result
}
