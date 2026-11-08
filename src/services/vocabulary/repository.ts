import { db } from '@/db/database'
import { createFsrsCard, dueDateFromCard, learningStatusFromCard, reviewFsrsCard } from '@/lib/fsrs'
import { toIso } from '@/lib/utils'
import { normalizeWord } from '@/lib/word'
import type {
  Collection,
  LearningStatus,
  OutboxItem,
  QuestionType,
  ReviewHistoryEntry,
  ReviewProgress,
  ReviewRating,
  UserSettings,
  VocabularyWord,
} from '@/types/vocabulary'

function queue(item: Omit<OutboxItem, 'id' | 'createdAt'>) {
  return db.outbox.add({
    ...item,
    id: crypto.randomUUID(),
    createdAt: toIso(),
  })
}

export async function defaultSettings(userId: string): Promise<UserSettings> {
  const existing = await db.settings.get(userId)
  if (existing) return existing
  const settings: UserSettings = {
    userId,
    theme: 'system',
    dailyGoal: 5,
    preferredLanguage: 'en-GB',
    pronunciationAccent: 'british',
    createdAt: toIso(),
    updatedAt: toIso(),
  }
  await db.settings.put(settings)
  await queue({ table: 'user_settings', op: 'upsert', payload: settings as unknown as Record<string, unknown> })
  return settings
}

export async function updateSettings(userId: string, patch: Partial<UserSettings>) {
  const current = await defaultSettings(userId)
  const next = { ...current, ...patch, updatedAt: toIso() }
  await db.settings.put(next)
  await queue({ table: 'user_settings', op: 'upsert', payload: next as unknown as Record<string, unknown> })
  return next
}

export async function findWordByNormalized(userId: string, normalized: string) {
  return db.words.where({ userId, normalizedWord: normalizeWord(normalized) }).first()
}

export async function listWords(userId: string) {
  return db.words.where('userId').equals(userId).toArray()
}

export async function getProgressForWord(wordId: string) {
  return db.reviewProgress.where('vocabularyWordId').equals(wordId).first()
}

export async function listProgress(userId: string) {
  return db.reviewProgress.where('userId').equals(userId).toArray()
}

async function ensureProgress(word: VocabularyWord): Promise<ReviewProgress> {
  const existing = await getProgressForWord(word.id)
  if (existing) return existing
  const card = await createFsrsCard()
  const progress: ReviewProgress = {
    id: crypto.randomUUID(),
    userId: word.userId,
    vocabularyWordId: word.id,
    reviewCount: 0,
    difficulty: Number(card.difficulty ?? 0),
    stability: Number(card.stability ?? 0),
    nextReviewAt: dueDateFromCard(card).toISOString(),
    learningStatus: 'new',
    fsrsCard: card,
    consecutiveCorrect: 0,
    updatedAt: toIso(),
  }
  await db.reviewProgress.put(progress)
  await queue({ table: 'review_progress', op: 'upsert', payload: progress as unknown as Record<string, unknown> })
  return progress
}

export async function saveSearchedWord(
  userId: string,
  incoming: Omit<
    VocabularyWord,
    'id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'learningStatus' | 'personalNotes' | 'isFavourite' | 'isDifficult'
  >,
) {
  const normalized = normalizeWord(incoming.normalizedWord || incoming.word)
  const existing = await findWordByNormalized(userId, normalized)
  const now = toIso()
  if (existing) {
    const merged: VocabularyWord = {
      ...existing,
      ...incoming,
      id: existing.id,
      userId: existing.userId,
      normalizedWord: existing.normalizedWord,
      personalNotes: existing.personalNotes,
      isFavourite: existing.isFavourite,
      isDifficult: existing.isDifficult,
      learningStatus: existing.learningStatus,
      createdAt: existing.createdAt,
      lastAccessedAt: now,
      updatedAt: now,
      simpleDefinition: incoming.simpleDefinition ?? existing.simpleDefinition,
      malayalamTranslation: incoming.malayalamTranslation ?? existing.malayalamTranslation,
      collocations: incoming.collocations.length > 0 ? incoming.collocations : existing.collocations,
      expressions: incoming.expressions.length > 0 ? incoming.expressions : existing.expressions,
      usageNotes: incoming.usageNotes ?? existing.usageNotes,
      commonMistakes: incoming.commonMistakes ?? existing.commonMistakes,
      imageUrl: incoming.imageUrl ?? existing.imageUrl,
      examples: incoming.examples.length > 0 ? incoming.examples : existing.examples,
    }
    await db.words.put(merged)
    await queue({ table: 'vocabulary_words', op: 'upsert', payload: merged as unknown as Record<string, unknown> })
    await ensureProgress(merged)
    return { word: merged, created: false }
  }

  const word: VocabularyWord = {
    ...incoming,
    id: crypto.randomUUID(),
    userId,
    normalizedWord: normalized,
    personalNotes: '',
    isFavourite: false,
    isDifficult: false,
    learningStatus: 'new',
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
  }
  await db.words.put(word)
  await queue({ table: 'vocabulary_words', op: 'upsert', payload: word as unknown as Record<string, unknown> })
  await ensureProgress(word)
  return { word, created: true }
}

