export function normalizeWord(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function titleCaseWord(input: string) {
  const trimmed = input.trim()
  if (!trimmed) return ''
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function parseSearchQuery(raw: string) {
  const normalized = normalizeWord(raw)
  if (!normalized) {
    return { ok: false as const, error: 'Enter a word or expression to search.' }
  }
  if (normalized.length > 80) {
    return { ok: false as const, error: 'That search is too long. Try a shorter word or phrase.' }
  }
  return { ok: true as const, value: normalized }
}
