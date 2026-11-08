import { Bookmark, Star, Volume2 } from 'lucide-react'
import { playPronunciation } from '@/services/audio'
import type { VocabularyWord } from '@/types/vocabulary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function WordDetails({
  word,
  onFavourite,
}: {
  word: VocabularyWord
  onFavourite: () => void
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-wide text-muted-foreground">{word.partOfSpeech}</p>
          <h1 className="font-serif text-4xl">{word.word}</h1>
          <p className="mt-1 text-muted-foreground">
            {word.phoneticTranscription ?? word.pronunciation ?? 'British pronunciation'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => playPronunciation({ audioUrl: word.audioUrl, word: word.word })}
          >
            <Volume2 className="h-4 w-4" />
            Listen
          </Button>
          <Button variant={word.isFavourite ? 'default' : 'outline'} onClick={onFavourite}>
            {word.isFavourite ? <Star className="h-4 w-4 fill-current" /> : <Bookmark className="h-4 w-4" />}
            Favourite
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Meaning</CardTitle>
          <CardDescription>Plain English, written for a learner</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p>{word.simpleDefinition ?? word.definitions[0]?.definition}</p>
          {word.malayalamTranslation && (
            <p className="text-sm text-muted-foreground">Malayalam: {word.malayalamTranslation}</p>
          )}
          {word.definitions.length > 1 && (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {word.definitions.slice(1, 4).map((item) => (
                <li key={item.definition}>
                  <span className="text-muted-foreground">{item.partOfSpeech}:</span> {item.definition}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {word.imageUrl && (
        <Card className="overflow-hidden">
          <img src={word.imageUrl} alt={word.imageCaption ?? `Illustration for ${word.word}`} className="max-h-72 w-full object-cover" />
          {word.imageCaption && <CardContent className="pt-4 text-sm text-muted-foreground">{word.imageCaption}</CardContent>}
        </Card>
      )}

      <ChipSection title="Synonyms" items={word.synonyms} />
      <ChipSection title="Antonyms" items={word.antonyms} />
      <ChipSection title="Collocations" items={word.collocations} />
      <ChipSection title="Idioms and expressions" items={word.expressions} />

      {word.examples.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Example sentences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {word.examples.map((example) => (
              <div key={example.sentence}>
                <p className="italic">{example.sentence}</p>
                {example.context && <p className="text-sm text-muted-foreground">{example.context}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {word.realLifeUsage && (
        <Card>
          <CardHeader>
            <CardTitle>Real-life usage</CardTitle>
          </CardHeader>
          <CardContent>{word.realLifeUsage}</CardContent>
        </Card>
      )}

      {word.usageNotes && (
        <Card>
          <CardHeader>
            <CardTitle>Usage notes</CardTitle>
          </CardHeader>
          <CardContent>{word.usageNotes}</CardContent>
        </Card>
      )}

      {word.commonMistakes && (
        <Card>
          <CardHeader>
            <CardTitle>Common mistakes</CardTitle>
          </CardHeader>
          <CardContent>{word.commonMistakes}</CardContent>
        </Card>
      )}
    </div>
  )
}

function ChipSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div>
      <h2 className="mb-2 font-medium">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item}>{item}</Badge>
        ))}
      </div>
    </div>
  )
}
