import { AlertTriangle, ArrowLeft, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { WordDetails } from '@/components/word/WordDetails'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { useLibrary } from '@/hooks/useLibrary'

export function WordPage() {
  const { normalizedWord } = useParams<{ normalizedWord: string }>()
  const navigate = useNavigate()
  const { words, progress, favourite, remove, notes, invalidate } = useLibrary()

  const word = words.find((w) => w.normalizedWord === normalizedWord)
  const wordProgress = progress.find((p) => word && p.vocabularyWordId === word.id)

  const [noteText, setNoteText] = useState(word?.personalNotes ?? '')
  const [savingNote, setSavingNote] = useState(false)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync note text if the word loads asynchronously
  useEffect(() => {
    if (word) setNoteText(word.personalNotes)
  }, [word?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleNoteSave(value: string) {
    setNoteText(value)
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(async () => {
      if (!word) return
      setSavingNote(true)
      try {
        await notes.mutateAsync({ wordId: word.id, personalNotes: value })
      } catch {
        toast.error('Could not save note.')
      } finally {
        setSavingNote(false)
      }
    }, 800)
  }

  async function handleDelete() {
    if (!word) return
    await remove.mutateAsync(word.id)
    toast.success(`"${word.word}" deleted.`)
    navigate('/library', { replace: true })
  }

  async function handleFavourite() {
    if (!word) return
    await favourite.mutateAsync(word.id)
    await invalidate()
    toast.success(word.isFavourite ? 'Removed from favourites.' : 'Added to favourites.')
  }

  if (!word) {
    if (words.length === 0) {
      // Data still loading
      return (
        <div className="mx-auto max-w-2xl space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )
    }
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
        <AlertTriangle className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="font-serif text-2xl">Word not found</h1>
        <p className="text-muted-foreground">
          This word may have been deleted or never saved.
        </p>
        <Button variant="outline" onClick={() => navigate('/library')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to library
        </Button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Back navigation */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          {wordProgress && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/revise')}
            >
              Revise this word
            </Button>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete "{word.word}"?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove the word, its revision history, and all progress. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => void handleDelete()}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Main word details */}
      <WordDetails word={word} onFavourite={() => void handleFavourite()} />

      {/* FSRS progress info */}
      {wordProgress && (
        <Card>
          <CardHeader>
            <CardTitle>Revision progress</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ProgressStat label="Status" value={word.learningStatus} />
            <ProgressStat label="Reviews" value={String(wordProgress.reviewCount)} />
            <ProgressStat label="Stability" value={`${wordProgress.stability.toFixed(1)} days`} />
            <ProgressStat label="Difficulty" value={`${wordProgress.difficulty.toFixed(1)} / 10`} />
          </CardContent>
        </Card>
      )}

      {/* Personal notes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Personal notes</span>
            {savingNote && (
              <span className="text-xs font-normal text-muted-foreground">Saving…</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            id={`notes-${word.id}`}
            value={noteText}
            onChange={(e) => scheduleNoteSave(e.target.value)}
            placeholder="Add notes, context, mnemonics, or anything that helps you remember this word…"
            rows={4}
            className="resize-y"
          />
        </CardContent>
      </Card>
    </div>
  )
}

function ProgressStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-medium capitalize">{value}</p>
    </div>
  )
}
