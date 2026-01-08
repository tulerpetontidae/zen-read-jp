'use client';

import React, { useState, useEffect } from 'react';
import { db, type BookmarkGroup } from '@/lib/db';
import { IoBookmark, IoBookmarkOutline, IoSettingsOutline } from 'react-icons/io5';
import BookmarkSettingsModal from './BookmarkSettingsModal';

interface BookmarkSelectorProps {
  bookId: string;
  paragraphHash: string;
  currentColorGroupId: string | null;
  onSelect: (colorGroupId: string | null) => void;
  onClose: () => void;
}

export default function BookmarkSelector({
  bookId,
  paragraphHash,
  currentColorGroupId,
  onSelect,
  onClose,
}: BookmarkSelectorProps) {
  const [groups, setGroups] = useState<BookmarkGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const loadGroups = async () => {
    try {
      const allGroups = await db.bookmarkGroups.orderBy('order').toArray();
      setGroups(allGroups);
    } catch (e) {
      console.error('Failed to load bookmark groups:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadGroups();
  }, []);

  // Reload groups when settings modal closes or when component mounts
  useEffect(() => {
    if (!isSettingsOpen) {
      loadGroups();
    }
  }, [isSettingsOpen]);


  const handleSelect = async (colorGroupId: string | null) => {
    const bookmarkId = `${bookId}-${paragraphHash}`;
    
    if (colorGroupId === null) {
      // Remove bookmark
      try {
        await db.bookmarks.delete(bookmarkId);
        onSelect(null);
      } catch (e) {
        console.error('Failed to remove bookmark:', e);
      }
    } else {
      // Add or update bookmark
      try {
        // Ensure we have the latest group data before selecting
        await loadGroups();
        
        await db.bookmarks.put({
          id: bookmarkId,
          bookId,
          paragraphHash,
          colorGroupId,
          createdAt: currentColorGroupId ? Date.now() : Date.now(), // Preserve original if updating
          updatedAt: Date.now(),
        });
        onSelect(colorGroupId);
      } catch (e) {
        console.error('Failed to save bookmark:', e);
      }
    }
    onClose();
  };

  if (isLoading) {
    return (
      <div
        className="absolute -right-3 top-10 w-48 animate-in fade-in slide-in-from-right-2 duration-200 z-20"
        style={{ marginRight: '-200px' }}
      >
        <div
          className="rounded-xl shadow-lg overflow-hidden"
          style={{
            backgroundColor: 'var(--zen-note-bg, white)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--zen-note-border, #fcd34d)',
          }}
        >
          <div className="p-3 text-center text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className="absolute -right-3 top-10 w-48 animate-in fade-in slide-in-from-right-2 duration-200 z-20"
        style={{ marginRight: '-200px' }}
      >
      <div
        className="rounded-xl shadow-lg overflow-hidden"
        style={{
          backgroundColor: 'var(--zen-note-bg, white)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--zen-note-border, #fcd34d)',
        }}
      >
        <div
          className="px-3 py-2 flex items-center justify-between"
          style={{
            backgroundColor: 'var(--zen-note-header-bg, #fef3c7)',
            borderBottomWidth: '1px',
            borderBottomStyle: 'solid',
            borderBottomColor: 'var(--zen-note-border, #fde68a)',
          }}
        >
          <span className="text-xs font-medium" style={{ color: 'var(--zen-note-header-text, #b45309)' }}>
            Bookmark
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsSettingsOpen(true);
            }}
            className="p-1 hover:bg-amber-200 rounded transition-colors"
            style={{ color: 'var(--zen-note-header-text, #b45309)' }}
            title="Manage bookmark groups"
          >
            <IoSettingsOutline size={14} />
          </button>
        </div>
        <div className="py-2">
          {/* None option */}
          <button
            onClick={() => handleSelect(null)}
            className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors"
            style={{
              color: currentColorGroupId === null ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
              backgroundColor: currentColorGroupId === null ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent',
            }}
            onMouseEnter={(e) => {
              if (currentColorGroupId !== null) {
                e.currentTarget.style.backgroundColor = 'var(--zen-accent-bg, rgba(255,255,255,0.5))';
              }
            }}
            onMouseLeave={(e) => {
              if (currentColorGroupId !== null) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            <IoBookmarkOutline size={14} />
            <span>None</span>
          </button>

          {/* Bookmark groups */}
          {groups.map((group) => (
            <button
              key={group.id}
              onClick={() => handleSelect(group.id)}
              className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:bg-gray-100 transition-colors"
              style={{
                color: currentColorGroupId === group.id ? 'var(--zen-text, #1c1917)' : 'var(--zen-text-muted, #78716c)',
                backgroundColor: currentColorGroupId === group.id ? 'var(--zen-accent-bg, rgba(255,255,255,0.5))' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (currentColorGroupId !== group.id) {
                  e.currentTarget.style.backgroundColor = 'var(--zen-accent-bg, rgba(255,255,255,0.5))';
                }
              }}
              onMouseLeave={(e) => {
                if (currentColorGroupId !== group.id) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: group.color }}
              />
              {currentColorGroupId === group.id ? (
                <IoBookmark size={14} />
              ) : (
                <IoBookmarkOutline size={14} />
              )}
              <span className="truncate">{group.name}</span>
            </button>
          ))}
        </div>
      </div>
      </div>
      <BookmarkSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </>
  );
}

