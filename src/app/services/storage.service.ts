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

  /**
   * Storage key prefix for local mode — avoids conflicts with remote-mode cache
   */
  private localKey(key: string): string {
    return `local_${key}`;
  }

  /**
   * Save conversations to storage
   */
  async saveConversations(conversations: any[]): Promise<void> {
    try {
      await this.setItem(this.localKey('conversations'), conversations);
      console.log(`[Storage] Saved ${conversations.length} conversations`);
    } catch (error) {
      console.error('Error saving conversations:', error);
    }
  }

  /**
   * Get all conversations from storage
   */
  async getConversations(): Promise<any[]> {
    try {
      const conversations = await this.getItem(this.localKey('conversations'));
      return conversations || [];
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  }

  /**
   * Save a single conversation to storage
   */
  async saveConversation(conversation: any): Promise<void> {
    try {
      const conversations = await this.getConversations();
      const existingIndex = conversations.findIndex((c: any) => c.id === conversation.id);

      if (existingIndex >= 0) {
        conversations[existingIndex] = conversation;
      } else {
        conversations.push(conversation);
      }

      await this.saveConversations(conversations);
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }

  /**
   * Get a single conversation by ID
   */
  async getConversation(conversationId: string): Promise<any | null> {
    try {
      const conversations = await this.getConversations();
      return conversations.find((c: any) => c.id === conversationId) || null;
    } catch (error) {
      console.error('Error getting conversation:', error);
      return null;
    }
  }

  /**
   * Delete a conversation from storage
   */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      const conversations = await this.getConversations();
      const filtered = conversations.filter((c: any) => c.id !== conversationId);
      await this.saveConversations(filtered);

      // Also delete messages for this conversation
      await this.deleteMessages(conversationId);
      console.log(`[Storage] Deleted conversation ${conversationId}`);
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }

  /**
   * Save messages for a conversation
   */
  async saveMessages(conversationId: string, messages: any[]): Promise<void> {
    try {
      const key = this.localKey(`messages_${conversationId}`);
      await this.setItem(key, messages);
      console.log(`[Storage] Saved ${messages.length} messages for conversation ${conversationId}`);
    } catch (error) {
      console.error(`Error saving messages for conversation ${conversationId}:`, error);
    }
  }

  /**
   * Get messages for a conversation
   */
  async getMessages(conversationId: string): Promise<any[]> {
    try {
      const key = this.localKey(`messages_${conversationId}`);
      const messages = await this.getItem(key);
      return messages || [];
    } catch (error) {
      console.error(`Error getting messages for conversation ${conversationId}:`, error);
      return [];
    }
  }

  /**
   * Delete messages for a conversation
   */
  async deleteMessages(conversationId: string): Promise<void> {
    try {
      const key = this.localKey(`messages_${conversationId}`);
      await this.removeItem(key);
      console.log(`[Storage] Deleted messages for conversation ${conversationId}`);
    } catch (error) {
      console.error(`Error deleting messages for conversation ${conversationId}:`, error);
    }
  }
}

export const storageService = new StorageService();