export async function updateWord(wordId: string, patch: Partial<VocabularyWord>) {
  const current = await db.words.get(wordId)
  if (!current) return null
  const next = { ...current, ...patch, id: current.id, userId: current.userId, updatedAt: toIso() }
  await db.words.put(next)
  await queue({ table: 'vocabulary_words', op: 'upsert', payload: next as unknown as Record<string, unknown> })
  return next
}

export async function deleteWord(wordId: string) {
  const word = await db.words.get(wordId)
  if (!word) return
  const progress = await getProgressForWord(wordId)
  await db.words.delete(wordId)
  if (progress) await db.reviewProgress.delete(progress.id)
  await db.reviewHistory.where('vocabularyWordId').equals(wordId).delete()
  await db.collectionWords.where('vocabularyWordId').equals(wordId).delete()
  await queue({ table: 'vocabulary_words', op: 'delete', payload: { id: wordId, userId: word.userId } })
  if (progress) {
    await queue({ table: 'review_progress', op: 'delete', payload: { id: progress.id, userId: word.userId } })
  }
}

export async function applyReview(options: {
  word: VocabularyWord
  rating: ReviewRating
  questionType: QuestionType
  userAnswer: string
  isCorrect: boolean
}) {
  const progress = await ensureProgress(options.word)
  const now = new Date()
  const reviewed = await reviewFsrsCard(progress.fsrsCard, options.rating, now)
  const consecutiveCorrect = options.isCorrect ? progress.consecutiveCorrect + 1 : 0
  let status: LearningStatus = reviewed.status
  if (consecutiveCorrect >= 3 && reviewed.stability >= 21) status = 'mastered'
  const next: ReviewProgress = {
    ...progress,
    reviewCount: reviewed.reps,
    difficulty: reviewed.difficulty,
    stability: reviewed.stability,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: reviewed.dueAt.toISOString(),
    learningStatus: status,
    fsrsCard: reviewed.card,
    consecutiveCorrect,
    updatedAt: toIso(),
  }
  const history: ReviewHistoryEntry = {
    id: crypto.randomUUID(),
    userId: options.word.userId,
    vocabularyWordId: options.word.id,
    questionType: options.questionType,
    userAnswer: options.userAnswer,
    isCorrect: options.isCorrect,
    rating: options.rating,
    reviewedAt: now.toISOString(),
  }
  await db.reviewProgress.put(next)
  await db.reviewHistory.put(history)
  await updateWord(options.word.id, {
    learningStatus: status,
    isDifficult: options.rating === 'again' || options.rating === 'hard' || options.word.isDifficult,
  })
  await queue({ table: 'review_progress', op: 'upsert', payload: next as unknown as Record<string, unknown> })
  await queue({ table: 'review_history', op: 'upsert', payload: history as unknown as Record<string, unknown> })
  return { progress: next, history }
}

export async function listHistory(userId: string) {
  return db.reviewHistory.where('userId').equals(userId).toArray()
}

export async function listCollections(userId: string) {
  return db.collections.where('userId').equals(userId).toArray()
}

export async function createCollection(userId: string, name: string, description = '') {
  const collection: Collection = {
    id: crypto.randomUUID(),
    userId,
    name: name.trim(),
    description: description.trim(),
    createdAt: toIso(),
    updatedAt: toIso(),
  }
  await db.collections.put(collection)
  await queue({ table: 'collections', op: 'upsert', payload: collection as unknown as Record<string, unknown> })
  return collection
}

export async function addWordToCollection(collectionId: string, vocabularyWordId: string) {
  const row = { collectionId, vocabularyWordId }
  await db.collectionWords.put(row)
  await queue({
    table: 'collection_words',
    op: 'upsert',
    payload: row as unknown as Record<string, unknown>,
  })
}

export async function listCollectionWordIds(collectionId: string) {
  const rows = await db.collectionWords.where('collectionId').equals(collectionId).toArray()
  return rows.map((row) => row.vocabularyWordId)
}

export function dueWords(words: VocabularyWord[], progress: ReviewProgress[]) {
  const now = Date.now()
  const byWord = new Map(progress.map((item) => [item.vocabularyWordId, item]))
  return words.filter((word) => {
    const item = byWord.get(word.id)
    if (!item) return true
    return new Date(item.nextReviewAt).getTime() <= now
  })
}

export { learningStatusFromCard }
