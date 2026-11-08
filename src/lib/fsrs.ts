import { DefaultScheduler, Rating, State } from 'ts-fsrs'
import type { LearningStatus, ReviewProgress, ReviewRating } from '@/types/vocabulary'

const ratingMap: Record<ReviewRating, 1 | 2 | 3 | 4> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

let schedulerPromise: ReturnType<typeof DefaultScheduler> | null = null

export function getScheduler() {
  if (!schedulerPromise) {
    schedulerPromise = DefaultScheduler({
      desiredRetention: 0.9,
      enableFuzz: false,
      maximumInterval: 365,
    })
  }
  return schedulerPromise
}

export async function createFsrsCard(now = new Date()) {
  const scheduler = await getScheduler()
  return scheduler.newCard({ now }) as Record<string, unknown>
}

function asDate(value: unknown, fallback: Date) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return fallback
}

export function learningStatusFromCard(card: Record<string, unknown>): LearningStatus {
  const state = Number(card.state ?? card.scheduleStatus === 'new' ? State.New : card.state)
  const stability = Number(card.stability ?? 0)
  const reps = Number(card.reps ?? 0)
  if (!reps || state === State.New) return 'new'
  if (state === State.Learning || state === State.Relearning) return 'learning'
  if (stability >= 21) return 'mastered'
  return 'reviewing'
}

export function dueDateFromCard(card: Record<string, unknown>, fallback = new Date()) {
  return asDate(card.dueAt ?? card.due, fallback)
}

export function explainSchedule(progress: ReviewProgress) {
  const due = new Date(progress.nextReviewAt)
  const now = new Date()
  const overdueDays = Math.max(0, Math.round((now.getTime() - due.getTime()) / 86_400_000))
  if (progress.learningStatus === 'new') {
    return 'This word is new, so it is due immediately to begin learning.'
  }
  if (overdueDays > 0) {
    return `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}. FSRS shortened or kept this interval because recall is less certain.`
  }
  return `Scheduled from stability ${progress.stability.toFixed(1)} and difficulty ${progress.difficulty.toFixed(1)}. A successful recall lengthens the interval; Again brings it back sooner.`
}

export async function reviewFsrsCard(
  card: Record<string, unknown>,
  rating: ReviewRating,
  now = new Date(),
) {
  const scheduler = await getScheduler()
  // Re-hydrate date fields that may have been serialised as ISO strings
  const hydrated = {
    ...card,
    dueAt: asDate(card.dueAt ?? card.due, now),
    lastReviewAt: card.lastReviewAt
      ? asDate(card.lastReviewAt, now)
      : card.last_review
        ? asDate(card.last_review, now)
        : null,
  }
  // The stored card shape matches the scheduler's internal Card type at runtime.
  // ts-fsrs v6 exports two incompatible Card types from different internal modules;
  // we bypass this via a double cast since we control the shape via createFsrsCard.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = scheduler.review({
    card: hydrated as unknown as any,
    grade: ratingMap[rating],
    now,
  })

  const nextCard = result.card as Record<string, unknown>
  return {
    card: nextCard,
    dueAt: dueDateFromCard(nextCard, now),
    status: learningStatusFromCard(nextCard),
    stability: Number(nextCard.stability ?? 0),
    difficulty: Number(nextCard.difficulty ?? 0),
    reps: Number(nextCard.reps ?? 0),
  }
}

export { Rating, State }
