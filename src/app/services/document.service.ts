import { API_BASE_URL } from "@/app/constants";
import { userService } from "./user.service";

/**
 * Document Service
 * Handles document upload and management using v2 API
 */

interface DocumentServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Upload a document as attachment using /v2/documents endpoint
 * This endpoint is decoupled from conversations - documents can be uploaded
 * independently and then attached to conversations later
 * @param file - File to upload
 * @returns Promise with document data or error
 */
const uploadDocument = async (file: File): Promise<DocumentServiceResponse> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    // Use API_BASE_URL to avoid /v1 prefix, constructing /v2/documents directly
    const url = `${API_BASE_URL}/v2/documents`;
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

    // Handle specific error status codes
    const errorData = await response.json().catch(() => ({}));
    let errorMessage = errorData.detail || errorData.message || 'Failed to upload document';

    if (response.status === 429) {
      errorMessage = 'Credit limit exceeded. Please upgrade your account or reach out to us at support@smartloop.ai';
    } else if (response.status === 401 || response.status === 403) {
      errorMessage = 'Authentication error. Please log in again.';
    } else if (response.status >= 500) {
      errorMessage = 'Server error. Please try again later.';
    }

    return {
      success: false,
      error: errorMessage
    };
  } catch (error: any) {
    console.error('Error uploading document:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while uploading the document'
    };
  }
};

export const documentService = {
  uploadDocument
};
