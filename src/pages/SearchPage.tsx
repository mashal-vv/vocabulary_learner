import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useLibrary } from '@/hooks/useLibrary'
import { shouldSuggestImage, lookupDictionary } from '@/services/dictionary/freeDictionary'
import { enrichWord } from '@/services/enrichment/enrich'
import { findContextualImage } from '@/services/images/images'
import { saveSearchedWord } from '@/services/vocabulary/repository'
import { parseSearchQuery } from '@/lib/word'

export function SearchPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { userId, invalidate } = useLibrary()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [error, setError] = useState<string | null>(null)
  const [retryable, setRetryable] = useState(false)
  const [loading, setLoading] = useState(false)

  async function runSearch(raw: string) {
    const parsed = parseSearchQuery(raw)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    if (!userId) return
    setLoading(true)
    setError(null)
    try {
      const result = await lookupDictionary(parsed.value)
      if (!result.ok) {
        setError(result.error)
        setRetryable(result.retryable)
        return
      }
      const enrichment = await enrichWord({
        word: result.word.word,
        definition: result.word.simpleDefinition,
        partOfSpeech: result.word.partOfSpeech,
      })
      const imageUseful = enrichment.imageUseful ?? shouldSuggestImage(result.word.partOfSpeech, result.word.definitions)
      const image = await findContextualImage(enrichment.imageQuery ?? result.word.word, imageUseful)
      const saved = await saveSearchedWord(userId, {
        ...result.word,
        simpleDefinition: enrichment.simpleDefinition ?? result.word.simpleDefinition,
        malayalamTranslation: enrichment.malayalamTranslation,
        collocations: enrichment.collocations ?? [],
        expressions: enrichment.expressions ?? [],
        usageNotes: enrichment.usageNotes,
        commonMistakes: enrichment.commonMistakes,
        examples: enrichment.examples?.length ? enrichment.examples : result.word.examples,
        realLifeUsage: enrichment.realLifeUsage ?? result.word.realLifeUsage,
        imageUrl: image.url,
        imageCaption: image.caption,
      })
      await invalidate()
      toast.success(saved.created ? `Saved “${saved.word.word}”.` : `Updated “${saved.word.word}”.`)
      navigate(`/word/${saved.word.normalizedWord}`, { state: { justSearched: saved.created } })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.')
      setRetryable(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const initial = params.get('q')
    if (initial) void runSearch(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, userId])

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Search</h1>
        <p className="mt-1 text-muted-foreground">Look up a word or expression. Successful searches are saved automatically.</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void runSearch(query)
        }}
      >
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Try probing, dibs, or frisked"
          aria-label="Word search"
        />
        <Button type="submit" disabled={loading}>
          {loading ? 'Searching…' : 'Search'}
        </Button>
      </form>
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}
      {error && (
        <Card>
          <CardHeader>
            <CardTitle>Could not load that word</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          {retryable && (
            <CardContent>
              <Button onClick={() => void runSearch(query)}>Retry</Button>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}
