/**
 * Storage Service
 * Provides a unified interface for storage that uses:
 * - Electron's native storage (via IPC) when running in Electron
 * - Browser localStorage as fallback for web
 */

class StorageService {
  private isElectron: boolean;

  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron === true;
  }

  /**
   * Get an item from storage
   */
  async getItem(key: string): Promise<string | null> {
    try {
      if (this.isElectron && window.electronAPI?.storageGet) {
        return await window.electronAPI.storageGet(key);
      }
      // Fallback to localStorage
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Error getting item ${key} from storage:`, error);
      return null;
    }
  }

  /**
   * Set an item in storage
   */
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (this.isElectron && window.electronAPI?.storageSet) {
        await window.electronAPI.storageSet(key, value);
      } else {
        // Fallback to localStorage
        localStorage.setItem(key, value);
      }
    } catch (error) {
      console.error(`Error setting item ${key} in storage:`, error);
    }
  }

  /**
   * Remove an item from storage
   */
  async removeItem(key: string): Promise<void> {
    try {
      if (this.isElectron && window.electronAPI?.storageRemove) {
        await window.electronAPI.storageRemove(key);
      } else {
        // Fallback to localStorage
        localStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`Error removing item ${key} from storage:`, error);
    }
  }

  /**
   * Clear all storage
   */
  async clear(): Promise<void> {
    try {
      if (this.isElectron && window.electronAPI?.storageClear) {
        await window.electronAPI.storageClear();
      } else {
        // Fallback to localStorage
        localStorage.clear();
      }
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }

  /**
   * Synchronous methods for backward compatibility (uses localStorage)
   * These should be migrated to async versions gradually
   */
  getItemSync(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.error(`Error getting item ${key} from storage (sync):`, error);
      return null;
    }
  }

  setItemSync(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Error setting item ${key} in storage (sync):`, error);
    }
  }

  removeItemSync(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing item ${key} from storage (sync):`, error);
    }
  }
}

export const storageService = new StorageService();
