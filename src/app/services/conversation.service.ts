import { API_ENDPOINT } from "@/app/constants";
import { userService } from "./user.service";
import { storageService } from "./storage.service";

/**
 * Check if we're running in local mode (local SLP service available)
 */
const isLocalMode = (): boolean => {
  return typeof window !== 'undefined' && !!(window as any).electronAPI?.getLocalApiUrl;
};

/**
 * Conversation Service
 * Handles conversation creation and management with local storage
 */

interface CreateConversationParams {
  title: string;
  project_id?: string;
  document_ids?: string[];
}

interface ConversationServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Create a new conversation
 * @param params - Conversation creation parameters (title, optional project_id, optional document_ids)
 * @returns Promise with conversation data or error
 */
const createConversation = async (params: CreateConversationParams): Promise<ConversationServiceResponse> => {
  try {
    const { title, project_id, document_ids } = params;

    if (!title || !title.trim()) {
      return {
        success: false,
        error: 'Conversation title is required'
      };
    }

    // In local mode, create conversation locally (session ID tracked by SLP server via chat)
    if (isLocalMode()) {
      const conversation: any = {
        id: crypto.randomUUID(),
        title: title.trim(),
        project_id: project_id || null,
        document_ids: document_ids || [],
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      await storageService.saveConversation(conversation);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('conversationCreated', {
          detail: { conversationId: conversation.id, conversation }
        }));
      }

      return { success: true, data: conversation };
    }

    const requestBody: any = {
      title: title.trim()
    };

    if (project_id) {
      requestBody.project_id = project_id;
    }

    if (document_ids && document_ids.length > 0) {
      requestBody.document_ids = document_ids;
    }

    const url = `${API_ENDPOINT}/conversations`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 201) {
      const conversation = await response.json();

      // Save to local storage
      await storageService.saveConversation(conversation);

      // Dispatch event for sidebar to refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('conversationCreated', {
          detail: { conversationId: conversation.id }
        }));
      }

      return {
        success: true,
        data: conversation
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to create conversation'
    };
  } catch (error: any) {
    console.error('Error creating conversation:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while creating the conversation'
    };
  }
};

/**
 * Get document status from a conversation
 * @param conversationId - ID of the conversation
 * @param documentId - ID of the document
 * @returns Promise with document data or error
 */
const getDocumentStatus = async (conversationId: string, documentId: string): Promise<ConversationServiceResponse> => {
  try {
    if (!conversationId || !documentId) {
      return {
        success: false,
        error: 'Conversation ID and Document ID are required'
      };
    }

    const url = `${API_ENDPOINT}/conversations/${conversationId}/documents/${documentId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'GET'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200) {
      const document = await response.json();
      return {
        success: true,
        data: document
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to get document status'
    };
  } catch (error: any) {
    console.error('Error getting document status:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while getting the document status'
    };
  }
};

/**
 * Update a conversation's title
 * @param conversationId - The conversation ID
 * @param title - New title
 * @returns Promise with updated conversation data or error
 */
const updateConversation = async (conversationId: string, title: string): Promise<ConversationServiceResponse> => {
  try {
    if (!conversationId || !conversationId.trim()) {
      return { success: false, error: 'Conversation ID is required' };
    }

    if (!title || !title.trim()) {
      return { success: false, error: 'Conversation title is required' };
    }

    // In local mode, update only in local storage
    if (isLocalMode()) {
      const existing = await storageService.getConversation(conversationId);
      if (existing) {
        existing.title = title.trim();
        existing.updated_at = new Date().toISOString();
        await storageService.saveConversation(existing);
        return { success: true, data: existing };
      }
      return { success: false, error: 'Conversation not found' };
    }

    const url = `${API_ENDPOINT}/conversations/${conversationId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: title.trim()
      })
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.ok) {
      const conversation = await response.json();

      // Update in local storage
      await storageService.saveConversation(conversation);

      return {
        success: true,
        data: conversation
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to update conversation'
    };
  } catch (error: any) {
    console.error('Error updating conversation:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while updating the conversation'
    };
  }
};

/**
 * Delete a conversation
 * @param conversationId - The conversation ID to delete
 * @returns Promise indicating success or failure
 */
