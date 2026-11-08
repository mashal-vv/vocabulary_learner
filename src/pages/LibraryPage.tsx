import { BookOpen, Heart, Search, SlidersHorizontal, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useLibrary } from '@/hooks/useLibrary'
import { cn } from '@/lib/utils'
import type { LearningStatus, VocabularyWord } from '@/types/vocabulary'

type Filter = 'all' | 'due' | 'favourites' | 'difficult' | LearningStatus
type SortKey = 'added' | 'alpha' | 'due' | 'reviewed'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'due', label: 'Due' },
  { value: 'new', label: 'New' },
  { value: 'learning', label: 'Learning' },
  { value: 'reviewing', label: 'Reviewing' },
  { value: 'mastered', label: 'Mastered' },
  { value: 'favourites', label: 'Favourites' },
  { value: 'difficult', label: 'Difficult' },
]

const STATUS_COLOURS: Record<LearningStatus, string> = {
  new: 'bg-muted text-muted-foreground',
  learning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  reviewing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  mastered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
}

export function LibraryPage() {
  const { words, progress, favourite, isLoading } = useLibrary()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<SortKey>('added')

  const now = Date.now()
  const dueIds = useMemo(
    () =>
      new Set(
        progress
          .filter((p) => new Date(p.nextReviewAt).getTime() <= now)
          .map((p) => p.vocabularyWordId),
      ),
    [progress, now],
  )
  const progressByWordId = useMemo(
    () => new Map(progress.map((p) => [p.vocabularyWordId, p])),
    [progress],
  )

  const filtered = useMemo(() => {
    let list: VocabularyWord[] = [...words]

    // Text search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (w) =>
          w.word.toLowerCase().includes(q) ||
          w.simpleDefinition?.toLowerCase().includes(q) ||
          w.definitions.some((d) => d.definition.toLowerCase().includes(q)),
      )
    }

    // Semantic filter
    switch (filter) {
      case 'due':
        list = list.filter((w) => dueIds.has(w.id))
        break
      case 'favourites':
        list = list.filter((w) => w.isFavourite)
        break
      case 'difficult':
        list = list.filter((w) => w.isDifficult)
        break
      case 'all':
        break
      default:
        list = list.filter((w) => w.learningStatus === filter)
    }

    // Sort
    list = [...list].sort((a, b) => {
      switch (sort) {
        case 'alpha':
          return a.word.localeCompare(b.word)
        case 'due': {
          const aP = progressByWordId.get(a.id)
          const bP = progressByWordId.get(b.id)
          const aT = aP ? new Date(aP.nextReviewAt).getTime() : 0
          const bT = bP ? new Date(bP.nextReviewAt).getTime() : 0
          return aT - bT
        }
        case 'reviewed': {
          const aP = progressByWordId.get(a.id)
          const bP = progressByWordId.get(b.id)
          const aT = aP?.lastReviewedAt ? new Date(aP.lastReviewedAt).getTime() : 0
          const bT = bP?.lastReviewedAt ? new Date(bP.lastReviewedAt).getTime() : 0
          return bT - aT
        }
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      }
    })

    return list
  }, [words, search, filter, sort, dueIds, progressByWordId])

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl">Library</h1>
        <p className="mt-1 text-muted-foreground">
          {words.length} word{words.length === 1 ? '' : 's'} in your collection
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="library-search"
            placeholder="Search words or definitions…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger id="library-sort" className="w-40">
              <SlidersHorizontal className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="added">Date added</SelectItem>
              <SelectItem value="alpha">Alphabetical</SelectItem>
              <SelectItem value="due">Next due</SelectItem>
              <SelectItem value="reviewed">Last reviewed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            id={`filter-${f.value}`}
            onClick={() => setFilter(f.value)}
            className={cn(
              'rounded-full border border-border px-3 py-1 text-sm transition-colors hover:bg-secondary',
              filter === f.value
                ? 'border-primary bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-muted-foreground',
            )}
          >
            {f.label}
            {f.value === 'due' && dueIds.size > 0 && (
              <span className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-foreground text-[10px] font-semibold text-primary">
                {dueIds.size}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Word grid */}
      {filtered.length === 0 ? (
        <EmptyState filter={filter} search={search} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((word) => (
            <WordCard
              key={word.id}
              word={word}
              isDue={dueIds.has(word.id)}
              onFavourite={() => void favourite.mutateAsync(word.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function WordCard({
  word,
  isDue,
  onFavourite,
}: {
  word: VocabularyWord
  isDue: boolean
  onFavourite: () => void
}) {
  return (
    <div className="group relative flex flex-col rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
      {/* Favourite */}
      <button
        type="button"
        id={`fav-${word.id}`}
        aria-label={word.isFavourite ? 'Remove from favourites' : 'Add to favourites'}
        onClick={(e) => {
          e.preventDefault()
          onFavourite()
        }}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100"
      >
        <Star className={cn('h-4 w-4', word.isFavourite && 'fill-current text-primary')} />
      </button>

      <Link to={`/word/${word.normalizedWord}`} className="flex flex-1 flex-col gap-2">
        {/* Status + due badge */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
              STATUS_COLOURS[word.learningStatus],
            )}
          >
            {word.learningStatus}
          </span>
          {isDue && (
            <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400">
              Due
            </Badge>
          )}
          {word.isFavourite && (
            <Heart className="h-3 w-3 fill-current text-rose-500" aria-hidden />
          )}
        </div>

        {/* Word */}
        <p className="font-serif text-xl leading-tight">{word.word}</p>
        {word.partOfSpeech && (
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{word.partOfSpeech}</p>
        )}
        {/* Short definition */}
        <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
          {word.simpleDefinition ?? word.definitions[0]?.definition ?? 'No definition saved.'}
        </p>
      </Link>
    </div>
  )
}

function EmptyState({ filter, search }: { filter: Filter; search: string }) {
  return (
    <div className="flex flex-col items-center gap-4 py-16 text-center">
      <BookOpen className="h-12 w-12 text-muted-foreground/40" />
      {search ? (
        <>
          <p className="text-lg font-medium">No words match "{search}"</p>
          <p className="text-sm text-muted-foreground">Try a different search term.</p>
        </>
      ) : filter !== 'all' ? (
        <>
          <p className="text-lg font-medium">Nothing here yet</p>
          <p className="text-sm text-muted-foreground">
            No words match the "{FILTERS.find((f) => f.value === filter)?.label}" filter.
          </p>
          <Button variant="outline" asChild>
            <Link to="/search">Search a word to get started</Link>
          </Button>
        </>
      ) : (
        <>
          <p className="text-lg font-medium">Your library is empty</p>
          <p className="text-sm text-muted-foreground">Search for a word to begin building your vocabulary.</p>
          <Button asChild>
            <Link to="/search">Search a word</Link>
          </Button>
        </>
      )}
    </div>
  )
}
