'use client';

import React, { createContext, useContext, useRef, useCallback, useSyncExternalStore } from 'react';

// Types for the data stored in context
export interface TranslationData {
    translatedText: string;
    originalText: string;
    error?: string;
}

export interface NoteData {
    content: string;
    height?: number;
}

export interface BookmarkData {
    colorGroupId: string;
}

export interface BookmarkGroupData {
    name: string;
    color: string;
}

// Store class that manages subscriptions for efficient updates
class ReaderDataStore {
    private translationMap = new Map<string, TranslationData>();
    private translationErrorMap = new Map<string, string>();
    private noteMap = new Map<string, NoteData>();
    private bookmarkMap = new Map<string, BookmarkData>();
    private chatMap = new Map<string, boolean>();
    private bookmarkGroupMap = new Map<string, BookmarkGroupData>();
    private activeParagraphHash: string | null = null;
    
    // Subscribers for each data type
    private translationSubscribers = new Map<string, Set<() => void>>();
    private noteSubscribers = new Map<string, Set<() => void>>();
    private bookmarkSubscribers = new Map<string, Set<() => void>>();
    private chatSubscribers = new Map<string, Set<() => void>>();
    private activeParagraphSubscribers = new Set<() => void>();
    private bookmarkGroupSubscribers = new Set<() => void>();
    
    // Version counters for global updates
    private notesVersion = 0;
    private bookmarksVersion = 0;

    // Initialize with data from database
    initializeData(data: {
        translations: Map<string, TranslationData>;
        notes: Map<string, NoteData>;
        bookmarks: Map<string, BookmarkData>;
        chats: Map<string, boolean>;
        bookmarkGroups: Map<string, BookmarkGroupData>;
    }) {
        this.translationMap = new Map(data.translations);
        this.noteMap = new Map(data.notes);
        this.bookmarkMap = new Map(data.bookmarks);
        this.chatMap = new Map(data.chats);
        this.bookmarkGroupMap = new Map(data.bookmarkGroups);
        
        // Notify all subscribers
        this.notifyAllTranslationSubscribers();
        this.notifyAllNoteSubscribers();
        this.notifyAllBookmarkSubscribers();
        this.notifyAllChatSubscribers();
        this.notifyBookmarkGroupSubscribers();
    }

    // Translation methods
    getTranslation(hash: string): TranslationData | undefined {
        return this.translationMap.get(hash);
    }

    setTranslation(hash: string, data: TranslationData | null) {
        if (data) {
            this.translationMap.set(hash, data);
        } else {
            this.translationMap.delete(hash);
        }
        this.notifySubscribers(this.translationSubscribers, hash);
    }

    getTranslationError(hash: string): string | undefined {
        return this.translationErrorMap.get(hash);
    }

    setTranslationError(hash: string, error: string | null) {
        if (error) {
            this.translationErrorMap.set(hash, error);
        } else {
            this.translationErrorMap.delete(hash);
        }
        this.notifySubscribers(this.translationSubscribers, hash);
    }

    subscribeToTranslation(hash: string, callback: () => void) {
        if (!this.translationSubscribers.has(hash)) {
            this.translationSubscribers.set(hash, new Set());
        }
        this.translationSubscribers.get(hash)!.add(callback);
        return () => {
            this.translationSubscribers.get(hash)?.delete(callback);
        };
    }

    // Note methods
    getNote(hash: string): NoteData | undefined {
        return this.noteMap.get(hash);
    }

    setNote(hash: string, data: NoteData | null) {
        if (data) {
            this.noteMap.set(hash, data);
        } else {
            this.noteMap.delete(hash);
        }
        this.notesVersion++;
        this.notifySubscribers(this.noteSubscribers, hash);
    }

    getNotesVersion(): number {
        return this.notesVersion;
    }

    subscribeToNote(hash: string, callback: () => void) {
        if (!this.noteSubscribers.has(hash)) {
            this.noteSubscribers.set(hash, new Set());
        }
        this.noteSubscribers.get(hash)!.add(callback);
        return () => {
            this.noteSubscribers.get(hash)?.delete(callback);
        };
    }

    // Bookmark methods
    getBookmark(hash: string): BookmarkData | undefined {
        return this.bookmarkMap.get(hash);
    }

    setBookmark(hash: string, data: BookmarkData | null) {
        if (data) {
            this.bookmarkMap.set(hash, data);
        } else {
            this.bookmarkMap.delete(hash);
        }
        this.bookmarksVersion++;
        this.notifySubscribers(this.bookmarkSubscribers, hash);
    }

    getBookmarksVersion(): number {
        return this.bookmarksVersion;
    }

    getAllBookmarks(): Map<string, BookmarkData> {
        // Return stable reference
        return this.bookmarkMap;
    }

    subscribeToBookmark(hash: string, callback: () => void) {
        if (!this.bookmarkSubscribers.has(hash)) {
            this.bookmarkSubscribers.set(hash, new Set());
        }
        this.bookmarkSubscribers.get(hash)!.add(callback);
        return () => {
            this.bookmarkSubscribers.get(hash)?.delete(callback);
        };
    }

    // Chat methods
    hasChat(threadId: string): boolean {
        return this.chatMap.has(threadId);
    }

    setChat(threadId: string, hasChat: boolean) {
        if (hasChat) {
            this.chatMap.set(threadId, true);
        } else {
            this.chatMap.delete(threadId);
        }
        this.notifySubscribers(this.chatSubscribers, threadId);
    }

    subscribeToChat(threadId: string, callback: () => void) {
        if (!this.chatSubscribers.has(threadId)) {
            this.chatSubscribers.set(threadId, new Set());
        }
        this.chatSubscribers.get(threadId)!.add(callback);
        return () => {
            this.chatSubscribers.get(threadId)?.delete(callback);
        };
    }

