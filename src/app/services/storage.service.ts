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

  // --- Settings (SQLite key-value) ---

  async getSetting(key: string): Promise<any> {
    if (!this.db) return null;
    try {
      return await this.db.getSetting(key);
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return null;
    }
  }

  async setSetting(key: string, value: any): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.setSetting(key, value);
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
    }
  }

  async getAllSettings(): Promise<Record<string, any>> {
    if (!this.db) return {};
    try {
      return await this.db.getAllSettings();
    } catch (error) {
      console.error('Error getting all settings:', error);
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
        citations: m.citations || null,
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

  // --- Conversation selection (SQLite) ---

  async selectConversation(conversationId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.selectConversation(conversationId);
    } catch (error) {
      console.error('Error selecting conversation:', error);
    }
  }

  async clearSelectedConversation(): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.clearSelectedConversation();
    } catch (error) {
      console.error('Error clearing selected conversation:', error);
    }
  }

  async getSelectedConversation(): Promise<any | null> {
    if (!this.db) return null;
    try {
      return await this.db.getSelectedConversation();
    } catch (error) {
      console.error('Error getting selected conversation:', error);
      return null;
    }
  }

  // --- Project metadata (SQLite) ---

  async upsertProject(project: { id: string; name: string; color?: string; temperature?: number; system?: boolean; folder_path?: string }): Promise<any> {
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

  async updateProjectMeta(projectId: string, updates: { name?: string; color?: string; temperature?: number; folder_path?: string }): Promise<any> {
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

  // --- Memory Usage (SQLite) ---

  async addMemoryUsage(memoryPercent: number): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.addMemoryUsage(memoryPercent);
    } catch (error) {
      console.error('Error adding memory usage:', error);
    }
  }

  async getMemoryUsage(limit: number = 60): Promise<{ memory_percent: number; created_at: string }[]> {
    if (!this.db) return [];
    try {
      return await this.db.getMemoryUsage(limit);
    } catch (error) {
      console.error('Error getting memory usage:', error);
      return [];
    }
  }

  async addTpsEntry(tokensPerSecond: number): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.addTpsEntry(tokensPerSecond);
    } catch (error) {
      console.error('Error adding TPS entry:', error);
    }
  }

  async getTpsHistory(limit: number = 60): Promise<{ tokens_per_second: number; created_at: string }[]> {
    if (!this.db) return [];
    try {
      return await this.db.getTpsHistory(limit);
    } catch (error) {
      console.error('Error getting TPS history:', error);
      return [];
    }
  }
  // --- MCP Servers (SQLite) ---

  async addMcpServer(server: { id: string; project_id: string; name: string; server_type?: string; config?: any }): Promise<any> {
    if (!this.db) return null;
    try {
      return await this.db.addMcpServer(server);
    } catch (error) {
      console.error('Error adding MCP server:', error);
      return null;
    }
  }

  async getMcpServersByProject(projectId: string): Promise<any[]> {
    if (!this.db) return [];
    try {
      return await this.db.getMcpServersByProject(projectId);
    } catch (error) {
      console.error('Error getting MCP servers:', error);
      return [];
    }
  }

  async deleteMcpServer(id: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteMcpServer(id);
    } catch (error) {
      console.error('Error deleting MCP server:', error);
    }
  }

  async deleteMcpServersByProject(projectId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteMcpServersByProject(projectId);
    } catch (error) {
      console.error('Error deleting MCP servers by project:', error);
    }
  }

  // --- Folders (SQLite, UI-only grouping) ---

  async createFolder(projectId: string, name: string): Promise<any> {
    if (!this.db) return null;
    try {
      return await this.db.createFolder({ project_id: projectId, name });
    } catch (error) {
      console.error('Error creating folder:', error);
      return null;
    }
  }

  async listFoldersByProject(projectId: string): Promise<any[]> {
    if (!this.db) return [];
    try {
      return await this.db.listFoldersByProject(projectId);
    } catch (error) {
      console.error('Error listing folders:', error);
      return [];
    }
  }

  async renameFolder(id: string, name: string): Promise<any> {
    if (!this.db) return null;
    try {
      return await this.db.renameFolder(id, name);
    } catch (error) {
      console.error('Error renaming folder:', error);
      return null;
    }
  }

  async deleteFolder(id: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteFolder(id);
    } catch (error) {
      console.error('Error deleting folder:', error);
    }
  }

  async setDocumentFolder(documentId: string, projectId: string, folderId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.setDocumentFolder({ document_id: documentId, project_id: projectId, folder_id: folderId });
    } catch (error) {
      console.error('Error setting document folder:', error);
    }
  }

  async clearDocumentFolder(documentId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.clearDocumentFolder(documentId);
    } catch (error) {
      console.error('Error clearing document folder:', error);
    }
  }

  async getDocumentFoldersByProject(projectId: string): Promise<Record<string, string>> {
    if (!this.db) return {};
    try {
      return await this.db.getDocumentFoldersByProject(projectId);
    } catch (error) {
      console.error('Error getting document folders:', error);
      return {};
    }
  }

  // --- Document Status (SQLite) ---

  async setDocumentProcessed(documentId: string, projectId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.setDocumentProcessed(documentId, projectId);
    } catch (error) {
      console.error('Error setting document processed:', error);
    }
  }

  async getDocumentStatusByProject(projectId: string): Promise<Record<string, string>> {
    if (!this.db) return {};
    try {
      return await this.db.getDocumentStatusByProject(projectId);
    } catch (error) {
      console.error('Error getting document status:', error);
      return {};
    }
  }

  async deleteDocumentStatus(documentId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteDocumentStatus(documentId);
    } catch (error) {
      console.error('Error deleting document status:', error);
    }
  }

  async deleteDocumentStatusByProject(projectId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteDocumentStatusByProject(projectId);
    } catch (error) {
      console.error('Error deleting document status by project:', error);
    }
  }

  async deleteFoldersByProject(projectId: string): Promise<void> {
    if (!this.db) return;
    try {
      await this.db.deleteFoldersByProject(projectId);
    } catch (error) {
      console.error('Error deleting folders by project:', error);
    }
  }
}

export const storageService = new StorageService();
