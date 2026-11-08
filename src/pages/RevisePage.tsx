import { CheckCircle2, ChevronRight, XCircle } from 'lucide-react'
import { useCallback, useMemo, useReducer, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { explainSchedule } from '@/lib/fsrs'
import {
  buildFillBlankPrompt,
  buildMeaningChoices,
  evaluateFillBlank,
  evaluateTypedMeaning,
  pickQuestionType,
  selectRevisionQueue,
} from '@/lib/revision'
import { cn } from '@/lib/utils'
import { applyReview } from '@/services/vocabulary/repository'
import { useLibrary } from '@/hooks/useLibrary'
import type { QuestionType, ReviewProgress, ReviewRating, VocabularyWord } from '@/types/vocabulary'

// ─── State Machine ────────────────────────────────────────────────────────────

type SessionItem = {
  word: VocabularyWord
  progress: ReviewProgress | undefined
  questionType: QuestionType
  choices?: string[]
  correct?: string
  fillPrompt?: string
}

type RevealedState = {
  phase: 'revealed'
  item: SessionItem
  userInput: string
  isCorrect: boolean
  answered: true
}

type AnsweringState = {
  phase: 'answering'
  item: SessionItem
  userInput: string
  answered: false
}

type SummaryState = { phase: 'summary'; totalDone: number; correct: number }

type State = AnsweringState | RevealedState | SummaryState

type Action =
  | { type: 'SET_INPUT'; value: string }
  | { type: 'REVEAL'; isCorrect: boolean }
  | { type: 'NEXT'; nextItem: SessionItem | null; totalDone: number; correct: number }

function buildItem(word: VocabularyWord, progress: ReviewProgress | undefined, pool: VocabularyWord[]): SessionItem {
  const questionType = pickQuestionType()
  if (questionType === 'multiple_choice') {
    const { options, correct } = buildMeaningChoices(word, pool)
    return { word, progress, questionType, choices: options, correct }
  }
  if (questionType === 'fill_blank') {
    return { word, progress, questionType, fillPrompt: buildFillBlankPrompt(word) }
  }
  return { word, progress, questionType }
}

function reducer(state: State, action: Action): State {
  if (action.type === 'SET_INPUT' && state.phase === 'answering') {
    return { ...state, userInput: action.value }
  }
  if (action.type === 'REVEAL' && state.phase === 'answering') {
    const { phase: _p, answered: _a, ...rest } = state
    return { ...rest, phase: 'revealed', isCorrect: action.isCorrect, answered: true }
  }
  if (action.type === 'NEXT') {
    if (!action.nextItem) {
      return { phase: 'summary', totalDone: action.totalDone, correct: action.correct }
    }
    return { phase: 'answering', item: action.nextItem, userInput: '', answered: false }
  }
  return state
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function RevisePage() {
  const { words, progress, invalidate } = useLibrary()

  const queue = useMemo(() => {
    const withDue = words.map((w) => ({
      ...w,
      nextReviewAt: progress.find((p) => p.vocabularyWordId === w.id)?.nextReviewAt,
    }))
    return selectRevisionQueue(withDue, { limit: 20, preferDue: true })
  }, [words, progress])

  const initialItem = useMemo(() => {
    const first = queue[0]
    if (!first) return null
    const prog = progress.find((p) => p.vocabularyWordId === first.id)
    return buildItem(first, prog, words)
  }, [queue, words, progress]) // eslint-disable-line react-hooks/exhaustive-deps

  const [state, dispatch] = useReducer(reducer, null, (): State => {
    if (!initialItem) return { phase: 'summary', totalDone: 0, correct: 0 }
    return { phase: 'answering', item: initialItem, userInput: '', answered: false }
  })

  const [sessionDone, setSessionDone] = useState<string[]>([])
  const [sessionCorrect, setSessionCorrect] = useState(0)

  const remaining = queue.filter((w) => !sessionDone.includes(w.id))

  const handleReveal = useCallback((userInput: string) => {
    if (state.phase !== 'answering') return
    const { item } = state
    let isCorrect = false
    if (item.questionType === 'multiple_choice') {
      isCorrect = userInput === item.correct
    } else if (item.questionType === 'fill_blank') {
      isCorrect = evaluateFillBlank(userInput, item.word)
    } else {
      isCorrect = evaluateTypedMeaning(userInput, item.word)
    }
    dispatch({ type: 'REVEAL', isCorrect })
  }, [state])

  const handleRate = useCallback(async (rating: ReviewRating) => {
    if (state.phase !== 'revealed') return
    const { item, isCorrect, userInput } = state
    try {
      await applyReview({
        word: item.word,
        rating,
        questionType: item.questionType,
        userAnswer: userInput,
        isCorrect,
      })
    } catch {
      toast.error('Could not save review.')
    }
    const newDone = [...sessionDone, item.word.id]
    const newCorrect = sessionCorrect + (isCorrect ? 1 : 0)
    setSessionDone(newDone)
    setSessionCorrect(newCorrect)
    await invalidate()

    const nextWord = remaining.filter((w) => !newDone.includes(w.id))[0]
    if (!nextWord) {
      dispatch({ type: 'NEXT', nextItem: null, totalDone: newDone.length, correct: newCorrect })
      return
    }
    const nextProgress = progress.find((p) => p.vocabularyWordId === nextWord.id)
    const nextItem = buildItem(nextWord, nextProgress, words)
    dispatch({ type: 'NEXT', nextItem, totalDone: newDone.length, correct: newCorrect })
  }, [state, sessionDone, sessionCorrect, remaining, progress, words, invalidate])

  if (state.phase === 'summary') {
    return <SummaryScreen done={state.totalDone} correct={state.correct} hadQueue={queue.length > 0} />
  }

  const { item, userInput } = state
  const isCorrect = state.phase === 'revealed' ? state.isCorrect : false
  const revealed = state.phase === 'revealed'
  const totalInSession = queue.length
  const doneCount = sessionDone.length
  const progressPct = totalInSession > 0 ? Math.round((doneCount / totalInSession) * 100) : 0

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Revision</h1>
        <p className="mt-1 text-muted-foreground">
          {totalInSession - doneCount} card{totalInSession - doneCount === 1 ? '' : 's'} remaining
        </p>
      </div>

      <div className="space-y-1">
        <Progress value={progressPct} />
        <p className="text-xs text-muted-foreground">{doneCount} / {totalInSession} done</p>
      </div>

      {item.questionType === 'multiple_choice' && item.choices && item.correct && (
        <MultipleChoiceCard
          word={item.word}
          choices={item.choices}
          correct={item.correct}
          revealed={revealed}
          isCorrect={isCorrect}
          onSelect={(choice) => {
            dispatch({ type: 'SET_INPUT', value: choice })
            handleReveal(choice)
          }}
          selectedAnswer={userInput}
          progress={item.progress}
        />
      )}
      {item.questionType === 'fill_blank' && (
        <FillBlankCard
          word={item.word}
          prompt={item.fillPrompt ?? ''}
          userInput={userInput}
          revealed={revealed}
          isCorrect={isCorrect}
          onInputChange={(v) => dispatch({ type: 'SET_INPUT', value: v })}
          onSubmit={() => handleReveal(userInput)}
          progress={item.progress}
        />
      )}
      {item.questionType === 'type_meaning' && (
        <TypeMeaningCard
          word={item.word}
          userInput={userInput}
          revealed={revealed}
          isCorrect={isCorrect}
          onInputChange={(v) => dispatch({ type: 'SET_INPUT', value: v })}
          onSubmit={() => handleReveal(userInput)}
          progress={item.progress}
        />
      )}

      {revealed && <RatingBar onRate={(r) => void handleRate(r)} />}
    </div>
  )
}

// ─── Question Card Components ─────────────────────────────────────────────────

function MultipleChoiceCard({
  word,
  choices,
  correct,
  revealed,
  isCorrect,
  selectedAnswer,
  onSelect,
  progress,
}: {
  word: VocabularyWord
  choices: string[]
  correct: string
  revealed: boolean
  isCorrect: boolean
  selectedAnswer: string
  onSelect: (choice: string) => void
  progress: ReviewProgress | undefined
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-xs uppercase tracking-wide">Multiple choice</CardDescription>
        <CardTitle className="font-serif text-3xl">{word.word}</CardTitle>
        {word.phoneticTranscription && (
          <CardDescription>{word.phoneticTranscription}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">What does this word mean?</p>
        <div className="space-y-2">
          {choices.map((choice) => {
            const isSelected = selectedAnswer === choice
            const isRight = choice === correct
            return (
              <button
                key={choice}
                type="button"
                disabled={revealed}
                onClick={() => onSelect(choice)}
                className={cn(
                  'w-full rounded-lg border border-border px-4 py-3 text-left text-sm transition-colors',
                  !revealed && 'hover:bg-secondary hover:text-foreground',
                  !revealed && isSelected && 'border-primary bg-secondary',
                  revealed && isRight && 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300',
                  revealed && isSelected && !isRight && 'border-red-400 bg-red-50 text-red-900 dark:bg-red-900/20 dark:text-red-300',
                )}
              >
                {choice}
              </button>
            )
          })}
        </div>
        {revealed && progress && (
          <p className="text-xs text-muted-foreground">{explainSchedule(progress)}</p>
        )}
        <ResultBanner isCorrect={isCorrect} revealed={revealed} />
      </CardContent>
    </Card>
  )
}

function FillBlankCard({
  word,
  prompt,
  userInput,
  revealed,
  isCorrect,
  onInputChange,
  onSubmit,
  progress,
}: {
  word: VocabularyWord
  prompt: string
  userInput: string
  revealed: boolean
  isCorrect: boolean
  onInputChange: (v: string) => void
  onSubmit: () => void
  progress: ReviewProgress | undefined
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-xs uppercase tracking-wide">Fill in the blank</CardDescription>
        <CardTitle className="font-serif text-2xl leading-relaxed">"{prompt}"</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">Type the missing word</p>
        <div className="flex gap-2">
          <Input
            id="fill-blank-input"
            value={userInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !revealed) onSubmit() }}
            disabled={revealed}
            placeholder="Type your answer…"
            autoFocus
          />
          {!revealed && (
            <Button onClick={onSubmit} disabled={!userInput.trim()}>
              Check
            </Button>
          )}
        </div>
        {revealed && (
          <p className="rounded-lg border border-border bg-secondary px-4 py-3 font-serif text-lg">
            {word.word}
            {word.pronunciation && <span className="ml-2 text-sm font-normal text-muted-foreground">{word.pronunciation}</span>}
          </p>
        )}
        {revealed && progress && (
          <p className="text-xs text-muted-foreground">{explainSchedule(progress)}</p>
        )}
        <ResultBanner isCorrect={isCorrect} revealed={revealed} />
      </CardContent>
    </Card>
  )
}

function TypeMeaningCard({
  word,
  userInput,
  revealed,
  isCorrect,
  onInputChange,
  onSubmit,
  progress,
}: {
  word: VocabularyWord
  userInput: string
  revealed: boolean
  isCorrect: boolean
  onInputChange: (v: string) => void
  onSubmit: () => void
  progress: ReviewProgress | undefined
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription className="text-xs uppercase tracking-wide">Type the meaning</CardDescription>
        <CardTitle className="font-serif text-3xl">{word.word}</CardTitle>
        {word.partOfSpeech && <CardDescription>{word.partOfSpeech}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium">What does this word mean? (use key words)</p>
        <div className="flex gap-2">
          <Input
            id="type-meaning-input"
            value={userInput}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !revealed) onSubmit() }}
            disabled={revealed}
            placeholder="Describe the meaning…"
            autoFocus
          />
          {!revealed && (
            <Button onClick={onSubmit} disabled={!userInput.trim()}>
              Check
            </Button>
          )}
        </div>
        {revealed && (
          <div className="rounded-lg border border-border bg-secondary px-4 py-3 text-sm">
            <p className="font-medium">Definition:</p>
            <p className="mt-1">{word.simpleDefinition ?? word.definitions[0]?.definition}</p>
          </div>
        )}
        {revealed && progress && (
          <p className="text-xs text-muted-foreground">{explainSchedule(progress)}</p>
        )}
        <ResultBanner isCorrect={isCorrect} revealed={revealed} />
      </CardContent>
    </Card>
  )
}

