import { API_BASE_URL, getLocalApiEndpoint } from "@/app/constants";
import { userService } from "./user.service";

/**
 * Document Service
 * Handles document upload and management
 * Local SLP service uses file path based upload via POST /v1/documents
 * Remote uses multipart upload via PUT /v2/documents
 */

interface DocumentServiceResponse {
  success: boolean;
  data?: any;
  error?: string;
}

/**
 * Get all documents for the current project from the local SLP service
 * @returns Promise with document list or error
 */
const getLocalDocuments = async (projectId: string): Promise<DocumentServiceResponse> => {
  try {
    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects/${projectId}/documents`;
    const response = await fetch(url);

    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to fetch documents'
    };
  } catch (error: any) {
    console.error('Error fetching local documents:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while fetching documents'
    };
  }
};

/**
 * Add a document to the local SLP service using a file path
 * @param filePath - Absolute path to the file on disk
 * @returns Promise with document data or error
 */
const addLocalDocument = async (
  projectId: string,
  filePath: string,
  onProgress?: (progress: { percent: number; status: string; event?: string; documents?: any[] }) => void,
  cwd?: string,
  generateFilename?: boolean
): Promise<DocumentServiceResponse> => {
  try {
    const api = (window as any).electronAPI;

    // Use IPC proxy through main process to avoid CORS/Broken Pipe
    if (api?.slpAddDocument) {
      if (onProgress && api.onSlpDocumentProgress) {
        api.removeSlpDocumentProgressListener?.();
        api.onSlpDocumentProgress((data: { percent: number; status: string; event?: string; documents?: any[] }) => {
          onProgress(data);
        });
      }

      const result = await api.slpAddDocument(filePath, projectId, cwd, generateFilename);

      api.removeSlpDocumentProgressListener?.();
      if (onProgress) onProgress({ percent: 100, status: 'Complete', event: 'done' });

      return result;
    }

    return { success: false, error: 'Electron API not available' };
  } catch (error: any) {
    console.error('Error adding local document:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while adding the document'
    };
  }
};

/**
 * Upload a file as an asset to the local SLP service via POST /v1/assets (multipart)
 * Returns asset_id which can be referenced in chat message attachments
 * @param file - File to upload
 * @returns Promise with asset data (asset_id, filename, etc.) or error
 */
const uploadAsset = async (file: File): Promise<DocumentServiceResponse> => {
  try {
    const localBase = await getLocalApiEndpoint();
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${localBase}/v1/assets`, {
      method: 'POST',
      body: formData
    });

    if (response.status === 200 || response.status === 201) {
      const asset = await response.json();
      // Return with id mapped from asset_id for consistency
      return { success: true, data: { id: asset.asset_id, ...asset } };
    }

    const errorData = await response.json().catch(() => ({}));
    const rawError = errorData.detail || errorData.message || 'Failed to upload asset';
    const normalized = normalizeAssetUploadError(rawError, response.status, errorData);
    return { success: false, error: normalized };
  } catch (error: any) {
    console.error('Error uploading asset:', error);
    return {
      success: false,
      error: normalizeAssetUploadError(error.message, undefined, undefined) || 'An error occurred while uploading the asset'
    };
  }
};

/**
 * Translate backend asset-upload errors into friendly, user-facing messages.
 * The SLP service raises a ValueError when a file exceeds the configured
 * size limit — surface that as "Size limit exceeded for attachment" and
 * append the token count when the backend returns one.
 */
const normalizeAssetUploadError = (
  message: string | undefined,
  status: number | undefined,
  errorData: any
): string => {
  const msg = (message || '').toString();
  const isSizeError =
    status === 413 ||
    /valueerror/i.test(msg) ||
    /size limit/i.test(msg) ||
    /too large/i.test(msg) ||
    /exceeds?/i.test(msg);
  if (!isSizeError) return msg;

  const tokens = extractTokenCount(errorData, msg);
  return tokens != null
    ? `Size limit exceeded (${tokens.toLocaleString()} tokens)`
    : 'Size limit exceeded';
};

const extractTokenCount = (errorData: any, msg: string): number | null => {
  const candidates = [
    errorData?.tokens,
    errorData?.token_count,
    errorData?.tokenCount,
    errorData?.detail?.tokens,
    errorData?.detail?.token_count,
  ];
  for (const c of candidates) {
    const n = typeof c === 'number' ? c : typeof c === 'string' ? parseInt(c, 10) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  const match = msg.match(/([\d,]+)\s*tokens?/i);
  if (match) {
    const n = parseInt(match[1].replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
};

/**
 * Upload a document as attachment using /v2/documents endpoint (remote)
 * Kept as fallback for non-local scenarios
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

/**
 * Delete a document from the local SLP service
 * @param documentId - ID of the document to delete
 * @returns Promise with result or error
 */
const deleteLocalDocument = async (projectId: string, documentId: string): Promise<DocumentServiceResponse> => {
  try {
    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects/${projectId}/documents/${documentId}`;
    const response = await fetch(url, { method: 'DELETE' });

    if (response.status === 200 || response.status === 204) {
      const data = await response.json().catch(() => ({ deleted: true }));
      return { success: true, data };
    }

    const errorData = await response.json().catch(() => ({}));
    return {
      success: false,
      error: errorData.detail || errorData.message || 'Failed to delete document'
    };
  } catch (error: any) {
    console.error('Error deleting local document:', error);
    return {
      success: false,
      error: error.message || 'An error occurred while deleting the document'
    };
  }
};

const getLocalDocument = async (projectId: string, documentId: string): Promise<DocumentServiceResponse> => {
  try {
    const localBase = await getLocalApiEndpoint();
    const url = `${localBase}/v1/projects/${projectId}/documents/${documentId}`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      return { success: true, data };
    }
    return { success: false, error: 'Not found' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const documentService = {
  uploadDocument,
  uploadAsset,
  addLocalDocument,
  deleteLocalDocument,
  getLocalDocuments,
  getLocalDocument
};
