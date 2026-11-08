import { computeDashboardStats } from '@/services/stats'
import type { ReviewHistoryEntry, ReviewProgress, UserSettings, VocabularyWord } from '@/types/vocabulary'

function makeWord(overrides: Partial<VocabularyWord> = {}): VocabularyWord {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    word: 'Test',
    normalizedWord: 'test',
    definitions: [{ partOfSpeech: 'noun', definition: 'a test word' }],
    synonyms: [],
    antonyms: [],
    collocations: [],
    expressions: [],
    examples: [],
    personalNotes: '',
    isFavourite: false,
    isDifficult: false,
    learningStatus: 'new',
    lastAccessedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeProgress(wordId: string, overrides: Partial<ReviewProgress> = {}): ReviewProgress {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    vocabularyWordId: wordId,
    reviewCount: 0,
    difficulty: 5,
    stability: 1,
    nextReviewAt: new Date().toISOString(),
    learningStatus: 'new',
    fsrsCard: {},
    consecutiveCorrect: 0,
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeSettings(overrides: Partial<UserSettings> = {}): UserSettings {
  const now = new Date().toISOString()
  return {
    userId: 'u1',
    theme: 'system',
    dailyGoal: 5,
    preferredLanguage: 'en-GB',
    pronunciationAccent: 'british',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeHistory(wordId: string, overrides: Partial<ReviewHistoryEntry> = {}): ReviewHistoryEntry {
  return {
    id: crypto.randomUUID(),
    userId: 'u1',
    vocabularyWordId: wordId,
    questionType: 'multiple_choice',
    userAnswer: 'test',
    isCorrect: true,
    reviewedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('computeDashboardStats', () => {
  const settings = makeSettings()

  it('returns zeros for an empty library', () => {
    const stats = computeDashboardStats([], [], [], settings)
    expect(stats.total).toBe(0)
    expect(stats.due).toBe(0)
    expect(stats.mastered).toBe(0)
    expect(stats.learnedToday).toBe(0)
    expect(stats.reviewedToday).toBe(0)
    expect(stats.streak).toBe(0)
    expect(stats.wordOfTheDay).toBeUndefined()
  })

  it('counts total words correctly', () => {
    const words = [makeWord(), makeWord(), makeWord()]
    const stats = computeDashboardStats(words, [], [], settings)
    expect(stats.total).toBe(3)
  })

  it('counts mastered words', () => {
    const words = [
      makeWord({ learningStatus: 'mastered' }),
      makeWord({ learningStatus: 'mastered' }),
      makeWord({ learningStatus: 'new' }),
    ]
    const stats = computeDashboardStats(words, [], [], settings)
    expect(stats.mastered).toBe(2)
  })

  it('counts words learned today', () => {
    const today = new Date().toISOString()
    const yesterday = new Date(Date.now() - 86_400_000).toISOString()
    const words = [
      makeWord({ createdAt: today }),
      makeWord({ createdAt: today }),
      makeWord({ createdAt: yesterday }),
    ]
    const stats = computeDashboardStats(words, [], [], settings)
    expect(stats.learnedToday).toBe(2)
  })

  it('counts due words from progress', () => {
    const word = makeWord()
    const overdue = makeProgress(word.id, {
      nextReviewAt: new Date(Date.now() - 1000).toISOString(),
    })
    const future = makeProgress(word.id, {
      nextReviewAt: new Date(Date.now() + 86_400_000).toISOString(),
    })
    const stats1 = computeDashboardStats([word], [overdue], [], settings)
    expect(stats1.due).toBe(1)
    const stats2 = computeDashboardStats([word], [future], [], settings)
    expect(stats2.due).toBe(0)
  })

  it('counts reviews done today', () => {
    const word = makeWord()
    const history = [
      makeHistory(word.id, { reviewedAt: new Date().toISOString() }),
      makeHistory(word.id, { reviewedAt: new Date().toISOString() }),
      makeHistory(word.id, { reviewedAt: new Date(Date.now() - 86_400_000).toISOString() }),
    ]
    const stats = computeDashboardStats([word], [], history, settings)
    expect(stats.reviewedToday).toBe(2)
  })

  it('calculates goal progress as a percentage', () => {
    const settings5 = makeSettings({ dailyGoal: 5 })
    const word = makeWord({ createdAt: new Date().toISOString() })
    // 1 word learned today out of daily goal 5 → 20%
    const stats = computeDashboardStats([word], [], [], settings5)
    expect(stats.goalProgress).toBe(20)
  })

  it('caps goal progress at 100%', () => {
    const settings1 = makeSettings({ dailyGoal: 1 })
    const words = [makeWord({ createdAt: new Date().toISOString() })]
    const history = [makeHistory(words[0]!.id, { reviewedAt: new Date().toISOString() })]
    const stats = computeDashboardStats(words, [], history, settings1)
    expect(stats.goalProgress).toBe(100)
  })

  it('provides weekly activity data with 7 entries', () => {
    const stats = computeDashboardStats([], [], [], settings)
    expect(stats.weekly).toHaveLength(7)
    for (const day of stats.weekly) {
      expect(day).toHaveProperty('label')
      expect(day).toHaveProperty('count')
      expect(typeof day.count).toBe('number')
    }
  })

  it('prefers a reviewing word as word of the day', () => {
    const reviewing = makeWord({ learningStatus: 'reviewing', word: 'Reviewing' })
    const learning = makeWord({ learningStatus: 'learning', word: 'Learning' })
    const stats = computeDashboardStats([learning, reviewing], [], [], settings)
    expect(stats.wordOfTheDay?.word).toBe('Reviewing')
  })

  it('falls back to learning word if no reviewing word exists', () => {
    const learning = makeWord({ learningStatus: 'learning', word: 'Learning' })
    const stats = computeDashboardStats([learning], [], [], settings)
    expect(stats.wordOfTheDay?.word).toBe('Learning')
  })
})
