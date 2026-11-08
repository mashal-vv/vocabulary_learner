import { isSameLocalDay, startOfLocalDay } from '@/lib/utils'
import type { ReviewHistoryEntry, ReviewProgress, UserSettings, VocabularyWord } from '@/types/vocabulary'

export function computeDashboardStats(
  words: VocabularyWord[],
  progress: ReviewProgress[],
  history: ReviewHistoryEntry[],
  settings: UserSettings,
) {
  const now = new Date()
  const todayStart = startOfLocalDay(now)
  const due = progress.filter((item) => new Date(item.nextReviewAt).getTime() <= now.getTime()).length
  const mastered = words.filter((word) => word.learningStatus === 'mastered').length
  const learnedToday = words.filter((word) => isSameLocalDay(new Date(word.createdAt), now)).length
  const reviewedToday = history.filter((item) => isSameLocalDay(new Date(item.reviewedAt), now)).length

  const activityDays = new Map<string, number>()
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(todayStart)
    day.setDate(day.getDate() - i)
    activityDays.set(day.toISOString().slice(0, 10), 0)
  }
  for (const item of history) {
    const key = new Date(item.reviewedAt).toISOString().slice(0, 10)
    if (activityDays.has(key)) {
      activityDays.set(key, (activityDays.get(key) ?? 0) + 1)
    }
  }
  for (const word of words) {
    const key = new Date(word.createdAt).toISOString().slice(0, 10)
    if (activityDays.has(key)) {
      activityDays.set(key, (activityDays.get(key) ?? 0) + 1)
    }
  }

  const activeDates = new Set(
    [...history.map((item) => startOfLocalDay(new Date(item.reviewedAt)).getTime()),
      ...words.map((item) => startOfLocalDay(new Date(item.createdAt)).getTime())],
  )
  let streak = 0
  const cursor = startOfLocalDay(now)
  while (activeDates.has(cursor.getTime())) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  if (streak === 0) {
    cursor.setDate(cursor.getDate() - 1)
    // If the user studied yesterday, keep counting backwards from yesterday.
    const yesterday = startOfLocalDay(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (activeDates.has(yesterday.getTime())) {
      const walk = new Date(yesterday)
      while (activeDates.has(walk.getTime())) {
        streak += 1
        walk.setDate(walk.getDate() - 1)
      }
    }
  }

  const weekly = Array.from(activityDays.entries()).map(([date, count]) => ({
    date,
    label: new Date(date).toLocaleDateString('en-GB', { weekday: 'short' }),
    count,
  }))

  const wordOfTheDay =
    words.find((word) => word.learningStatus === 'reviewing') ??
    words.find((word) => word.learningStatus === 'learning') ??
    words[0]

  return {
    total: words.length,
    learnedToday,
    due,
    mastered,
    streak,
    weekly,
    dailyGoal: settings.dailyGoal,
    goalProgress: Math.min(100, Math.round(((learnedToday + reviewedToday) / Math.max(settings.dailyGoal, 1)) * 100)),
    upcoming: due,
    wordOfTheDay,
    reviewedToday,
  }
}
