/**
 * API Key Storage Utility
 * Manages API keys in memory (temporary) or IndexedDB (persistent)
 */

// In-memory storage for temporary API keys
let temporaryApiKey: string | null = null;

export type ApiKeyStorageMode = 'temporary' | 'persistent';

/**
 * Get the current API key from memory or IndexedDB
 */
export async function getApiKey(): Promise<string | null> {
  // Check memory first (temporary storage)
  if (temporaryApiKey) {
    return temporaryApiKey;
  }

  // Fall back to IndexedDB (persistent storage)
  try {
    const { db } = await import('./db');
    const apiKeySetting = await db.settings.get('openai_api_key');
    return apiKeySetting?.value || null;
  } catch (e) {
    console.error('Failed to get API key from IndexedDB:', e);
    return null;
  }
}

/**
 * Set API key in memory (temporary) or IndexedDB (persistent)
 */
export async function setApiKey(
  apiKey: string,
  mode: ApiKeyStorageMode
): Promise<void> {
  if (mode === 'temporary') {
    // Store in memory only
    temporaryApiKey = apiKey.trim() || null;
    
    // Remove from IndexedDB if it exists
    try {
      const { db } = await import('./db');
      await db.settings.delete('openai_api_key');
    } catch (e) {
      console.error('Failed to remove API key from IndexedDB:', e);
    }
  } else {
    // Store in IndexedDB
    temporaryApiKey = null; // Clear memory
    
    try {
      const { db } = await import('./db');
      if (apiKey.trim()) {
        await db.settings.put({ key: 'openai_api_key', value: apiKey.trim() });
      } else {
        await db.settings.delete('openai_api_key');
      }
    } catch (e) {
      console.error('Failed to save API key to IndexedDB:', e);
      throw e;
    }
  }
}

/**
 * Clear API key from both memory and IndexedDB
 */
export async function clearApiKey(): Promise<void> {
  temporaryApiKey = null;
  
  try {
    const { db } = await import('./db');
    await db.settings.delete('openai_api_key');
  } catch (e) {
    console.error('Failed to clear API key from IndexedDB:', e);
  }
}

/**
 * Get the current storage mode preference
 */
export async function getStorageMode(): Promise<ApiKeyStorageMode> {
  try {
    const { db } = await import('./db');
    const modeSetting = await db.settings.get('api_key_storage_mode');
    return (modeSetting?.value as ApiKeyStorageMode) || 'temporary'; // Default to temporary
  } catch (e) {
    console.error('Failed to get storage mode:', e);
    return 'temporary';
  }
}

/**
 * Set the storage mode preference
 */
export async function setStorageMode(mode: ApiKeyStorageMode): Promise<void> {
  try {
    const { db } = await import('./db');
    await db.settings.put({ key: 'api_key_storage_mode', value: mode });
    
    // If switching to temporary mode and there's a key in IndexedDB, move it to memory
    if (mode === 'temporary') {
      const apiKeySetting = await db.settings.get('openai_api_key');
      if (apiKeySetting?.value) {
        temporaryApiKey = apiKeySetting.value;
        await db.settings.delete('openai_api_key');
      }
    }
  } catch (e) {
    console.error('Failed to set storage mode:', e);
    throw e;
  }
}

