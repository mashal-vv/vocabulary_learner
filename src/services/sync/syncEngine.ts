/**
 * src/services/sync/syncEngine.ts
 *
 * Cloud-first sync engine.
 *
 * Write path:
 *   1. Write to IndexedDB immediately (optimistic local update).
 *   2. Enqueue the operation in the outbox.
 *   3. If online and authenticated, flush the outbox to Supabase immediately.
 *   4. Status is 'synced' only after a successful Supabase write.
 *   5. If offline or auth missing, stay in 'offline' state; flush on reconnect.
 *
 * Read path:
 *   On unlock / reconnect, pull all Supabase data and merge into IndexedDB
 *   (remote wins if updatedAt is newer).
 */

import { db } from '@/db/database'
import { ensureValidSession, getAuthenticatedClient } from '@/services/supabase/vault'
import { isSupabaseConfigured } from '@/services/supabase/client'
import type { SyncStatus } from '@/types/vocabulary'

export type SyncListener = (status: SyncStatus) => void

const listeners = new Set<SyncListener>()
let _status: SyncStatus = navigator.onLine ? 'synced' : 'offline'
let running = false

export function getSyncStatus(): SyncStatus {
  return _status
}

export function subscribeSync(listener: SyncListener) {
  listeners.add(listener)
  listener(_status)
  return () => listeners.delete(listener)
}

function setStatus(next: SyncStatus) {
  if (_status === next) return
  _status = next
  listeners.forEach((l) => l(next))
}

// ─── Row mappers (remote → local) ────────────────────────────────────────────

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
    pronunciation: word.pronunciation ?? null,
    phonetic_transcription: word.phoneticTranscription ?? null,
    audio_url: word.audioUrl ?? null,
    part_of_speech: word.partOfSpeech ?? null,
    definitions: word.definitions,
    simple_definition: word.simpleDefinition ?? null,
    malayalam_translation: word.malayalamTranslation ?? null,
    synonyms: word.synonyms,
    antonyms: word.antonyms,
    collocations: word.collocations,
    expressions: word.expressions,
    examples: word.examples,
    real_life_usage: word.realLifeUsage ?? null,
    usage_notes: word.usageNotes ?? null,
    common_mistakes: word.commonMistakes ?? null,
    image_url: word.imageUrl ?? null,
    image_caption: word.imageCaption ?? null,
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

// ─── Outbox flush ─────────────────────────────────────────────────────────────

/**
 * Flushes the outbox to Supabase.
 * Returns true if all items were successfully synced.
 */
async function flushOutbox(): Promise<boolean> {
  const session = await ensureValidSession()
  if (!session) return false

  const supabase = getAuthenticatedClient()
  if (!supabase) return false

  const outbox = await db.outbox.orderBy('createdAt').toArray()
  if (outbox.length === 0) return true

  for (const item of outbox) {
    try {
      if (item.op === 'delete') {
        const { error } = await supabase
          .from(item.table)
          .delete()
          .eq('id', String(item.payload.id))
        if (error) throw error
      } else if (item.table === 'vocabulary_words') {
        const { error } = await supabase
          .from('vocabulary_words')
          .upsert(wordToRow(item.payload))
        if (error) throw error
      } else if (item.table === 'review_progress') {
        const p = item.payload
        const { error } = await supabase.from('review_progress').upsert({
          id: p.id,
          user_id: p.userId,
          vocabulary_word_id: p.vocabularyWordId,
          review_count: p.reviewCount,
          difficulty: p.difficulty,
          stability: p.stability,
          last_reviewed_at: p.lastReviewedAt ?? null,
          next_review_at: p.nextReviewAt,
          learning_status: p.learningStatus,
          fsrs_card: p.fsrsCard,
          consecutive_correct: p.consecutiveCorrect,
          updated_at: p.updatedAt,
        })
        if (error) throw error
      } else if (item.table === 'review_history') {
        const p = item.payload
        const { error } = await supabase.from('review_history').upsert({
          id: p.id,
          user_id: p.userId,
          vocabulary_word_id: p.vocabularyWordId,
          question_type: p.questionType,
          user_answer: p.userAnswer,
          is_correct: p.isCorrect,
          rating: p.rating ?? null,
          reviewed_at: p.reviewedAt,
        })
        if (error) throw error
      } else if (item.table === 'collections') {
        const p = item.payload
        const { error } = await supabase.from('collections').upsert({
          id: p.id,
          user_id: p.userId,
          name: p.name,
          description: p.description,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        })
        if (error) throw error
      } else if (item.table === 'collection_words') {
        const { error } = await supabase.from('collection_words').upsert({
          collection_id: item.payload.collectionId,
          vocabulary_word_id: item.payload.vocabularyWordId,
        })
        if (error) throw error
      } else if (item.table === 'user_settings') {
        const p = item.payload
        const { error } = await supabase.from('user_settings').upsert({
          user_id: p.userId,
          theme: p.theme,
          daily_goal: p.dailyGoal,
          preferred_language: p.preferredLanguage,
          pronunciation_accent: p.pronunciationAccent,
          created_at: p.createdAt,
          updated_at: p.updatedAt,
        })
        if (error) throw error
      }
      await db.outbox.delete(item.id)
    } catch (err) {
      console.warn(`[sync] Failed to flush outbox item ${item.id}:`, err)
      return false
    }
  }
  return true
}

