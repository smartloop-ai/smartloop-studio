import { API_ENDPOINT } from "@/app/constants";
import { userService } from "./user.service";

/**
 * Conversation Service
 * Handles conversation creation and management
 */

interface CreateConversationParams {
  title: string;
  project_id?: string;
}

interface ConversationServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Create a new conversation
 * @param params - Conversation creation parameters (title, optional project_id)
 * @returns Promise with conversation data or error
 */
const createConversation = async (params: CreateConversationParams): Promise<ConversationServiceResponse> => {
  try {
    const { title, project_id } = params;

    if (!title || !title.trim()) {
      return {
        success: false,
        error: 'Conversation title is required'
      };
    }

    const url = `${API_ENDPOINT}/conversations`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: title.trim(),
        project_id
      })
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 201) {
      const conversation = await response.json();
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
 * Upload a document to a conversation
 * @param conversationId - ID of the conversation
 * @param file - File to upload
 * @returns Promise with document data or error
 */
const uploadDocument = async (conversationId: string, file: File): Promise<ConversationServiceResponse> => {
  try {
    if (!conversationId) {
      return {
        success: false,
        error: 'Conversation ID is required'
      };
    }

    const formData = new FormData();
    formData.append('file', file);

    const url = `${API_ENDPOINT}/conversations/${conversationId}/documents`;
    const response = await userService.makeAuthenticatedRequest(url, {
      method: 'PUT',
      body: formData
    });

    if (!response) {
      return {
        success: false,
        error: 'No response from server'
      };
    }

    if (response.status === 200 || response.status === 201) {
      const document = await response.json();
      return {
        success: true,
        data: document
      };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to upload document'
    };
  } catch (error: any) {
    console.error('Error uploading document:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while uploading the document'
    };
  }
};

/**
 * Delete a conversation
 * @param conversationId - ID of the conversation to delete
 * @returns Promise with success status or error
 */
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

export const conversationService = {
  createConversation,
  uploadDocument,
  getDocumentStatus,
  deleteConversation
};
