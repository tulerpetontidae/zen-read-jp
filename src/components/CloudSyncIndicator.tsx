'use client';

import { useState } from 'react';
import { useObservable } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { IoCloudOutline, IoCloudDoneOutline, IoCloudOfflineOutline, IoClose } from 'react-icons/io5';

export function CloudSyncIndicator() {
  const user = useObservable(db.cloud?.currentUser);
  const syncState = useObservable(db.cloud?.syncState);
  const [showPopup, setShowPopup] = useState(false);

  if (!db.cloud) {
    return null; // Don't show if cloud not configured
  }

  const isLoggedIn = (user as any)?.isLoggedIn || false;
  const syncStateObj = syncState as any;
  const isSyncing = syncStateObj?.isProcessing === true;
  
  // Simplified: if logged in, show as synced (blue). Auto-sync will handle the rest.
  // If not logged in, show as not synced (red).
  const isSynced = isLoggedIn;
  const color = isSynced ? 'rgba(59, 130, 246, 0.8)' : 'rgba(239, 68, 68, 0.8)'; // blue if synced, red if not

  const handleSync = async () => {
    try {
      if (!db.cloud) return;
      await db.cloud.sync();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      if (!db.cloud) return;
      
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
      
      setShowPopup(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowPopup(true)}
        className="fixed top-20 right-6 z-20 p-3 backdrop-blur-sm rounded-full shadow-sm hover:shadow-md transition-all duration-300"
        style={{ 
          color: color,
          backgroundColor: 'var(--zen-accent-bg, rgba(255,255,255,0.5))',
          borderColor: 'var(--zen-border, rgba(255,255,255,0.3))'
        }}
        title={isSynced ? 'Synced' : 'Not synced'}
      >
        {isSynced ? (
          <IoCloudDoneOutline size={20} />
        ) : (
          <IoCloudOfflineOutline size={20} />
        )}
      </button>

      {/* Popup Modal */}
      {showPopup && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowPopup(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6"
            style={{ backgroundColor: 'var(--zen-card-solid-bg, white)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-serif font-medium" style={{ color: 'var(--zen-heading, #1c1917)' }}>
                Cloud Sync
              </h3>
              <button
                onClick={() => setShowPopup(false)}
                className="p-1 rounded-full hover:bg-gray-100 transition-colors"
                style={{ color: 'var(--zen-text-muted, #78716c)' }}
              >
                <IoClose size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div style={{ color: color }}>
                  {isSynced ? (
                    <IoCloudDoneOutline size={20} />
                  ) : (
                    <IoCloudOfflineOutline size={20} />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: 'var(--zen-text, #1c1917)' }}>
                    {isSyncing ? 'Syncing...' : isSynced ? 'Synced' : 'Not synced'}
                  </p>
                  {isLoggedIn && (
                    <p className="text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                      {user?.email || user?.name || 'User'}
                    </p>
                  )}
                </div>
              </div>

              {isLoggedIn ? (
                <div className="flex flex-col gap-2">
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
              ) : (
                <div>
                  <p className="text-sm mb-3" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                    Login in Settings to enable cloud sync.
                  </p>
                  <a
                    href="/settings"
                    className="block px-4 py-2 rounded-lg font-medium transition-colors text-center"
                    style={{ backgroundColor: 'var(--zen-primary, #3b82f6)', color: 'white' }}
                  >
                    Go to Settings
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
