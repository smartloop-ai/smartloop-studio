/**
 * Storage Service
 * Uses electron-store for persistent storage in Electron app
 */

class StorageService {
  /**
   * Get an item from storage
   */
  async getItem(key: string): Promise<any> {
    try {
      if (window.electronAPI?.storageGet) {
        return await window.electronAPI.storageGet(key);
      }
      throw new Error('Electron storage not available');
    } catch (error) {
      console.error(`Error getting item ${key} from storage:`, error);
      return null;
    }
  }

  /**
   * Set an item in storage
   */
  async setItem(key: string, value: any): Promise<void> {
    try {
      if (window.electronAPI?.storageSet) {
        await window.electronAPI.storageSet(key, value);
      } else {
        throw new Error('Electron storage not available');
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
      if (window.electronAPI?.storageRemove) {
        await window.electronAPI.storageRemove(key);
      } else {
        throw new Error('Electron storage not available');
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
      if (window.electronAPI?.storageClear) {
        await window.electronAPI.storageClear();
      } else {
        throw new Error('Electron storage not available');
      }
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }

  /**
   * Check if a key exists in storage
   */
  async has(key: string): Promise<boolean> {
    try {
      if (window.electronAPI?.storageHas) {
        return await window.electronAPI.storageHas(key);
      }
      throw new Error('Electron storage not available');
    } catch (error) {
      console.error(`Error checking if ${key} exists in storage:`, error);
      return false;
    }
  }

  /**
   * Get all storage data
   */
  async getAll(): Promise<Record<string, any>> {
    try {
      if (window.electronAPI?.storageGetAll) {
        return await window.electronAPI.storageGetAll();
      }
      throw new Error('Electron storage not available');
    } catch (error) {
      console.error('Error getting all storage data:', error);
      return {};
    }
  }
}

export const storageService = new StorageService();