const deleteConversation = async (conversationId: string): Promise<ConversationServiceResponse> => {
  try {
    if (!conversationId) {
      return { success: false, error: 'Conversation ID is required' };
    }

    // In local mode, just delete from local storage
    if (isLocalMode()) {
      await storageService.deleteConversation(conversationId);
      console.log('[ConversationService] Deleted conversation from local storage:', conversationId);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('conversationDeleted', {
          detail: { conversationId }
        }));
      }

      return { success: true };
    }

    const url = `${API_ENDPOINT}/conversations/${conversationId}`;
    console.log('[ConversationService] Deleting conversation from API:', url);

    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'DELETE'
    });

    console.log('[ConversationService] Delete response status:', response?.status);

    if (!response) {
      console.error('[ConversationService] No response from server');
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 204) {
      console.log('[ConversationService] Successfully deleted conversation from API');

      // Delete from local storage
      await storageService.deleteConversation(conversationId);
      console.log('[ConversationService] Deleted conversation from local storage');

      // Dispatch event for sidebar to refresh
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('conversationDeleted', {
          detail: { conversationId }
        }));
      }

      return {
        success: true
      };
    }

    const errorData = await response.json().catch(() => ({}));
    console.error('[ConversationService] Delete failed with status:', response.status, errorData);
    return {
      success: false,
      error: errorData.detail || errorData.message || `Failed to delete conversation (status: ${response.status})`
    };
  } catch (error: any) {
    console.error('[ConversationService] Error deleting conversation:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while deleting the conversation'
    };
  }
};

/**
 * Get a conversation by ID from local storage
 * @param conversationId - ID of the conversation
 * @returns Promise with conversation data or error
 */
const getConversation = async (conversationId: string): Promise<ConversationServiceResponse> => {
  try {
    if (!conversationId) {
      return {
        success: false,
        error: 'Conversation ID is required'
      };
    }

    // Get from local storage
    const localConversation = await storageService.getConversation(conversationId);
    if (localConversation) {
      return {
        success: true,
        data: localConversation
      };
    }

    return {
      success: false,
      error: 'Conversation not found in local storage'
    };
  } catch (error: any) {
    console.error('Error fetching conversation:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while fetching the conversation'
    };
  }
};

/**
 * Get all conversations from local storage
 * @returns Promise with array of conversations
 */
const getAllConversations = async (): Promise<ConversationServiceResponse> => {
  try {
    const conversations = await storageService.getConversations();
    return {
      success: true,
      data: conversations
    };
  } catch (error: any) {
    console.error('Error getting conversations:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while getting conversations'
    };
  }
};

/**
 * Sync conversations from the server
 * Fetches all conversations with their messages from the API and updates local storage
 * @returns Promise with synced conversations or error
 */
const syncConversationsFromServer = async (): Promise<ConversationServiceResponse> => {
  // Skip remote sync in local mode
  if (isLocalMode()) {
    console.log('[ConversationService] Local mode - skipping remote sync');
    const conversations = await storageService.getConversations();
    return { success: true, data: conversations };
  }

  try {
    const url = `${API_ENDPOINT}/conversations`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'GET'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.ok) {
      const conversations = await response.json();

      // Save all conversations to local storage
      await storageService.saveConversations(conversations);

      console.log(`[ConversationService] Synced ${conversations.length} conversations from server`);

      return {
        success: true,
        data: conversations
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to sync conversations'
    };
  } catch (error: any) {
    console.error('Error syncing conversations from server:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while syncing conversations'
    };
  }
};

/**
 * Get a conversation with messages from the server
 * @param conversationId - ID of the conversation
 * @returns Promise with conversation data including messages or error
 */
