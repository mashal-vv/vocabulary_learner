import { db } from '@/db/database'
import { getSupabase, isSupabaseConfigured } from '@/services/supabase/client'
import { getMemorySession } from '@/services/supabase/vault'
import type { SyncStatus } from '@/types/vocabulary'

export type SyncListener = (status: SyncStatus) => void

const listeners = new Set<SyncListener>()
let status: SyncStatus = navigator.onLine ? 'synced' : 'offline'
let running = false

export function getSyncStatus() {
  return status
}

export function subscribeSync(listener: SyncListener) {
  listeners.add(listener)
  listener(status)
  return () => listeners.delete(listener)
}

function setStatus(next: SyncStatus) {
  status = next
  listeners.forEach((listener) => listener(next))
}

function mapWord(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    word: String(row.word),
    normalizedWord: String(row.normalized_word),
    pronunciation: row.pronunciation ? String(row.pronunciation) : undefined,
    phoneticTranscription: row.phonetic_transcription ? String(row.phonetic_transcription) : undefined,
    audioUrl: row.audio_url ? String(row.audio_url) : undefined,
    partOfSpeech: row.part_of_speech ? String(row.part_of_speech) : undefined,
    definitions: (row.definitions as never) ?? [],
    simpleDefinition: row.simple_definition ? String(row.simple_definition) : undefined,
    malayalamTranslation: row.malayalam_translation ? String(row.malayalam_translation) : undefined,
    synonyms: (row.synonyms as string[]) ?? [],
    antonyms: (row.antonyms as string[]) ?? [],
    collocations: (row.collocations as string[]) ?? [],
    expressions: (row.expressions as string[]) ?? [],
    examples: (row.examples as never) ?? [],
    realLifeUsage: row.real_life_usage ? String(row.real_life_usage) : undefined,
    usageNotes: row.usage_notes ? String(row.usage_notes) : undefined,
    commonMistakes: row.common_mistakes ? String(row.common_mistakes) : undefined,
    imageUrl: row.image_url ? String(row.image_url) : undefined,
    imageCaption: row.image_caption ? String(row.image_caption) : undefined,
    personalNotes: String(row.personal_notes ?? ''),
    isFavourite: Boolean(row.is_favourite),
    isDifficult: Boolean(row.is_difficult),
    learningStatus: (row.learning_status as never) ?? 'new',
    lastAccessedAt: String(row.last_accessed_at ?? row.updated_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function wordToRow(word: Record<string, unknown>) {
  return {
    id: word.id,
    user_id: word.userId,
    word: word.word,
    normalized_word: word.normalizedWord,
    pronunciation: word.pronunciation,
    phonetic_transcription: word.phoneticTranscription,
    audio_url: word.audioUrl,
    part_of_speech: word.partOfSpeech,
    definitions: word.definitions,
    simple_definition: word.simpleDefinition,
    malayalam_translation: word.malayalamTranslation,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    collocations: word.collocations,
    expressions: word.expressions,
    examples: word.examples,
    real_life_usage: word.realLifeUsage,
    usage_notes: word.usageNotes,
    common_mistakes: word.commonMistakes,
    image_url: word.imageUrl,
    image_caption: word.imageCaption,
    personal_notes: word.personalNotes,
    is_favourite: word.isFavourite,
    is_difficult: word.isDifficult,
    learning_status: word.learningStatus,
    last_accessed_at: word.lastAccessedAt,
    created_at: word.createdAt,
    updated_at: word.updatedAt,
  }
}

function newer(local?: string, remote?: string) {
  if (!local) return true
  if (!remote) return false
  return new Date(remote).getTime() > new Date(local).getTime()
}

export async function synchronise() {
  if (!navigator.onLine) {
    setStatus('offline')
    return
  }
  if (!isSupabaseConfigured() || !getMemorySession()) {
    setStatus('synced')
    return
  }
  const supabase = getSupabase()
  if (!supabase || running) return
  running = true
  setStatus('synchronising')
  try {
    const outbox = await db.outbox.orderBy('createdAt').toArray()
    for (const item of outbox) {
      if (item.op === 'delete') {
        const table = item.table
        const id = String(item.payload.id)
        const { error } = await supabase.from(table).delete().eq('id', id)
        if (error) throw error
      } else if (item.table === 'vocabulary_words') {
        const { error } = await supabase.from('vocabulary_words').upsert(wordToRow(item.payload))
        if (error) throw error
      } else if (item.table === 'review_progress') {
        const payload = item.payload
        const { error } = await supabase.from('review_progress').upsert({
          id: payload.id,
          user_id: payload.userId,
          vocabulary_word_id: payload.vocabularyWordId,
          review_count: payload.reviewCount,
          difficulty: payload.difficulty,
          stability: payload.stability,
          last_reviewed_at: payload.lastReviewedAt,
          next_review_at: payload.nextReviewAt,
          learning_status: payload.learningStatus,
          fsrs_card: payload.fsrsCard,
          consecutive_correct: payload.consecutiveCorrect,
          updated_at: payload.updatedAt,
        })
        if (error) throw error
      } else if (item.table === 'review_history') {
        const payload = item.payload
        const { error } = await supabase.from('review_history').upsert({
          id: payload.id,
          user_id: payload.userId,
          vocabulary_word_id: payload.vocabularyWordId,
          question_type: payload.questionType,
          user_answer: payload.userAnswer,
          is_correct: payload.isCorrect,
          rating: payload.rating,
          reviewed_at: payload.reviewedAt,
        })
        if (error) throw error
      } else if (item.table === 'collections') {
        const payload = item.payload
        const { error } = await supabase.from('collections').upsert({
          id: payload.id,
          user_id: payload.userId,
          name: payload.name,
          description: payload.description,
          created_at: payload.createdAt,
          updated_at: payload.updatedAt,
        })
        if (error) throw error
      } else if (item.table === 'collection_words') {
        const { error } = await supabase.from('collection_words').upsert({
          collection_id: item.payload.collectionId,
          vocabulary_word_id: item.payload.vocabularyWordId,
        })
        if (error) throw error
      } else if (item.table === 'user_settings') {
        const payload = item.payload
        const { error } = await supabase.from('user_settings').upsert({
          user_id: payload.userId,
          theme: payload.theme,
          daily_goal: payload.dailyGoal,
          preferred_language: payload.preferredLanguage,
          pronunciation_accent: payload.pronunciationAccent,
          created_at: payload.createdAt,
          updated_at: payload.updatedAt,
        })
        if (error) throw error
      }
      await db.outbox.delete(item.id)
    }

    const userId = getMemorySession()?.userId
    if (!userId) {
      setStatus('synced')
      return
    }

    const { data: remoteWords, error: wordsError } = await supabase
      .from('vocabulary_words')
      .select('*')
      .eq('user_id', userId)
    if (wordsError) throw wordsError
    for (const row of remoteWords ?? []) {
      const mapped = mapWord(row as Record<string, unknown>)
      const local = await db.words.get(mapped.id)
      if (!local || newer(local.updatedAt, mapped.updatedAt)) {
        await db.words.put(mapped)
      }
    }

    const { data: remoteProgress, error: progressError } = await supabase
      .from('review_progress')
      .select('*')
      .eq('user_id', userId)
    if (progressError) throw progressError
    for (const row of remoteProgress ?? []) {
      const mapped = {
        id: String(row.id),
        userId: String(row.user_id),
        vocabularyWordId: String(row.vocabulary_word_id),
        reviewCount: Number(row.review_count ?? 0),
        difficulty: Number(row.difficulty ?? 0),
        stability: Number(row.stability ?? 0),
        lastReviewedAt: row.last_reviewed_at ? String(row.last_reviewed_at) : undefined,
        nextReviewAt: String(row.next_review_at),
        learningStatus: row.learning_status,
        fsrsCard: (row.fsrs_card as Record<string, unknown>) ?? {},
        consecutiveCorrect: Number(row.consecutive_correct ?? 0),
        updatedAt: String(row.updated_at),
      }
      const local = await db.reviewProgress.get(mapped.id)
      if (!local || newer(local.updatedAt, mapped.updatedAt)) {
        await db.reviewProgress.put(mapped)
      }
    }

    const { data: remoteHistory, error: historyError } = await supabase
      .from('review_history')
      .select('*')
      .eq('user_id', userId)
    if (historyError) throw historyError
    for (const row of remoteHistory ?? []) {
      const mapped = {
        id: String(row.id),
        userId: String(row.user_id),
        vocabularyWordId: String(row.vocabulary_word_id),
        questionType: row.question_type,
        userAnswer: String(row.user_answer ?? ''),
        isCorrect: Boolean(row.is_correct),
        rating: row.rating ?? undefined,
        reviewedAt: String(row.reviewed_at),
      }
      const local = await db.reviewHistory.get(mapped.id)
      if (!local) await db.reviewHistory.put(mapped)
    }

    setStatus('synced')
  } catch {
    setStatus('sync_failed')
  } finally {
    running = false
  }
}

export function startSyncListeners() {
  window.addEventListener('online', () => {
    setStatus('synchronising')
    void synchronise()
  })
  window.addEventListener('offline', () => setStatus('offline'))
  window.addEventListener('focus', () => {
    void synchronise()
  })
  void synchronise()
}
