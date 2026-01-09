import Dexie, { type EntityTable } from 'dexie';

interface Book {
  id: string; // UUID
  title: string;
  data: ArrayBuffer;
  addedAt: number;
  coverImage?: string; // Base64 data URL of cover image
  sourceLanguage?: string; // ISO 639-1 code (e.g., 'ja', 'en', 'ru')
}

interface WebConfig {
  key: string;
  value: string;
}

interface Progress {
  bookId: string;
  scrollPosition: number; // scroll percentage 0-100
  sectionIndex?: number; // Index of section containing saved position
  scrollOffset?: number; // Absolute scroll position in pixels
  paragraphHash?: string; // Hash of paragraph at saved position for precise restoration
  updatedAt: number;
}

interface DictionaryEntry {
  id?: number;
  kanji: string;
  reading: string;
  definitions: string[];
  tags: string[];
}

interface Translation {
  id: string; // bookId + paragraphHash
  bookId: string;
  paragraphHash: string; // hash of original text
  originalText: string;
  translatedText: string;
  createdAt: number;
}

interface Note {
  id: string; // bookId + paragraphHash
  bookId: string;
  paragraphHash: string;
  content: string;
  height?: number; // Height in pixels for resizable notes
  createdAt: number;
  updatedAt: number;
}

interface ChatMessage {
  id: string; // auto-generated UUID
  threadId: string; // bookId + '|' + paragraphHash
  bookId: string;
  paragraphHash: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

interface BookmarkGroup {
  id: string; // UUID
  name: string; // user-editable name
  color: string; // hex color code
  order: number; // display order
  createdAt: number;
  updatedAt: number;
}

interface Bookmark {
  id: string; // bookId + paragraphHash
  bookId: string;
  paragraphHash: string;
  colorGroupId: string; // references bookmarkGroups.id
  createdAt: number;
  updatedAt: number;
}

const db = new Dexie('EnsoReadDB') as Dexie & {
  books: EntityTable<Book, 'id'>;
  progress: EntityTable<Progress, 'bookId'>;
  settings: EntityTable<WebConfig, 'key'>;
  dictionary: EntityTable<DictionaryEntry, 'id'>;
  translations: EntityTable<Translation, 'id'>;
  notes: EntityTable<Note, 'id'>;
  chats: EntityTable<ChatMessage, 'id'>;
  bookmarkGroups: EntityTable<BookmarkGroup, 'id'>;
  bookmarks: EntityTable<Bookmark, 'id'>;
};

// Schema declaration
db.version(2).stores({
  books: 'id, title, addedAt',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags'
});

db.version(3).stores({
  books: 'id, title, addedAt',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt'
});

db.version(4).stores({
  books: 'id, title, addedAt',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt',
  notes: 'id, bookId, paragraphHash, updatedAt'
});

db.version(5).stores({
  books: 'id, title, addedAt',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt',
  notes: 'id, bookId, paragraphHash, updatedAt'
}).upgrade(async (tx) => {
  // Migration: add sourceLanguage field to existing books (will be undefined, can be set later)
  // No data migration needed as it's an optional field
});

db.version(6).stores({
  books: 'id, title, addedAt, sourceLanguage',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt',
  notes: 'id, bookId, paragraphHash, updatedAt',
  chats: 'id, threadId, bookId, paragraphHash, createdAt'
});

db.version(7).stores({
  books: 'id, title, addedAt, sourceLanguage',
  progress: 'bookId, updatedAt',
  settings: 'key',
  dictionary: '++id, kanji, reading, *tags',
  translations: 'id, bookId, paragraphHash, createdAt',
  notes: 'id, bookId, paragraphHash, updatedAt',
  chats: 'id, threadId, bookId, paragraphHash, createdAt',
  bookmarkGroups: 'id, order',
  bookmarks: 'id, bookId, paragraphHash, colorGroupId'
}).upgrade(async (tx) => {
  // Initialize default bookmark groups if they don't exist
  const existingGroups = await tx.table('bookmarkGroups').count();
  if (existingGroups === 0) {
    const { v4: uuidv4 } = await import('uuid');
    const defaultGroups: BookmarkGroup[] = [
      { id: uuidv4(), name: 'Group 1', color: '#3b82f6', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
      { id: uuidv4(), name: 'Group 2', color: '#10b981', order: 1, createdAt: Date.now(), updatedAt: Date.now() },
      { id: uuidv4(), name: 'Group 3', color: '#f59e0b', order: 2, createdAt: Date.now(), updatedAt: Date.now() },
      { id: uuidv4(), name: 'Group 4', color: '#ef4444', order: 3, createdAt: Date.now(), updatedAt: Date.now() },
      { id: uuidv4(), name: 'Group 5', color: '#8b5cf6', order: 4, createdAt: Date.now(), updatedAt: Date.now() },
    ];
    await tx.table('bookmarkGroups').bulkAdd(defaultGroups);
  }
});

// Initialize default bookmark groups on first load (if not already done)
export async function initializeBookmarkGroups(): Promise<void> {
  const count = await db.bookmarkGroups.count();
  if (count === 0) {
    const { v4: uuidv4 } = await import('uuid');
    const defaultGroups: BookmarkGroup[] = [
      { id: uuidv4(), name: 'Group 1', color: '#3b82f6', order: 0, createdAt: Date.now(), updatedAt: Date.now() },
      { id: uuidv4(), name: 'Group 2', color: '#10b981', order: 1, createdAt: Date.now(), updatedAt: Date.now() },
      { id: uuidv4(), name: 'Group 3', color: '#f59e0b', order: 2, createdAt: Date.now(), updatedAt: Date.now() },
      { id: uuidv4(), name: 'Group 4', color: '#ef4444', order: 3, createdAt: Date.now(), updatedAt: Date.now() },
      { id: uuidv4(), name: 'Group 5', color: '#8b5cf6', order: 4, createdAt: Date.now(), updatedAt: Date.now() },
    ];
    await db.bookmarkGroups.bulkAdd(defaultGroups);
  }
}

export type { Book, Progress, WebConfig, DictionaryEntry, Translation, Note, ChatMessage, BookmarkGroup, Bookmark };
export { db };
