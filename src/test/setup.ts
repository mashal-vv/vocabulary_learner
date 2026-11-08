/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'
import Dexie from 'dexie'
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'

// Give every test its own isolated, empty IndexedDB.
//
// fake-indexeddb/auto (listed first in vite.config.ts setupFiles) patches
// globalThis.indexedDB at load time so Dexie's module-level constructor
// (`export const db = new LexiconDB()`) succeeds.
//
// Between tests we clear all object stores so no data leaks between tests.
// This avoids the complexity of re-binding Dexie's singleton to a new
// IDBFactory (which is unreliable when module caching is involved).

// Inject fake-indexeddb into Dexie shims once so the initial open works.
Dexie.dependencies.indexedDB = globalThis.indexedDB as IDBFactory
Dexie.dependencies.IDBKeyRange = IDBKeyRange

beforeEach(async () => {
  const { db } = await import('@/db/database')
  if (!db.isOpen()) await db.open()

  // Clear all stores to give each test a clean slate.
  await db.transaction(
    'rw',
    [
      db.words,
      db.reviewProgress,
      db.reviewHistory,
      db.collections,
      db.collectionWords,
      db.settings,
      db.outbox,
      db.vaultMeta,
    ],
    async () => {
      await db.words.clear()
      await db.reviewProgress.clear()
      await db.reviewHistory.clear()
      await db.collections.clear()
      await db.collectionWords.clear()
      await db.settings.clear()
      await db.outbox.clear()
      await db.vaultMeta.clear()
    },
  )
})
