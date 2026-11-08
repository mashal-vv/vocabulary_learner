import { z } from 'zod'
import { functionsUrl, isSupabaseConfigured } from '@/services/supabase/client'

const enrichmentSchema = z.object({
  simpleDefinition: z.string().optional(),
  malayalamTranslation: z.string().optional(),
  collocations: z.array(z.string()).optional(),
  expressions: z.array(z.string()).optional(),
  usageNotes: z.string().optional(),
  commonMistakes: z.string().optional(),
  examples: z
    .array(
      z.object({
        sentence: z.string(),
        context: z.string().optional(),
      }),
    )
    .optional(),
  realLifeUsage: z.string().optional(),
  imageUseful: z.boolean().optional(),
  imageQuery: z.string().optional(),
})

export type WordEnrichment = z.infer<typeof enrichmentSchema>

export async function fetchMalayalamTranslation(word: string) {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ml`
    const response = await fetch(url)
    if (!response.ok) return undefined
    const json = (await response.json()) as { responseData?: { translatedText?: string } }
    const text = json.responseData?.translatedText?.trim()
    if (!text || text.toLowerCase() === word.toLowerCase()) return undefined
    return text
  } catch {
    return undefined
  }
}

export async function enrichWord(input: {
  word: string
  definition?: string
  partOfSpeech?: string
}): Promise<WordEnrichment> {
  if (isSupabaseConfigured()) {
    const endpoint = functionsUrl('enrich-word')
    if (endpoint) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify(input),
        })
        if (response.ok) {
          const json: unknown = await response.json()
          const parsed = enrichmentSchema.safeParse(json)
          if (parsed.success) return parsed.data
        }
      } catch {
        // Fall through to free translation.
      }
    }
  }
  const malayalamTranslation = await fetchMalayalamTranslation(input.word)
  return { malayalamTranslation }
}
