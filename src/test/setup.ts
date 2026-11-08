/// <reference types="vitest/globals" />
import '@testing-library/jest-dom'
import { IDBFactory } from 'fake-indexeddb'

// Give every test a fresh, isolated IndexedDB
beforeEach(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    writable: true,
    configurable: true,
  })
})
