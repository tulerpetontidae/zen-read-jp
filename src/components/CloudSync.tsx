'use client';

import { useEffect, useState } from 'react';
import { useObservable } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { exportDatabase, downloadExport } from '@/lib/dbExport';

export function CloudSync() {
  const user = useObservable(db.cloud?.currentUser);
  const syncState = useObservable(db.cloud?.syncState);
  const [error, setError] = useState<string | null>(null);
  const [showLoginWarning, setShowLoginWarning] = useState(false);
  const [hasLocalData, setHasLocalData] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Access sync state properties correctly
  const isOnline = syncState ? (syncState as any).isOnline !== false : false;
  const isSyncing = syncState ? (syncState as any).isProcessing === true : false;
  const lastSyncTime = syncState ? (syncState as any).lastSyncTime : null;

  // Check if user has local data when component mounts
  useEffect(() => {
    const checkLocalData = async () => {
      if (!db.cloud) return;
      const isLoggedIn = (user as any)?.isLoggedIn;
      
      // Only check if not logged in
      if (!isLoggedIn) {
        const [booksCount, translationsCount, notesCount] = await Promise.all([
          db.books.count(),
          db.translations.count(),
          db.notes.count(),
        ]);
        
        // Consider it has data if any of these tables have entries
        setHasLocalData(booksCount > 0 || translationsCount > 0 || notesCount > 0);
      }
    };
    
    checkLocalData();
  }, [user?.isLoggedIn]);

  const handleLoginClick = () => {
    // If user has local data, show warning first
    if (hasLocalData) {
      setShowLoginWarning(true);
    } else {
      // No local data, proceed directly to login
      handleLogin();
    }
  };

  const handleExportAndLogin = async () => {
    setIsExporting(true);
    try {
      const jsonString = await exportDatabase();
      downloadExport(jsonString);
      setShowLoginWarning(false);
      // Give a moment for download to start, then login
      setTimeout(() => {
        handleLogin();
      }, 500);
    } catch (error) {
      console.error('Export failed:', error);
      setError('Failed to export database. Please try exporting manually from Settings.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleLogin = async () => {
    try {
      setError(null);
      setShowLoginWarning(false);
      if (!db.cloud) {
        setError('Dexie Cloud not configured');
        return;
      }
      
      // Count local data BEFORE login
      const localBooksCountBefore = await db.books.count();
      
      // Login first
      await db.cloud.login();
      
      // NOW store local data AFTER login but BEFORE clearing (to capture current state)
      const localBooks = await db.books.toArray();
      const localProgress = await db.progress.toArray();
      const localTranslations = await db.translations.toArray();
      const localNotes = await db.notes.toArray();
      const localChats = await db.chats.toArray();
      const localBookmarkGroups = await db.bookmarkGroups.toArray();
      const localBookmarks = await db.bookmarks.toArray();
      
      // ALWAYS clear all synced data first to prevent merge/duplication
      // Then sync to get only cloud data (no merge, just replace)
      await Promise.all([
        db.books.clear(),
        db.progress.clear(),
        db.translations.clear(),
        db.notes.clear(),
        db.chats.clear(),
        db.bookmarkGroups.clear(),
        db.bookmarks.clear(),
      ]);
      
      // Sync to download cloud data (if cloud has data)
      await db.cloud.sync();
      
      // Check if cloud had data
      const afterSyncBooksCount = await db.books.count();
      const cloudHadData = afterSyncBooksCount > 0;
      
      if (!cloudHadData && localBooksCountBefore > 0) {
        // Cloud is empty but local had data - restore local data
        // It will be uploaded to cloud on next sync
        await Promise.all([
          db.books.bulkAdd(localBooks),
          db.progress.bulkAdd(localProgress),
          db.translations.bulkAdd(localTranslations),
          db.notes.bulkAdd(localNotes),
          db.chats.bulkAdd(localChats),
          db.bookmarkGroups.bulkAdd(localBookmarkGroups),
          db.bookmarks.bulkAdd(localBookmarks),
        ]);
        
        // Ensure default_book_initialized flag is set to prevent re-initialization
        await db.settings.put({ key: 'default_book_initialized', value: 'true' });
        
        // Sync to upload local data to cloud - wait a bit for bulkAdd to complete
        await new Promise(resolve => setTimeout(resolve, 100));
        await db.cloud.sync();
        
        // Trigger a page refresh to ensure UI updates
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      } else if (cloudHadData) {
        // Cloud had data - trigger refresh to show new data
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }
    } catch (error) {
      console.error('Login failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to login. Please try again.');
    }
  };

  const handleLogout = async () => {
    try {
      setError(null);
      if (!db.cloud) {
        setError('Dexie Cloud not configured');
        return;
      }
      
      // Get current state before logout (including settings to preserve theme)
      const [localBooks, localProgress, localTranslations, localNotes, localChats, localBookmarkGroups, localBookmarks, localSettings] = await Promise.all([
        db.books.toArray(),
        db.progress.toArray(),
        db.translations.toArray(),
        db.notes.toArray(),
        db.chats.toArray(),
        db.bookmarkGroups.toArray(),
        db.bookmarks.toArray(),
        db.settings.toArray(), // Preserve all settings including theme
      ]);
      
      // Logout
      await db.cloud.logout();
      
      // Check each table individually and only restore what was actually cleared
      // Wait a brief moment to ensure logout operations complete
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const restorePromises: Promise<any>[] = [];
      
      const booksAfterLogout = await db.books.count();
      if (booksAfterLogout === 0 && localBooks.length > 0) {
        restorePromises.push(db.books.bulkAdd(localBooks));
      }
      
      const progressAfterLogout = await db.progress.count();
      if (progressAfterLogout === 0 && localProgress.length > 0) {
        restorePromises.push(db.progress.bulkAdd(localProgress));
      }
      
      const translationsAfterLogout = await db.translations.count();
      if (translationsAfterLogout === 0 && localTranslations.length > 0) {
        restorePromises.push(db.translations.bulkAdd(localTranslations));
      }
      
      const notesAfterLogout = await db.notes.count();
      if (notesAfterLogout === 0 && localNotes.length > 0) {
        restorePromises.push(db.notes.bulkAdd(localNotes));
      }
      
      const chatsAfterLogout = await db.chats.count();
      if (chatsAfterLogout === 0 && localChats.length > 0) {
        restorePromises.push(db.chats.bulkAdd(localChats));
      }
      
      const bookmarkGroupsAfterLogout = await db.bookmarkGroups.count();
      if (bookmarkGroupsAfterLogout === 0 && localBookmarkGroups.length > 0) {
        restorePromises.push(db.bookmarkGroups.bulkAdd(localBookmarkGroups));
      }
      
      const bookmarksAfterLogout = await db.bookmarks.count();
      if (bookmarksAfterLogout === 0 && localBookmarks.length > 0) {
        restorePromises.push(db.bookmarks.bulkAdd(localBookmarks));
      }
      
      // Restore settings if they were cleared (even though they're unsynced, better safe than sorry)
      const settingsAfterLogout = await db.settings.toArray();
      if (settingsAfterLogout.length === 0 && localSettings.length > 0) {
        restorePromises.push(db.settings.bulkAdd(localSettings));
      }
      
      if (restorePromises.length > 0) {
        await Promise.all(restorePromises);
        // Ensure default_book_initialized flag is set if we restored books
        if (booksAfterLogout === 0 && localBooks.length > 0) {
          await db.settings.put({ key: 'default_book_initialized', value: 'true' });
        }
        // Trigger a small delay to ensure all operations complete before navigation
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error('Logout failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to logout');
    }
  };

  const handleSync = async () => {
    try {
      setError(null);
      if (!db.cloud) {
        setError('Dexie Cloud not configured');
        return;
      }
      try {
        await db.cloud.sync();
        // Wait a bit to ensure sync completes
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (syncError) {
        throw syncError;
      }
    } catch (error) {
      // #region agent log
      setTimeout(()=>fetch('http://127.0.0.1:7242/ingest/5343a94c-3e7c-4082-b77e-5a423e497148',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'CloudSync.tsx:156',message:'Manual sync - error',data:{error:error instanceof Error ? error.message : String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{}),0);
      // #endregion
      console.error('Sync failed:', error);
      setError(error instanceof Error ? error.message : 'Failed to sync');
    }
  };

  if (!db.cloud) {
    return (
      <div className="p-6 rounded-2xl shadow-sm" style={{ backgroundColor: 'var(--zen-card-solid-bg, white)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
        <h2 className="text-lg font-serif font-medium mb-4" style={{ color: 'var(--zen-heading, #1c1917)' }}>Cloud Sync</h2>
        <p className="text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>Dexie Cloud is not configured. Please set NEXT_PUBLIC_DEXIE_CLOUD_DB_URL environment variable.</p>
      </div>
    );
  }

  const isLoggedIn = user?.isLoggedIn || false;

  return (
    <>
    <div className="p-6 rounded-2xl shadow-sm" style={{ backgroundColor: 'var(--zen-card-solid-bg, white)', borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--zen-border, rgba(0,0,0,0.06))' }}>
      <h2 className="text-lg font-serif font-medium mb-4" style={{ color: 'var(--zen-heading, #1c1917)' }}>Cloud Sync</h2>
      
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {!isLoggedIn ? (
        <div className="space-y-4">
          <p className="text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
            Sync your data across devices. Login to enable cloud sync.
          </p>
            <button
              onClick={handleLoginClick}
              className="px-4 py-2 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: 'var(--zen-primary, #3b82f6)', color: 'white' }}
            >
              Login to Sync
            </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-sm mb-1" style={{ color: 'var(--zen-text-muted, #78716c)' }}>Logged in as:</p>
            <p className="text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>{user?.email || user?.name || 'User'}</p>
          </div>
          
          <div className="flex items-center gap-2 text-sm">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            <span style={{ color: 'var(--zen-text-muted, #78716c)' }}>
              {isSyncing ? 'Syncing...' : isOnline ? (lastSyncTime ? `Synced ${new Date(lastSyncTime).toLocaleTimeString()}` : 'Online') : 'Offline'}
            </span>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--zen-secondary, #10b981)', color: 'white' }}
            >
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: 'var(--zen-border, rgba(0,0,0,0.1))', color: 'var(--zen-text, #1c1917)' }}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </div>

      {/* Login Warning Modal */}
      {showLoginWarning && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowLoginWarning(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
            style={{ backgroundColor: 'var(--zen-card-solid-bg, white)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-serif font-medium mb-4" style={{ color: 'var(--zen-heading, #1c1917)' }}>
              ⚠️ Backup Your Data First
            </h3>
            
            <div className="space-y-4 mb-6">
              <p className="text-sm" style={{ color: 'var(--zen-text, #1c1917)' }}>
                <strong>Warning:</strong> All your local data (books, translations, notes, bookmarks, etc.) will be 
                <strong style={{ color: 'var(--zen-text, #1c1917)' }}> deleted and replaced</strong> with data from the cloud when you log in.
              </p>
              <p className="text-sm" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                <strong>Recommendation:</strong> Export your data as a backup before logging in. 
                You can import it later if needed. Your settings will remain untouched.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleExportAndLogin}
                disabled={isExporting}
                className="px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--zen-primary, #3b82f6)', color: 'white' }}
              >
                {isExporting ? 'Exporting...' : '📥 Export & Login'}
              </button>
              
              <button
                onClick={handleLogin}
                className="px-4 py-2 rounded-lg font-medium transition-colors"
                style={{ backgroundColor: 'var(--zen-border, rgba(0,0,0,0.1))', color: 'var(--zen-text, #1c1917)' }}
              >
                Login Anyway
              </button>
              
              <button
                onClick={() => setShowLoginWarning(false)}
                className="px-4 py-2 rounded-lg font-medium transition-colors text-sm"
                style={{ color: 'var(--zen-text-muted, #78716c)' }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
