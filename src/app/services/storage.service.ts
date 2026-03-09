/**
 * Storage Service
 * Uses SQLite (via Electron IPC) for conversations, messages, and project metadata.
 * Falls back to electron-store for generic key-value storage (token, user prefs).
 */

class StorageService {
  // --- Generic key-value (electron-store) ---

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

  async removeItem(key: string): Promise<void> {
    try {
      if (window.electronAPI?.storageRemove) {
        await window.electronAPI.storageRemove(key);
      }
    } catch (error) {
      console.error(`Error removing item ${key} from storage:`, error);
    }
  }

  async clear(): Promise<void> {
    try {
      if (window.electronAPI?.storageClear) {
        await window.electronAPI.storageClear();
      }
    } catch (error) {
      console.error('Error clearing storage:', error);
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      if (window.electronAPI?.storageHas) {
        return await window.electronAPI.storageHas(key);
      }
      return false;
    } catch (error) {
      console.error(`Error checking if ${key} exists in storage:`, error);
      return false;
    }
  }

  async getAll(): Promise<Record<string, any>> {
    try {
      if (window.electronAPI?.storageGetAll) {
        return await window.electronAPI.storageGetAll();
      }
      return {};
    } catch (error) {
      console.error('Error getting all storage data:', error);
      return {};
    }
  }

  // --- Conversations (SQLite) ---

  private get db() {
    return (window as any).electronAPI?.db;
  }

  async saveConversations(conversations: any[]): Promise<void> {
    if (!this.db) return;
    for (const conv of conversations) {
      await this.saveConversation(conv);
    }
  }

  async getConversations(projectId?: string, order?: 'asc' | 'desc'): Promise<any[]> {
    if (!this.db) return [];
    try {
      return await this.db.getConversations(projectId || null, order);
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  }

  async saveConversation(conversation: any): Promise<void> {
    if (!this.db) return;
    try {
      const existing = await this.db.getConversation(conversation.id);
      if (existing) {
        await this.db.updateConversation(conversation.id, {
          title: conversation.title,
          project_id: conversation.project_id,
        });
      } else {
        await this.db.createConversation({
          id: conversation.id,
          title: conversation.title,
          project_id: conversation.project_id || null,
        });
      }
    } catch (error) {
      console.error('Error saving conversation:', error);
    }
  }

  async getConversation(conversationId: string): Promise<any | null> {
    if (!this.db) return null;
    try {
      return await this.db.getConversation(conversationId);
    } catch (error) {
      console.error('Error getting conversation:', error);
      return null;
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteConversation(conversationId);
      console.log(`[Storage] Deleted conversation ${conversationId}`);
    } catch (error) {
      console.error('Error deleting conversation:', error);
    }
  }

  // --- Messages (SQLite) ---

  async saveMessages(conversationId: string, messages: any[]): Promise<void> {
    if (!this.db) return;
    try {
      // Ensure each message has an id
      const msgsWithIds = messages.map(m => ({
        id: m.id || crypto.randomUUID(),
        role: m.role,
        content: m.content,
        created_at: m.created_at || m.timestamp,
      }));
      await this.db.addMessages(conversationId, msgsWithIds);
    } catch (error) {
      console.error(`Error saving messages for conversation ${conversationId}:`, error);
    }
  }

  async getMessages(conversationId: string): Promise<any[]> {
    if (!this.db) return [];
    try {
      return await this.db.getMessages(conversationId);
    } catch (error) {
      console.error(`Error getting messages for conversation ${conversationId}:`, error);
      return [];
    }
  }

  async deleteMessages(conversationId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteMessages(conversationId);
    } catch (error) {
      console.error(`Error deleting messages for conversation ${conversationId}:`, error);
    }
  }

  // --- Project metadata (SQLite) ---

  async upsertProject(project: { id: string; name: string; color?: string; temperature?: number; system?: boolean }): Promise<any> {
    if (!this.db) return null;
    try {
      return await this.db.upsertProject(project);
    } catch (error) {
      console.error('Error upserting project:', error);
      return null;
    }
  }

  async getProjectMeta(projectId: string): Promise<any | null> {
    if (!this.db) return null;
    try {
      return await this.db.getProject(projectId);
    } catch (error) {
      console.error('Error getting project meta:', error);
      return null;
    }
  }

  async getAllProjectMeta(): Promise<any[]> {
    if (!this.db) return [];
    try {
      return await this.db.getAllProjects();
    } catch (error) {
      console.error('Error getting all project meta:', error);
      return [];
    }
  }

  async updateProjectMeta(projectId: string, updates: { name?: string; color?: string; temperature?: number }): Promise<any> {
    if (!this.db) return null;
    try {
      return await this.db.updateProject(projectId, updates);
    } catch (error) {
      console.error('Error updating project meta:', error);
      return null;
    }
  }

  async deleteConversationsByProject(projectId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteConversationsByProject(projectId);
    } catch (error) {
      console.error('Error deleting conversations for project:', error);
    }
  }

  async deleteProjectMeta(projectId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteProject(projectId);
    } catch (error) {
      console.error('Error deleting project meta:', error);
    }
  }
}

export const storageService = new StorageService();