function ResultBanner({ isCorrect, revealed }: { isCorrect: boolean; revealed: boolean }) {
  if (!revealed) return null
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
      isCorrect
        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300'
        : 'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300',
    )}>
      {isCorrect
        ? <><CheckCircle2 className="h-4 w-4" /> Correct! Now rate how easy it felt.</>
        : <><XCircle className="h-4 w-4" /> Not quite. Rate your recall honestly.</>}
    </div>
  )
}

function RatingBar({ onRate }: { onRate: (r: ReviewRating) => void }) {
  const ratings: { value: ReviewRating; label: string; description: string }[] = [
    { value: 'again', label: 'Again', description: 'Complete blackout' },
    { value: 'hard', label: 'Hard', description: 'With difficulty' },
    { value: 'good', label: 'Good', description: 'Correctly recalled' },
    { value: 'easy', label: 'Easy', description: 'Too simple' },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How well did you remember it?</CardTitle>
        <CardDescription>This adjusts when you will see this word next.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ratings.map((r) => (
          <button
            key={r.value}
            type="button"
            id={`rate-${r.value}`}
            onClick={() => onRate(r.value)}
            className={cn(
              'flex flex-col rounded-xl border border-border px-3 py-3 text-center transition-colors hover:bg-secondary',
              r.value === 'again' && 'hover:border-red-400',
              r.value === 'hard' && 'hover:border-amber-400',
              r.value === 'good' && 'hover:border-primary',
              r.value === 'easy' && 'hover:border-emerald-400',
            )}
          >
            <span className="font-semibold">{r.label}</span>
            <span className="mt-0.5 text-xs text-muted-foreground">{r.description}</span>
          </button>
        ))}
      </CardContent>
    </Card>
  )
}

