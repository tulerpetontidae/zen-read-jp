'use client';

import React, { useState, useEffect } from 'react';
import { db, type BookmarkGroup } from '@/lib/db';
import { IoClose } from 'react-icons/io5';

interface BookmarkSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BookmarkSettingsModal({
  isOpen,
  onClose,
}: BookmarkSettingsModalProps) {
  const [bookmarkGroups, setBookmarkGroups] = useState<BookmarkGroup[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingGroupName, setEditingGroupName] = useState('');
  const [editingColorGroupId, setEditingColorGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [colorPickerPosition, setColorPickerPosition] = useState<{ top: number; left: number } | null>(null);
  
  const presetColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];

  useEffect(() => {
    if (isOpen) {
      loadBookmarkGroups();
    }
  }, [isOpen]);

  // Close color picker when clicking outside
  useEffect(() => {
    if (editingColorGroupId) {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-color-picker]')) {
          setEditingColorGroupId(null);
          setColorPickerPosition(null);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [editingColorGroupId]);

  const loadBookmarkGroups = async () => {
    try {
      const groups = await db.bookmarkGroups.orderBy('order').toArray();
      setBookmarkGroups(groups);
    } catch (e) {
      console.error('Failed to load bookmark groups:', e);
    }
  };

  const handleStartEditGroup = (group: BookmarkGroup) => {
    setEditingGroupId(group.id);
    setEditingGroupName(group.name);
  };

  const handleSaveGroupName = async (groupId: string) => {
    try {
      const group = bookmarkGroups.find(g => g.id === groupId);
      if (group) {
        await db.bookmarkGroups.update(groupId, {
          name: editingGroupName.trim() || group.name,
          updatedAt: Date.now(),
        });
        await loadBookmarkGroups();
      }
    } catch (e) {
      console.error('Failed to update bookmark group:', e);
    } finally {
      setEditingGroupId(null);
      setEditingGroupName('');
    }
  };

  const handleColorChange = async (groupId: string, newColor: string) => {
    try {
      await db.bookmarkGroups.update(groupId, {
        color: newColor,
        updatedAt: Date.now(),
      });
      await loadBookmarkGroups();
      setEditingColorGroupId(null);
    } catch (e) {
      console.error('Failed to update bookmark group color:', e);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (bookmarkGroups.length <= 1) {
      alert('Cannot delete the last bookmark group. You must have at least one group.');
      return;
    }
    setDeletingGroupId(groupId);
  };

  const confirmDeleteGroup = async () => {
    if (!deletingGroupId) return;
    try {
      // Delete all bookmarks in this group
      await db.bookmarks.where('colorGroupId').equals(deletingGroupId).delete();
      // Delete the group
      await db.bookmarkGroups.delete(deletingGroupId);
      await loadBookmarkGroups();
      setDeletingGroupId(null);
    } catch (e) {
      console.error('Failed to delete bookmark group:', e);
      alert('Failed to delete bookmark group');
      setDeletingGroupId(null);
    }
  };

  const cancelDeleteGroup = () => {
    setDeletingGroupId(null);
  };

  const handleAddGroup = async () => {
    if (bookmarkGroups.length >= 5) {
      alert('Maximum 5 bookmark groups allowed');
      return;
    }
    try {
      const { v4: uuidv4 } = await import('uuid');
      const presetColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
      const usedColors = bookmarkGroups.map(g => g.color);
      const availableColor = presetColors.find(c => !usedColors.includes(c)) || presetColors[bookmarkGroups.length % presetColors.length];
      
      // Find the maximum order value and add 1 to ensure new groups appear at the bottom
      const maxOrder = bookmarkGroups.length > 0 
        ? Math.max(...bookmarkGroups.map(g => g.order))
        : -1;
      
      const newGroup: BookmarkGroup = {
        id: uuidv4(),
        name: `Group ${bookmarkGroups.length + 1}`,
        color: availableColor,
        order: maxOrder + 1,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await db.bookmarkGroups.add(newGroup);
      await loadBookmarkGroups();
    } catch (e) {
      console.error('Failed to add bookmark group:', e);
      alert('Failed to add bookmark group');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
      onClick={onClose}
    >
      <div
        className="relative z-10 max-w-xs w-auto p-4 rounded-xl shadow-xl"
        style={{ 
          backgroundColor: 'var(--zen-card-solid-bg, white)',
          maxHeight: '80vh',
          overflowY: 'auto',
          width: '320px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-serif font-medium" style={{ color: 'var(--zen-heading, #1c1917)' }}>
            Bookmark Groups
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors"
            style={{ color: 'var(--zen-text-muted, #78716c)' }}
          >
            <IoClose size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
            Click on a name to edit it.
          </p>

          <div className="space-y-1.5">
            {bookmarkGroups.map((group) => (
              <div
                key={group.id}
                className="flex items-center gap-2 p-2 rounded-lg"
                style={{
                  backgroundColor: 'var(--zen-btn-bg, #fafaf9)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'var(--zen-btn-border, #e7e5e4)',
                }}
              >
                {/* Color swatch - clickable */}
                <div className="relative">
                  <button
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setColorPickerPosition({
                        top: rect.bottom + 8,
                        left: rect.left
                      });
                      setEditingColorGroupId(editingColorGroupId === group.id ? null : group.id);
                    }}
                    className="w-5 h-5 rounded-full flex-shrink-0 border-2 transition-all hover:scale-110"
                    style={{ 
                      backgroundColor: group.color,
                      borderColor: editingColorGroupId === group.id ? 'var(--zen-text, #1c1917)' : 'transparent'
                    }}
                    title="Change color"
                  />
                  {editingColorGroupId === group.id && colorPickerPosition && (
                    <div 
                      className="fixed p-4 rounded-lg shadow-lg"
                      data-color-picker
                      style={{
                        backgroundColor: 'var(--zen-card-solid-bg, white)',
                        borderWidth: '1px',
                        borderStyle: 'solid',
                        borderColor: 'var(--zen-border, rgba(0,0,0,0.1))',
                        minWidth: '200px',
                        zIndex: 9999,
                        top: `${colorPickerPosition.top}px`,
                        left: `${colorPickerPosition.left}px`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="grid grid-cols-5 gap-3" style={{ width: '100%' }}>
                        {presetColors.map((color) => (
                          <button
                            key={color}
                            onClick={() => {
                              handleColorChange(group.id, color);
                              setEditingColorGroupId(null);
                              setColorPickerPosition(null);
                            }}
                            className={`rounded-full border-2 transition-all hover:scale-110 flex-shrink-0 ${
                              group.color === color ? 'ring-2 ring-offset-1' : ''
                            }`}
                            style={{ 
                              width: '32px',
                              height: '32px',
                              backgroundColor: color,
                              borderColor: group.color === color ? 'var(--zen-text, #1c1917)' : 'transparent',
                              flexShrink: 0,
                            }}
                            title={color}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Name input or display */}
                {editingGroupId === group.id ? (
                  <input
                    type="text"
                    value={editingGroupName}
                    onChange={(e) => setEditingGroupName(e.target.value)}
                    onBlur={() => handleSaveGroupName(group.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSaveGroupName(group.id);
                      } else if (e.key === 'Escape') {
                        setEditingGroupId(null);
                        setEditingGroupName('');
                      }
                    }}
                    className="flex-1 px-2 py-1 rounded text-xs focus:outline-none focus:ring-2 focus:ring-rose-200"
                    style={{
                      backgroundColor: 'var(--zen-input-bg, white)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: 'var(--zen-btn-border, #e7e5e4)',
                      color: 'var(--zen-text, #1c1917)',
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => handleStartEditGroup(group)}
                    className="flex-1 text-left text-xs px-2 py-1 rounded hover:bg-white/50 transition-colors"
                    style={{ color: 'var(--zen-text, #1c1917)' }}
                  >
                    {group.name}
                  </button>
                )}
                
                {/* Delete button */}
                {bookmarkGroups.length > 1 && (
                  <button
                    onClick={() => handleDeleteGroup(group.id)}
                    className="p-1 rounded hover:bg-red-100 transition-colors"
                    style={{ color: '#ef4444' }}
                    title="Delete group"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Add group button */}
          {bookmarkGroups.length < 5 && (
            <button
              onClick={handleAddGroup}
              className="w-full px-3 py-1.5 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-xs font-medium transition-colors"
            >
              Add Group ({bookmarkGroups.length}/5)
            </button>
          )}

          {bookmarkGroups.length >= 5 && (
            <p className="text-xs text-center" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
              Maximum 5 groups reached
            </p>
          )}
        </div>

        {/* Delete confirmation modal */}
        {deletingGroupId && (
          <div 
            className="absolute inset-0 flex items-center justify-center z-30 rounded-xl"
            style={{
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              backdropFilter: 'blur(2px)',
            }}
            onClick={cancelDeleteGroup}
          >
            <div
              className="p-4 rounded-lg shadow-lg max-w-xs mx-4"
              style={{
                backgroundColor: 'var(--zen-card-solid-bg, white)',
                borderWidth: '2px',
                borderStyle: 'solid',
                borderColor: '#ef4444',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3">
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--zen-text, #1c1917)' }}>
                  Delete Bookmark Group?
                </p>
                <p className="text-xs" style={{ color: 'var(--zen-text-muted, #78716c)' }}>
                  All bookmarks in this group will be removed. This cannot be undone.
                </p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancelDeleteGroup}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  style={{
                    backgroundColor: 'var(--zen-btn-bg, #fafaf9)',
                    color: 'var(--zen-text, #1c1917)',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteGroup}
                  className="px-3 py-1.5 rounded text-xs font-medium transition-colors text-white"
                  style={{
                    backgroundColor: '#ef4444',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#dc2626';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#ef4444';
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