    // Active paragraph methods
    getActiveParagraphHash(): string | null {
        return this.activeParagraphHash;
    }

    setActiveParagraphHash(hash: string | null) {
        this.activeParagraphHash = hash;
        this.activeParagraphSubscribers.forEach(cb => cb());
    }

    subscribeToActiveParagraph(callback: () => void) {
        this.activeParagraphSubscribers.add(callback);
        return () => {
            this.activeParagraphSubscribers.delete(callback);
        };
    }

    // Bookmark group methods
    getBookmarkGroup(id: string): BookmarkGroupData | undefined {
        return this.bookmarkGroupMap.get(id);
    }

    getAllBookmarkGroups(): Map<string, BookmarkGroupData> {
        // Return the actual map instance (stable reference)
        // It will only change when setBookmarkGroups is called
        return this.bookmarkGroupMap;
    }

    setBookmarkGroups(groups: Map<string, BookmarkGroupData>) {
        this.bookmarkGroupMap = new Map(groups);
        this.notifyBookmarkGroupSubscribers();
    }

    subscribeToBookmarkGroups(callback: () => void) {
        this.bookmarkGroupSubscribers.add(callback);
        return () => {
            this.bookmarkGroupSubscribers.delete(callback);
        };
    }

    // Helper methods for notifying subscribers
    private notifySubscribers(subscriberMap: Map<string, Set<() => void>>, key: string) {
        subscriberMap.get(key)?.forEach(cb => cb());
    }

    private notifyAllTranslationSubscribers() {
        this.translationSubscribers.forEach(subscribers => {
            subscribers.forEach(cb => cb());
        });
    }

    private notifyAllNoteSubscribers() {
        this.noteSubscribers.forEach(subscribers => {
            subscribers.forEach(cb => cb());
        });
    }

    private notifyAllBookmarkSubscribers() {
        this.bookmarkSubscribers.forEach(subscribers => {
            subscribers.forEach(cb => cb());
        });
    }

    private notifyAllChatSubscribers() {
        this.chatSubscribers.forEach(subscribers => {
            subscribers.forEach(cb => cb());
        });
    }

    private notifyBookmarkGroupSubscribers() {
        this.bookmarkGroupSubscribers.forEach(cb => cb());
    }
}

// Create context
const ReaderDataContext = createContext<ReaderDataStore | null>(null);

// Provider component
export function ReaderDataProvider({ children }: { children: React.ReactNode }) {
    const storeRef = useRef<ReaderDataStore | null>(null);
    
    if (!storeRef.current) {
        storeRef.current = new ReaderDataStore();
    }

    return (
        <ReaderDataContext.Provider value={storeRef.current}>
            {children}
        </ReaderDataContext.Provider>
    );
}

// Hook to get the store instance
export function useReaderDataStore(): ReaderDataStore {
    const store = useContext(ReaderDataContext);
    if (!store) {
        throw new Error('useReaderDataStore must be used within a ReaderDataProvider');
    }
    return store;
}

// Hooks for subscribing to specific data with useSyncExternalStore pattern
export function useTranslation(hash: string): TranslationData | undefined {
    const store = useReaderDataStore();
    
    const subscribe = useCallback(
        (callback: () => void) => store.subscribeToTranslation(hash, callback),
        [store, hash]
    );
    
    const getSnapshot = useCallback(
        () => store.getTranslation(hash),
        [store, hash]
    );
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useTranslationError(hash: string): string | undefined {
    const store = useReaderDataStore();
    
    const subscribe = useCallback(
        (callback: () => void) => store.subscribeToTranslation(hash, callback),
        [store, hash]
    );
    
    const getSnapshot = useCallback(
        () => store.getTranslationError(hash),
        [store, hash]
    );
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNote(hash: string): NoteData | undefined {
    const store = useReaderDataStore();
    
    const subscribe = useCallback(
        (callback: () => void) => store.subscribeToNote(hash, callback),
        [store, hash]
    );
    
    const getSnapshot = useCallback(
        () => store.getNote(hash),
        [store, hash]
    );
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useBookmark(hash: string): BookmarkData | undefined {
    const store = useReaderDataStore();
    
    const subscribe = useCallback(
        (callback: () => void) => store.subscribeToBookmark(hash, callback),
        [store, hash]
    );
    
    const getSnapshot = useCallback(
        () => store.getBookmark(hash),
        [store, hash]
    );
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useHasChat(threadId: string): boolean {
    const store = useReaderDataStore();
    
    const subscribe = useCallback(
        (callback: () => void) => store.subscribeToChat(threadId, callback),
        [store, threadId]
    );
    
    const getSnapshot = useCallback(
        () => store.hasChat(threadId),
        [store, threadId]
    );
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useActiveParagraphHash(): string | null {
    const store = useReaderDataStore();
    
    const subscribe = useCallback(
        (callback: () => void) => store.subscribeToActiveParagraph(callback),
        [store]
    );
    
    const getSnapshot = useCallback(
        () => store.getActiveParagraphHash(),
        [store]
    );
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useBookmarkGroups(): Map<string, BookmarkGroupData> {
    const store = useReaderDataStore();
    
    const subscribe = useCallback(
        (callback: () => void) => store.subscribeToBookmarkGroups(callback),
        [store]
    );
    
    const getSnapshot = useCallback(
        () => store.getAllBookmarkGroups(),
        [store]
    );
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useBookmarkGroup(id: string): BookmarkGroupData | undefined {
    const store = useReaderDataStore();
    
    const subscribe = useCallback(
        (callback: () => void) => store.subscribeToBookmarkGroups(callback),
        [store]
    );
    
    const getSnapshot = useCallback(
        () => store.getBookmarkGroup(id),
        [store, id]
    );
    
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

