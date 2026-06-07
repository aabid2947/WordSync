import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { NgramRow, SessionRow, WordRow, WordSource } from './types';

export interface WordSyncDB extends DBSchema {
  words: {
    key: string;
    value: WordRow;
    indexes: { 'by-count': number; 'by-lastSeen': number; 'by-source': WordSource };
  };
  ngrams: {
    key: [string, string];
    value: NgramRow;
    indexes: { 'by-context': string; 'by-count': number };
  };
  sessions: {
    key: string;
    value: SessionRow;
    indexes: { 'by-startedAt': number };
  };
}

const DB_NAME = 'wordsync';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<WordSyncDB>> | null = null;

/** Lazily open (and cache) the single DB connection. */
export function getDB(): Promise<IDBPDatabase<WordSyncDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WordSyncDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const words = db.createObjectStore('words', { keyPath: 'word' });
        words.createIndex('by-count', 'count');
        words.createIndex('by-lastSeen', 'lastSeen');
        words.createIndex('by-source', 'source');

        const ngrams = db.createObjectStore('ngrams', { keyPath: ['context', 'next'] });
        ngrams.createIndex('by-context', 'context');
        ngrams.createIndex('by-count', 'count');

        const sessions = db.createObjectStore('sessions', { keyPath: 'sessionId' });
        sessions.createIndex('by-startedAt', 'startedAt');
      },
    });
  }
  return dbPromise;
}

/** Wipe all user data (options-page "reset" + uninstall hygiene). */
export async function clearAll(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['words', 'ngrams', 'sessions'], 'readwrite');
  await Promise.all([
    tx.objectStore('words').clear(),
    tx.objectStore('ngrams').clear(),
    tx.objectStore('sessions').clear(),
  ]);
  await tx.done;
}

/** Test-only: close and delete the DB so each test starts clean. */
export async function __resetDBForTests(): Promise<void> {
  if (dbPromise) {
    (await dbPromise).close();
    dbPromise = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