const getConversationFromServer = async (conversationId: string): Promise<ConversationServiceResponse> => {
  // In local mode, just return from local storage
  if (isLocalMode()) {
    return getConversation(conversationId);
  }

  try {
    if (!conversationId) {
      return {
        success: false,
        error: 'Conversation ID is required'
      };
    }

    const url = `${API_ENDPOINT}/conversations/${conversationId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'GET'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.ok) {
      const conversation = await response.json();

      // Save to local storage
      await storageService.saveConversation(conversation);

      // Save messages if they exist
      if (conversation.messages && Array.isArray(conversation.messages)) {
        await storageService.saveMessages(conversationId, conversation.messages);
      }

      return {
        success: true,
        data: conversation
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to get conversation'
    };
  } catch (error: any) {
    console.error('Error getting conversation from server:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while getting the conversation'
    };
  }
};

/**
 * Update conversation with new message
 * Adds a message to the conversation's message list in local storage
 * Prevents duplicate messages and ensures proper user/assistant alternation
 * @param conversationId - ID of the conversation
 * @param message - The message object to add
 * @returns Promise indicating success or failure
 */
const addMessageToConversation = async (conversationId: string, message: any): Promise<ConversationServiceResponse> => {
  try {
    if (!conversationId) {
      return {
        success: false,
        error: 'Conversation ID is required'
      };
    }

    // Get existing messages
    const messages = await storageService.getMessages(conversationId);

    // Check if message already exists (by id)
    const messageExists = messages.some((m: any) => m.id === message.id);
    if (messageExists) {
      console.log(`[ConversationService] Message ${message.id} already exists, skipping duplicate`);
      return {
        success: true,
        data: messages
      };
    }

    // Check if last message has the same role (prevent consecutive messages with same role)
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.role === message.role) {
      console.warn(`[ConversationService] Skipping duplicate ${message.role} message. Last message role: ${lastMessage.role}`);
      return {
        success: true,
        data: messages
      };
    }

    // Add new message
    const updatedMessages = [...messages, message];

    // Save back to storage
    await storageService.saveMessages(conversationId, updatedMessages);

    // Update conversation's message count/timestamp
    const conversation = await storageService.getConversation(conversationId);
    if (conversation) {
      conversation.updated_at = new Date().toISOString();
      await storageService.saveConversation(conversation);
    }

    return {
      success: true,
      data: updatedMessages
    };
  } catch (error: any) {
    console.error('Error adding message to conversation:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while adding the message'
    };
  }
};

/**
 * Sync conversation messages to server
 * Updates the conversation on the server with all messages from local storage
 * @param conversationId - ID of the conversation
 * @returns Promise indicating success or failure
 */
const syncMessagesToServer = async (conversationId: string): Promise<ConversationServiceResponse> => {
  // Skip remote sync in local mode
  if (isLocalMode()) {
    console.log('[ConversationService] Local mode - skipping remote message sync');
    return { success: true };
  }

  try {
    if (!conversationId) {
      return {
        success: false,
        error: 'Conversation ID is required'
      };
    }

    // Get messages from local storage (already in API format with role & content)
    const messages = await storageService.getMessages(conversationId);

    console.log(`[ConversationService] Syncing ${messages.length} messages to server`);
    if (messages.length > 0) {
      console.log('[ConversationService] Sample message:', messages[0]);
    }

    // Send to server using PATCH
    const url = `${API_ENDPOINT}/conversations/${conversationId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages })
    });

    if (!response) {
      console.warn('[ConversationService] No response from server when syncing messages');
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.ok) {
      console.log(`[ConversationService] Successfully synced ${messages.length} messages to server for conversation ${conversationId}`);
      return {
        success: true,
        data: messages
      };
    }

    const errorData = await response.json().catch(() => ({}));
    console.warn('[ConversationService] Failed to sync messages to server:', errorData);
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to sync messages to server'
    };
  } catch (error: any) {
    console.error('Error syncing messages to server:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while syncing messages'
    };
  }
};

/**
 * Add message and sync to server
 * Adds a message locally and immediately syncs to server
 * @param conversationId - ID of the conversation
 * @param message - The message object to add
 * @returns Promise indicating success or failure
 */
const addMessageAndSync = async (conversationId: string, message: any): Promise<ConversationServiceResponse> => {
  try {
    // Add message locally first
    const addResult = await addMessageToConversation(conversationId, message);

    if (!addResult.success) {
      return addResult;
    }

    // Sync to server (don't block on failure)
    syncMessagesToServer(conversationId).catch(error => {
      console.warn('[ConversationService] Failed to sync messages to server (non-blocking):', error);
    });

    return addResult;
  } catch (error: any) {
    console.error('Error adding message and syncing:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while adding message'
    };
  }
};

/**
 * Update conversation messages directly (without local storage)
 * Syncs messages directly to the server - used when user.conversations is the source of truth
 * @param conversationId - ID of the conversation
 * @param messages - Array of messages to sync
 * @returns Promise indicating success or failure
 */
const updateConversationMessages = async (conversationId: string, messages: any[]): Promise<ConversationServiceResponse> => {
  // Skip remote sync in local mode - just save locally
  if (isLocalMode()) {
    console.log(`[ConversationService] Local mode - saving ${messages.length} messages locally`);
    await storageService.saveMessages(conversationId, messages);
    return { success: true, data: messages };
  }

  try {
    if (!conversationId) {
      return {
        success: false,
        error: 'Conversation ID is required'
      };
    }

    console.log(`[ConversationService] Updating ${messages.length} messages for conversation ${conversationId}`);

    // Send to server using PATCH
    const url = `${API_ENDPOINT}/conversations/${conversationId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ messages })
    });

    if (!response) {
      console.warn('[ConversationService] No response from server when updating messages');
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.ok) {
      console.log(`[ConversationService] Successfully updated ${messages.length} messages for conversation ${conversationId}`);
      return {
        success: true,
        data: messages
      };
    }

    const errorData = await response.json().catch(() => ({}));
    console.warn('[ConversationService] Failed to update messages:', errorData);
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to update messages'
    };
  } catch (error: any) {
    console.error('Error updating conversation messages:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while updating messages'
    };
  }
};

export const conversationService = {
  createConversation,
  updateConversation,
  getDocumentStatus,
  deleteConversation,
  getConversation,
  getAllConversations,
  syncConversationsFromServer,
  getConversationFromServer,
  addMessageToConversation,
  syncMessagesToServer,
  addMessageAndSync,
  updateConversationMessages
};
