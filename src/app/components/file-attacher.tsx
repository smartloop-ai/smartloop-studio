import { useState, useRef } from 'react';
import { Box, IconButton, CircularProgress } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { conversationService } from '@/app/services/conversation.service';

interface FileAttacherProps {
  conversationId: string | null;
  onSuccess: (documentId: string, fileName: string) => void;
  onError?: (error: string) => void;
  onClear?: () => void;
  onCreateConversation?: (fileName: string) => Promise<string | null>; // Returns conversationId
  disabled?: boolean;
  size?: 'small' | 'medium';
  showDragDrop?: boolean;
  maxFileSize?: number; // in MB
  clearTrigger?: number; // Increment this to trigger clear from parent
}

export default function FileAttacher({
  conversationId,
  onSuccess,
  onError,
  onClear,
  onCreateConversation,
  disabled = false,
  size = 'small',
  showDragDrop = false,
  maxFileSize = 5,
  clearTrigger = 0,
}: FileAttacherProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevClearTrigger = useRef(clearTrigger);

  const isSmall = size === 'small';

  // Handle external clear trigger
  if (clearTrigger !== prevClearTrigger.current) {
    prevClearTrigger.current = clearTrigger;
    setSelectedFile(null);
    setUploadError('');
    setIsUploading(false);
  }

  const validateFile = (file: File): string | null => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv'
    ];
    const maxSizeBytes = maxFileSize * 1024 * 1024;

    if (!allowedTypes.includes(file.type)) {
      return 'Invalid file type. Supported: PDF, DOCX, TXT, CSV';
    }
    if (file.size > maxSizeBytes) {
      return `File size exceeds ${maxFileSize}MB limit`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    let activeConversationId = conversationId;

    // Create conversation if needed
    if (!activeConversationId && onCreateConversation) {
      try {
        activeConversationId = await onCreateConversation(file.name);
        if (!activeConversationId) {
          throw new Error('Failed to create conversation');
        }
      } catch (error: any) {
        const errorMessage = error.message || 'Failed to create conversation';
        setUploadError(errorMessage);
        if (onError) onError(errorMessage);
        return;
      }
    }

    if (!activeConversationId) {
      const error = 'No conversation ID available';
      setUploadError(error);
      if (onError) onError(error);
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      // Upload document
      const uploadResult = await conversationService.uploadDocument(
        activeConversationId,
        file
      );

      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error || 'Failed to upload document');
      }

      const document = uploadResult.data;

      // Update status to show processing
      setUploadError('Processing attachment...');

      // Poll for document processing completion
      const maxAttempts = 60;
      let attempts = 0;
      let isProcessing = true;
      let finalDocStatus: any = null;

      while (isProcessing && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const statusResult = await conversationService.getDocumentStatus(
          activeConversationId,
          document.id
        );

        if (statusResult.success && statusResult.data) {
          finalDocStatus = statusResult.data;
          if (
            finalDocStatus.is_processing === false ||
            (finalDocStatus.num_of_tokens && finalDocStatus.num_of_tokens > 0)
          ) {
            isProcessing = false;
            console.log('Document processing completed:', finalDocStatus);
          }
        }

        attempts++;
      }

      if (isProcessing) {
        console.warn('Document processing timed out, but continuing anyway');
      }

      // Check for token limit
      const hasTokenLimit = finalDocStatus?.is_token_limit_reached === true;

      if (hasTokenLimit) {
        const error = finalDocStatus?.error || 'Token limit reached for this document';
        setUploadError(error);
        setIsUploading(false);
        if (onError) onError(error);
      } else {
        // Success - store document ID and notify parent
        setUploadError('');
        setIsUploading(false);
        onSuccess(document.id, file.name);
      }
    } catch (error: any) {
      console.error('Failed to upload document:', error);
      const errorMessage = error.message || 'Failed to upload document';
      setUploadError(errorMessage);
      setIsUploading(false);
      if (onError) onError(errorMessage);

      // Clear file only for non-token-limit errors
      const isTokenLimitError = error.is_token_limit_reached === true;
      if (!isTokenLimitError) {
        setSelectedFile(null);
      }
    }
  };

  const handleFileSelect = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setUploadError(validationError);
      if (onError) onError(validationError);
      return;
    }

    setSelectedFile(file);
    setUploadError('');

    // Start upload immediately
    await uploadFile(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setUploadError('');
    setIsUploading(false);
    if (onClear) onClear();
  };

  const handleDragOver = (e: React.DragEvent) => {
    if (!showDragDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!showDragDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    if (!showDragDrop) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  if (selectedFile) {
    return (
      <Box
        className="inline-flex items-center gap-2 px-2 py-1 bg-gray-800/50 border border-gray-700 rounded-lg"
        sx={{ height: isSmall ? '28px' : '40px' }}
      >
        {isUploading ? (
          <>
            <CircularProgress size={isSmall ? 14 : 24} sx={{ color: '#ec4899' }} />
            <Box className={`text-gray-300 ${isSmall ? 'text-xs' : 'text-sm'}`}>
              {uploadError && (uploadError.toLowerCase().includes('processing') || uploadError.toLowerCase().includes('attachment')) ? uploadError : 'Uploading...'}
            </Box>
          </>
        ) : uploadError ? (
          <>
            <CloseIcon sx={{ color: '#ef4444', fontSize: isSmall ? 14 : 24 }} />
            <Box className={`text-red-400 ${isSmall ? 'text-xs' : 'text-sm'} truncate ${isSmall ? 'max-w-[200px]' : 'max-w-[300px]'}`}>
              {uploadError}
            </Box>
          </>
        ) : (
          <>
            <InsertDriveFileIcon sx={{ color: '#10b981', fontSize: isSmall ? 14 : 24 }} />
            <Box className={`text-white ${isSmall ? 'text-xs' : 'text-sm'} truncate ${isSmall ? 'max-w-[140px]' : 'max-w-[200px]'}`}>
              {selectedFile.name}
            </Box>
          </>
        )}
        {!isUploading && (
          <IconButton
            onClick={handleClear}
            size="small"
            sx={{
              color: '#9ca3af',
              '&:hover': { color: '#ef4444' },
              padding: isSmall ? '2px' : '4px'
            }}
          >
            <CloseIcon sx={{ fontSize: isSmall ? 12 : 16 }} />
          </IconButton>
        )}
      </Box>
    );
  }

  return (
    <Box
      className="relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && showDragDrop && (
        <Box className="absolute inset-0 flex items-center justify-center bg-pink-500/10 rounded-lg pointer-events-none z-10">
          <CloudUploadIcon sx={{ fontSize: 32, color: '#ec4899' }} />
        </Box>
      )}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/30 border border-gray-800/50 hover:bg-gray-800/50 hover:border-gray-700/50 text-gray-500 hover:text-gray-300 transition-all text-xs"
        style={{ height: isSmall ? '28px' : '40px' }}
        disabled={disabled || isUploading}
      >
        <AttachFileIcon sx={{ fontSize: isSmall ? 14 : 18 }} />
        <span>Attach</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.csv"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </Box>
  );
}