// ─── Pull (remote → local) ────────────────────────────────────────────────────

async function pullFromRemote(): Promise<boolean> {
  const session = await ensureValidSession()
  if (!session) return false

  const supabase = getAuthenticatedClient()
  if (!supabase) return false

  const userId = session.userId

  try {
    // Pull words
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

    // Pull progress
    const { data: remoteProgress, error: progressError } = await supabase
      .from('review_progress')
      .select('*')
      .eq('user_id', userId)
    if (progressError) throw progressError
    for (const row of remoteProgress ?? []) {
      const r = row as Record<string, unknown>
      const mapped = {
        id: String(r.id),
        userId: String(r.user_id),
        vocabularyWordId: String(r.vocabulary_word_id),
        reviewCount: Number(r.review_count ?? 0),
        difficulty: Number(r.difficulty ?? 0),
        stability: Number(r.stability ?? 0),
        lastReviewedAt: r.last_reviewed_at ? String(r.last_reviewed_at) : undefined,
        nextReviewAt: String(r.next_review_at),
        learningStatus: r.learning_status,
        fsrsCard: (r.fsrs_card as Record<string, unknown>) ?? {},
        consecutiveCorrect: Number(r.consecutive_correct ?? 0),
        updatedAt: String(r.updated_at),
      }
      const local = await db.reviewProgress.get(mapped.id)
      if (!local || newer(local.updatedAt, mapped.updatedAt)) {
        await db.reviewProgress.put(mapped)
      }
    }

    // Pull history (append-only — never update existing entries)
    const { data: remoteHistory, error: historyError } = await supabase
      .from('review_history')
      .select('*')
      .eq('user_id', userId)
    if (historyError) throw historyError
    for (const row of remoteHistory ?? []) {
      const r = row as Record<string, unknown>
      const local = await db.reviewHistory.get(String(r.id))
      if (!local) {
        await db.reviewHistory.put({
          id: String(r.id),
          userId: String(r.user_id),
          vocabularyWordId: String(r.vocabulary_word_id),
          questionType: r.question_type as never,
          userAnswer: String(r.user_answer ?? ''),
          isCorrect: Boolean(r.is_correct),
          rating: r.rating ? (r.rating as never) : undefined,
          reviewedAt: String(r.reviewed_at),
        })
      }
    }

    // Pull settings
    const { data: remoteSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle()
    if (settingsError) throw settingsError
    if (remoteSettings) {
      const r = remoteSettings as Record<string, unknown>
      const local = await db.settings.get(userId)
      if (!local || newer(local.updatedAt, String(r.updated_at))) {
        await db.settings.put({
          userId: String(r.user_id),
          theme: (r.theme as 'light' | 'dark' | 'system') ?? 'system',
          dailyGoal: Number(r.daily_goal ?? 5),
          preferredLanguage: String(r.preferred_language ?? 'en-GB'),
          pronunciationAccent: (r.pronunciation_accent as 'british') ?? 'british',
          createdAt: String(r.created_at),
          updatedAt: String(r.updated_at),
        })
      }
    }

    return true
  } catch (err) {
    console.warn('[sync] Pull failed:', err)
    return false
  }
}

// ─── Migration: push local-only data to Supabase ─────────────────────────────

/**
 * On first unlock after migrating from local-only mode, push any
 * IndexedDB data that has never been synced (outbox may be empty but
 * the data exists locally).
 *
 * Detection: if Supabase has 0 vocabulary_words for this user but
 * IndexedDB has >0, we push all local words up.
 */
export async function migrateLocalDataToCloud(userId: string): Promise<void> {
  const supabase = getAuthenticatedClient()
  if (!supabase) return

  try {
    const { count, error } = await supabase
      .from('vocabulary_words')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
    if (error) return
    if ((count ?? 0) > 0) return // Already have data in cloud

    // Push all local words
    const localWords = await db.words.where('userId').equals(userId).toArray()
    if (localWords.length === 0) return

    console.info(`[sync] Migrating ${localWords.length} local words to Supabase…`)
    for (const word of localWords) {
      await supabase.from('vocabulary_words').upsert(wordToRow(word as unknown as Record<string, unknown>))
    }

    // Push all local progress
    const localProgress = await db.reviewProgress.where('userId').equals(userId).toArray()
    for (const p of localProgress) {
      await supabase.from('review_progress').upsert({
        id: p.id,
        user_id: p.userId,
        vocabulary_word_id: p.vocabularyWordId,
        review_count: p.reviewCount,
        difficulty: p.difficulty,
        stability: p.stability,
        last_reviewed_at: p.lastReviewedAt ?? null,
        next_review_at: p.nextReviewAt,
        learning_status: p.learningStatus,
        fsrs_card: p.fsrsCard,
        consecutive_correct: p.consecutiveCorrect,
        updated_at: p.updatedAt,
      })
    }

    // Push all local history
    const localHistory = await db.reviewHistory.where('userId').equals(userId).toArray()
    for (const h of localHistory) {
      await supabase.from('review_history').upsert({
        id: h.id,
        user_id: h.userId,
        vocabulary_word_id: h.vocabularyWordId,
        question_type: h.questionType,
        user_answer: h.userAnswer,
        is_correct: h.isCorrect,
        rating: h.rating ?? null,
        reviewed_at: h.reviewedAt,
      })
    }

    console.info('[sync] Migration complete.')
  } catch (err) {
    console.warn('[sync] Migration failed (non-fatal):', err)
  }
}

// ─── Main synchronise function ────────────────────────────────────────────────

/**
 * Full sync cycle: flush outbox → pull remote.
 * Sets status to 'synced' only on full success.
 */
export async function synchronise(): Promise<void> {
  if (!navigator.onLine) {
    setStatus('offline')
    return
  }
  if (!isSupabaseConfigured()) {
    setStatus('synced') // local-only mode — treat as "in sync"
    return
  }

  const session = await ensureValidSession()
  if (!session) {
    // Not authenticated — nothing to sync
    return
  }

  if (running) return
  running = true
  setStatus('synchronising')

  try {
    const flushed = await flushOutbox()
    const pulled = await pullFromRemote()
    setStatus(flushed && pulled ? 'synced' : 'sync_failed')
  } catch {
    setStatus('sync_failed')
  } finally {
    running = false
  }
}

// ─── Background listeners ─────────────────────────────────────────────────────

let listenersStarted = false

export function startSyncListeners(): void {
  if (listenersStarted) return
  listenersStarted = true

  window.addEventListener('online', () => {
    setStatus('synchronising')
    void synchronise()
  })
  window.addEventListener('offline', () => setStatus('offline'))
  window.addEventListener('focus', () => void synchronise())
}
