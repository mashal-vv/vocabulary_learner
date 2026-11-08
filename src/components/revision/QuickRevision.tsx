import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { explainSchedule } from '@/lib/fsrs'
import { selectRevisionQueue } from '@/lib/revision'
import { applyReview } from '@/services/vocabulary/repository'
import type { ReviewProgress, ReviewRating, VocabularyWord } from '@/types/vocabulary'

export function QuickRevision({
  currentWordId,
  words,
  progress,
  sessionAsked,
  onAsked,
}: {
  currentWordId: string
  words: VocabularyWord[]
  progress: ReviewProgress[]
  sessionAsked: string[]
  onAsked: (wordId: string) => void
}) {
  const candidate = useMemo(() => {
    const withDue = words.map((word) => {
      const item = progress.find((entry) => entry.vocabularyWordId === word.id)
      return { ...word, nextReviewAt: item?.nextReviewAt }
    })
    const unused = withDue.filter((word) => !sessionAsked.includes(word.id))
    return selectRevisionQueue(unused, { excludeId: currentWordId, limit: 1, preferDue: true })[0]
  }, [words, progress, currentWordId, sessionAsked])

  const [revealed, setRevealed] = useState(false)

  if (words.filter((word) => word.id !== currentWordId).length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quick revision</CardTitle>
          <CardDescription>Learn a few more words and short recap questions will appear here.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  if (!candidate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Quick revision</CardTitle>
          <CardDescription>You have already recapped the available words in this session.</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const progressRow = progress.find((item) => item.vocabularyWordId === candidate.id)

  async function rate(rating: ReviewRating) {
    await applyReview({
      word: candidate,
      rating,
      questionType: 'type_meaning',
      userAnswer: revealed ? 'revealed' : rating,
      isCorrect: rating === 'good' || rating === 'easy',
    })
    toast.success('Revision saved.')
    onAsked(candidate.id)
    setRevealed(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick revision</CardTitle>
        <CardDescription>A previously saved word, preferably one that is due.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-lg">What does “{candidate.word}” mean?</p>
        {revealed && (
          <div className="rounded-xl bg-secondary p-4 text-sm">
            <p>{candidate.simpleDefinition ?? candidate.definitions[0]?.definition}</p>
            {progressRow && <p className="mt-2 text-muted-foreground">{explainSchedule(progressRow)}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setRevealed(true)}>
            Reveal answer
          </Button>
          <Button variant="ghost" onClick={() => onAsked(candidate.id)}>
            Skip
          </Button>
        </div>
        {revealed && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Button variant="outline" onClick={() => void rate('again')}>Again</Button>
            <Button variant="outline" onClick={() => void rate('hard')}>Hard</Button>
            <Button onClick={() => void rate('good')}>Good</Button>
            <Button onClick={() => void rate('easy')}>Easy</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
