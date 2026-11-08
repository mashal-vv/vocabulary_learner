import { z } from 'zod'
import { normalizeWord, titleCaseWord } from '@/lib/word'
import type { VocabularyWord, WordDefinition, WordExample } from '@/types/vocabulary'

const phoneticSchema = z.object({
  text: z.string().optional(),
  audio: z.string().optional(),
})

const meaningSchema = z.object({
  partOfSpeech: z.string(),
  definitions: z.array(
    z.object({
      definition: z.string(),
      example: z.string().optional(),
      synonyms: z.array(z.string()).optional(),
      antonyms: z.array(z.string()).optional(),
    }),
  ),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
})

const entrySchema = z.object({
  word: z.string(),
  phonetic: z.string().optional(),
  phonetics: z.array(phoneticSchema).optional(),
  meanings: z.array(meaningSchema),
})

export type DictionaryLookup =
  | { ok: true; word: Omit<VocabularyWord, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'learningStatus' | 'personalNotes' | 'isFavourite' | 'isDifficult'> }
  | { ok: false; error: string; retryable: boolean }

function pickBritishPhonetic(entry: z.infer<typeof entrySchema>) {
  const phonetics = entry.phonetics ?? []
  const uk = phonetics.find((item) => /uk|gb|en-gb/i.test(item.audio ?? ''))
  const withAudio = phonetics.find((item) => item.audio)
  const withText = phonetics.find((item) => item.text)
  return {
    pronunciation: uk?.text ?? withText?.text ?? entry.phonetic,
    audioUrl: uk?.audio || withAudio?.audio || undefined,
    phoneticTranscription: uk?.text ?? entry.phonetic ?? withText?.text,
  }
}

function unique(values: Array<string | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))))
}

export async function lookupDictionary(query: string): Promise<DictionaryLookup> {
  const word = normalizeWord(query)
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`
  try {
    const response = await fetch(url)
    if (response.status === 404) {
      return { ok: false, error: `No dictionary entry was found for “${word}”.`, retryable: false }
    }
    if (response.status === 429) {
      return { ok: false, error: 'The dictionary service is rate-limited. Please wait a moment and retry.', retryable: true }
    }
    if (!response.ok) {
      return { ok: false, error: 'The dictionary service is unavailable right now.', retryable: true }
    }
    const json: unknown = await response.json()
    const parsed = z.array(entrySchema).safeParse(json)
    if (!parsed.success || parsed.data.length === 0) {
      return { ok: false, error: 'The dictionary returned an unexpected response.', retryable: true }
    }
    const entry = parsed.data[0]
    if (!entry) {
      return { ok: false, error: `No dictionary entry was found for “${word}”.`, retryable: false }
    }
    const definitions: WordDefinition[] = entry.meanings.flatMap((meaning) =>
      meaning.definitions.slice(0, 3).map((item) => ({
        partOfSpeech: meaning.partOfSpeech,
        definition: item.definition,
        example: item.example,
      })),
    )
    const examples: WordExample[] = definitions
      .filter((item) => item.example)
      .slice(0, 3)
      .map((item) => ({
        sentence: item.example!,
        context: `Used as a ${item.partOfSpeech}.`,
      }))
    const synonyms = unique([
      ...entry.meanings.flatMap((meaning) => meaning.synonyms ?? []),
      ...entry.meanings.flatMap((meaning) => meaning.definitions.flatMap((item) => item.synonyms ?? [])),
    ]).slice(0, 8)
    const antonyms = unique([
      ...entry.meanings.flatMap((meaning) => meaning.antonyms ?? []),
      ...entry.meanings.flatMap((meaning) => meaning.definitions.flatMap((item) => item.antonyms ?? [])),
    ]).slice(0, 8)
    const phonetic = pickBritishPhonetic(entry)
    return {
      ok: true,
      word: {
        word: titleCaseWord(entry.word),
        normalizedWord: normalizeWord(entry.word),
        pronunciation: phonetic.pronunciation,
        phoneticTranscription: phonetic.phoneticTranscription,
        audioUrl: phonetic.audioUrl,
        partOfSpeech: entry.meanings[0]?.partOfSpeech,
        definitions,
        simpleDefinition: definitions[0]?.definition,
        synonyms,
        antonyms,
        collocations: [],
        expressions: [],
        examples,
        realLifeUsage: examples[0]?.sentence,
      },
    }
  } catch {
    return { ok: false, error: 'Could not reach the dictionary. Check your connection and retry.', retryable: true }
  }
}

export function shouldSuggestImage(partOfSpeech?: string, definitions: WordDefinition[] = []) {
  const pos = (partOfSpeech ?? '').toLowerCase()
  if (['conjunction', 'preposition', 'pronoun', 'article', 'determiner', 'auxiliary'].includes(pos)) {
    return false
  }
  const text = definitions.map((item) => item.definition).join(' ').toLowerCase()
  const abstractHints = ['abstract', 'concept', 'state of', 'quality of', 'act of']
  if (abstractHints.some((hint) => text.includes(hint)) && pos === 'noun') return false
  return pos === 'noun' || pos === 'verb'
}
