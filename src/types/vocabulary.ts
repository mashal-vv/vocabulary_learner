export const LEARNING_STATUSES = ['new', 'learning', 'reviewing', 'mastered'] as const
export type LearningStatus = (typeof LEARNING_STATUSES)[number]

export type WordDefinition = {
  partOfSpeech: string
  definition: string
  example?: string
}

export type WordExample = {
  sentence: string
  context?: string
}

export type VocabularyWord = {
  id: string
  userId: string
  word: string
  normalizedWord: string
  pronunciation?: string
  phoneticTranscription?: string
  audioUrl?: string
  partOfSpeech?: string
  definitions: WordDefinition[]
  simpleDefinition?: string
  malayalamTranslation?: string
  synonyms: string[]
  antonyms: string[]
  collocations: string[]
  expressions: string[]
  examples: WordExample[]
  realLifeUsage?: string
  usageNotes?: string
  commonMistakes?: string
  imageUrl?: string
  imageCaption?: string
  personalNotes: string
  isFavourite: boolean
  isDifficult: boolean
  learningStatus: LearningStatus
  lastAccessedAt: string
  createdAt: string
  updatedAt: string
}

export type ReviewProgress = {
  id: string
  userId: string
  vocabularyWordId: string
  reviewCount: number
  difficulty: number
  stability: number
  lastReviewedAt?: string
  nextReviewAt: string
  learningStatus: LearningStatus
  fsrsCard: Record<string, unknown>
  consecutiveCorrect: number
  updatedAt: string
}

export type QuestionType = 'multiple_choice' | 'type_meaning' | 'fill_blank'

export const RATINGS = ['again', 'hard', 'good', 'easy'] as const
export type ReviewRating = (typeof RATINGS)[number]

export type ReviewHistoryEntry = {
  id: string
  userId: string
  vocabularyWordId: string
  questionType: QuestionType
  userAnswer: string
  isCorrect: boolean
  rating?: ReviewRating
  reviewedAt: string
}

export type Collection = {
  id: string
  userId: string
  name: string
  description: string
  createdAt: string
  updatedAt: string
}

export type CollectionWord = {
  collectionId: string
  vocabularyWordId: string
}

export type UserSettings = {
  userId: string
  theme: 'light' | 'dark' | 'system'
  dailyGoal: number
  preferredLanguage: string
  pronunciationAccent: 'british'
  createdAt: string
  updatedAt: string
}

export type OutboxItem = {
  id: string
  table:
    | 'vocabulary_words'
    | 'review_progress'
    | 'review_history'
    | 'collections'
    | 'collection_words'
    | 'user_settings'
  op: 'upsert' | 'delete'
  payload: Record<string, unknown>
  createdAt: string
}

export type VaultMeta = {
  key: string
  value: string
}

export type SyncStatus = 'synced' | 'synchronising' | 'offline' | 'sync_failed'