function SummaryScreen({ done, correct, hadQueue }: { done: number; correct: number; hadQueue: boolean }) {
  if (!hadQueue || done === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-6 py-12 text-center">
        <div className="text-6xl">🎉</div>
        <h1 className="font-serif text-3xl">All caught up!</h1>
        <p className="text-muted-foreground">
          No words are due for revision right now. Great work keeping up with your practice.
        </p>
        <div className="flex justify-center gap-3">
          <Button variant="outline" asChild>
            <Link to="/library">Browse library</Link>
          </Button>
          <Button asChild>
            <Link to="/search">Search a new word</Link>
          </Button>
        </div>
      </div>
    )
  }

  const pct = Math.round((correct / done) * 100)
  return (
    <div className="mx-auto max-w-xl space-y-6 py-12 text-center">
      <div className="text-6xl">{pct >= 80 ? '🌟' : pct >= 50 ? '👍' : '📖'}</div>
      <h1 className="font-serif text-3xl">Session complete!</h1>
      <div className="grid grid-cols-3 gap-4 text-center">
        <Stat label="Reviewed" value={String(done)} />
        <Stat label="Correct" value={String(correct)} />
        <Stat label="Accuracy" value={`${pct}%`} />
      </div>
      <div className="flex justify-center gap-3">
        <Button variant="outline" asChild>
          <Link to="/library">Library</Link>
        </Button>
        <Button asChild>
          <Link to="/search">
            <ChevronRight className="mr-1 h-4 w-4" />
            Learn a new word
          </Link>
        </Button>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-3xl">{value}</p>
    </div>
  )
}
