import { db } from '@/db/database'
import {
  applyReview,
  defaultSettings,
  deleteWord,
  dueWords,
  listProgress,
  listWords,
  saveSearchedWord,
  updateSettings,
  updateWord,
} from '@/services/vocabulary/repository'
import type { VocabularyWord } from '@/types/vocabulary'

const USER_ID = 'test-user-123'

function wordPayload(overrides: Partial<Omit<VocabularyWord, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'learningStatus' | 'personalNotes' | 'isFavourite' | 'isDifficult'>> = {}) {
  return {
    word: 'Ephemeral',
    normalizedWord: 'ephemeral',
    definitions: [{ partOfSpeech: 'adjective', definition: 'lasting a short time' }],
    simpleDefinition: 'short-lived',
    synonyms: ['transient'],
    antonyms: ['permanent'],
    collocations: [],
    expressions: [],
    examples: [{ sentence: 'The ephemeral joy of the moment.' }],
    ...overrides,
  }
}

describe('repository', () => {
  // fake-indexeddb is reset in setup.ts before each test

  describe('defaultSettings', () => {
    it('creates settings for a new user', async () => {
      const settings = await defaultSettings(USER_ID)
      expect(settings.userId).toBe(USER_ID)
      expect(settings.dailyGoal).toBe(5)
      expect(settings.theme).toBe('system')
    })

    it('returns existing settings without overwriting them', async () => {
      await defaultSettings(USER_ID)
      await updateSettings(USER_ID, { dailyGoal: 10 })
      const settings = await defaultSettings(USER_ID)
      expect(settings.dailyGoal).toBe(10)
    })
  })

  describe('updateSettings', () => {
    it('patches only the provided fields', async () => {
      await defaultSettings(USER_ID)
      const updated = await updateSettings(USER_ID, { dailyGoal: 15 })
      expect(updated.dailyGoal).toBe(15)
      expect(updated.theme).toBe('system')
    })
  })

  describe('saveSearchedWord', () => {
    it('creates a new word on first save', async () => {
      const { word, created } = await saveSearchedWord(USER_ID, wordPayload())
      expect(created).toBe(true)
      expect(word.word).toBe('Ephemeral')
      expect(word.userId).toBe(USER_ID)
      expect(word.learningStatus).toBe('new')
    })

    it('creates matching review progress for a new word', async () => {
      const { word } = await saveSearchedWord(USER_ID, wordPayload())
      const progress = await listProgress(USER_ID)
      expect(progress.some((p) => p.vocabularyWordId === word.id)).toBe(true)
    })

    it('updates an existing word without changing user data', async () => {
      await saveSearchedWord(USER_ID, wordPayload())
      // Mark as favourite before re-saving
      const words = await listWords(USER_ID)
      await updateWord(words[0]!.id, { isFavourite: true, personalNotes: 'My notes' })

      const { word, created } = await saveSearchedWord(USER_ID, wordPayload({
        simpleDefinition: 'Updated definition',
      }))
      expect(created).toBe(false)
      expect(word.isFavourite).toBe(true)
      expect(word.personalNotes).toBe('My notes')
      expect(word.simpleDefinition).toBe('Updated definition')
    })
  })

  describe('updateWord', () => {
    it('patches a word without changing immutable fields', async () => {
      const { word } = await saveSearchedWord(USER_ID, wordPayload())
      const updated = await updateWord(word.id, { isFavourite: true })
      expect(updated?.isFavourite).toBe(true)
      expect(updated?.id).toBe(word.id)
      expect(updated?.userId).toBe(USER_ID)
    })

    it('returns null for a non-existent word id', async () => {
      const result = await updateWord('does-not-exist', { isFavourite: true })
      expect(result).toBeNull()
    })
  })

  describe('deleteWord', () => {
    it('removes the word, its progress, and its history', async () => {
      const { word } = await saveSearchedWord(USER_ID, wordPayload())
      // Apply a review to create history
      await applyReview({
        word,
        rating: 'good',
        questionType: 'multiple_choice',
        userAnswer: 'short-lived',
        isCorrect: true,
      })

      await deleteWord(word.id)

      const words = await listWords(USER_ID)
      expect(words.some((w) => w.id === word.id)).toBe(false)

      const progress = await listProgress(USER_ID)
      expect(progress.some((p) => p.vocabularyWordId === word.id)).toBe(false)

      const history = await db.reviewHistory.where('vocabularyWordId').equals(word.id).toArray()
      expect(history).toHaveLength(0)
    })
  })

  describe('applyReview', () => {
    it('updates progress after a review', async () => {
      const { word } = await saveSearchedWord(USER_ID, wordPayload())
      const { progress } = await applyReview({
        word,
        rating: 'good',
        questionType: 'multiple_choice',
        userAnswer: 'short-lived',
        isCorrect: true,
      })
      expect(progress.reviewCount).toBeGreaterThan(0)
      expect(progress.consecutiveCorrect).toBe(1)
    })

    it('resets consecutiveCorrect on an incorrect answer', async () => {
      const { word } = await saveSearchedWord(USER_ID, wordPayload())
      // First review — correct
      const { progress: p1 } = await applyReview({
        word,
        rating: 'good',
        questionType: 'multiple_choice',
        userAnswer: 'short-lived',
        isCorrect: true,
      })
      expect(p1.consecutiveCorrect).toBe(1)

      // Reload word (learningStatus may have changed)
      const words = await listWords(USER_ID)
      const latestWord = words.find((w) => w.id === word.id)!

      // Second review — incorrect
      const { progress: p2 } = await applyReview({
        word: latestWord,
        rating: 'again',
        questionType: 'type_meaning',
        userAnswer: 'wrong answer',
        isCorrect: false,
      })
      expect(p2.consecutiveCorrect).toBe(0)
    })

    it('writes a history entry', async () => {
      const { word } = await saveSearchedWord(USER_ID, wordPayload())
      await applyReview({
        word,
        rating: 'hard',
        questionType: 'fill_blank',
        userAnswer: 'ephemeral',
        isCorrect: true,
      })
      const history = await db.reviewHistory.where('vocabularyWordId').equals(word.id).toArray()
      expect(history).toHaveLength(1)
      expect(history[0]?.rating).toBe('hard')
      expect(history[0]?.isCorrect).toBe(true)
    })
  })

  describe('dueWords', () => {
    it('returns words whose next review date is in the past', async () => {
      const { word: w1 } = await saveSearchedWord(USER_ID, wordPayload())
      const { word: w2 } = await saveSearchedWord(USER_ID, wordPayload({
        word: 'Loquacious',
        normalizedWord: 'loquacious',
      }))

      const allProgress = await listProgress(USER_ID)
      const allWords = await listWords(USER_ID)

      // Override nextReviewAt so w1 is due and w2 is not
      const p1 = allProgress.find((p) => p.vocabularyWordId === w1.id)!
      const p2 = allProgress.find((p) => p.vocabularyWordId === w2.id)!
      await db.reviewProgress.put({
        ...p1,
        nextReviewAt: new Date(Date.now() - 1000).toISOString(),
      })
      await db.reviewProgress.put({
        ...p2,
        nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
      })

      const updatedProgress = await listProgress(USER_ID)
      const due = dueWords(allWords, updatedProgress)
      expect(due.map((w) => w.id)).toContain(w1.id)
      expect(due.map((w) => w.id)).not.toContain(w2.id)
    })
  })
})
