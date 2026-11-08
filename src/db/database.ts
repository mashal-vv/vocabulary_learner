import Dexie, { type EntityTable } from 'dexie'
import type {
  Collection,
  CollectionWord,
  OutboxItem,
  ReviewHistoryEntry,
  ReviewProgress,
  UserSettings,
  VaultMeta,
  VocabularyWord,
} from '@/types/vocabulary'

export class LexiconDB extends Dexie {
  words!: EntityTable<VocabularyWord, 'id'>
  reviewProgress!: EntityTable<ReviewProgress, 'id'>
  reviewHistory!: EntityTable<ReviewHistoryEntry, 'id'>
  collections!: EntityTable<Collection, 'id'>
  collectionWords!: EntityTable<CollectionWord, 'collectionId'>
  settings!: EntityTable<UserSettings, 'userId'>
  outbox!: EntityTable<OutboxItem, 'id'>
  vaultMeta!: EntityTable<VaultMeta, 'key'>

  constructor() {
    super('lexicon')
    this.version(1).stores({
      words: 'id, userId, normalizedWord, createdAt, updatedAt, learningStatus, isFavourite, isDifficult, lastAccessedAt',
      reviewProgress: 'id, userId, vocabularyWordId, nextReviewAt, learningStatus, updatedAt',
      reviewHistory: 'id, userId, vocabularyWordId, reviewedAt',
      collections: 'id, userId, name, createdAt',
      collectionWords: '[collectionId+vocabularyWordId], collectionId, vocabularyWordId',
      settings: 'userId',
      outbox: 'id, table, createdAt',
      vaultMeta: 'key',
    })
    // v2: add compound index on words for userId+normalizedWord lookups
    this.version(2).stores({
      words: 'id, userId, normalizedWord, [userId+normalizedWord], createdAt, updatedAt, learningStatus, isFavourite, isDifficult, lastAccessedAt',
    })
  }
}

export const db = new LexiconDB()
