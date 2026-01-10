import { API_ENDPOINT } from "@/app/constants";
import { userService } from "./user.service";
import { storageService } from "./storage.service";

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
      return {
        success: false,
        error: 'Conversation ID is required'
      };
    }

    if (!title || !title.trim()) {
      return {
        success: false,
        error: 'Conversation title is required'
      };
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
      return {
        success: false,
        error: 'Conversation ID is required'
      };
    }

    const url = `${API_ENDPOINT}/conversations/${conversationId}`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'DELETE'
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 204) {
      // Delete from local storage
      await storageService.deleteConversation(conversationId);
      
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
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to delete conversation'
    };
  } catch (error: any) {
    console.error('Error deleting conversation:', error);
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

export const conversationService = {
  createConversation,
  updateConversation,
  getDocumentStatus,
  deleteConversation,
  getConversation,
  getAllConversations
};
