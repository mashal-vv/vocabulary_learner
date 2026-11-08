import { normalizeWord, parseSearchQuery, titleCaseWord } from '@/lib/word'

describe('normalizeWord', () => {
  it('lowercases and trims input', () => {
    expect(normalizeWord('  Hello World  ')).toBe('hello world')
  })

  it('collapses multiple spaces to one', () => {
    expect(normalizeWord('hello   world')).toBe('hello world')
  })

  it('handles already-normalised input', () => {
    expect(normalizeWord('ephemeral')).toBe('ephemeral')
  })
})

describe('titleCaseWord', () => {
  it('capitalises the first letter', () => {
    expect(titleCaseWord('hello')).toBe('Hello')
  })

  it('handles already-capitalised words', () => {
    expect(titleCaseWord('Ephemeral')).toBe('Ephemeral')
  })

  it('handles empty string', () => {
    expect(titleCaseWord('')).toBe('')
  })

  it('preserves rest of string casing', () => {
    expect(titleCaseWord('hELLO')).toBe('HELLO')
  })
})

describe('parseSearchQuery', () => {
  it('returns ok for a valid word', () => {
    const result = parseSearchQuery('ephemeral')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('ephemeral')
  })

  it('returns error for empty string', () => {
    const result = parseSearchQuery('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('Enter a word')
  })

  it('returns error for queries longer than 80 chars', () => {
    const result = parseSearchQuery('a'.repeat(81))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('too long')
  })

  it('normalises the query before returning', () => {
    const result = parseSearchQuery('  HELLO  ')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('hello')
  })
})
