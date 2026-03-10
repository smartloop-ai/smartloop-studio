import { useState, useRef, useEffect } from 'react';
import { Box, IconButton, CircularProgress } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { documentService } from '@/app/services/document.service';

interface FileAttacherProps {
  conversation?: any; // Made optional since v2 endpoint doesn't require it
  onSuccess: (documentId: string, fileName: string) => void;
  onError?: (error: string) => void;
  onClear?: () => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
  showDragDrop?: boolean;
  maxFileSize?: number; // in MB
  clearTrigger?: number; // Increment this to trigger clear from parent
}

export default function FileAttacher({
  onSuccess,
  onError,
  onClear,
  disabled = false,
  size = 'small',
  showDragDrop = false,
  maxFileSize = 10,
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
  useEffect(() => {
    if (clearTrigger !== prevClearTrigger.current) {
      prevClearTrigger.current = clearTrigger;
      setSelectedFile(null);
      setUploadError('');
      setIsUploading(false);
    }
  }, [clearTrigger]);

  const validateFile = (file: File): string | null => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/json'
    ];

    // Also check file extension as fallback (especially for JSON files)
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.csv', '.json'];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    const maxSizeBytes = maxFileSize * 1024 * 1024;

    // Check by MIME type OR by file extension
    const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension);

    if (!isValidType) {
      return 'Invalid file type. Supported: PDF, DOCX, TXT, CSV, JSON';
    }
    if (file.size > maxSizeBytes) {
      return `File size exceeds ${maxFileSize}MB limit`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadError('');

    try {
      // Upload as asset to local SLP server (POST /v1/assets)
      const uploadResult = await documentService.uploadAsset(file);

      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error || 'Failed to upload asset');
      }

      const asset = uploadResult.data;

      if (asset.id) {
        setUploadError('');
        setIsUploading(false);
        onSuccess(asset.id, file.name);
      } else {
        throw new Error('Asset upload did not return a valid ID');
      }
    } catch (error: any) {
      console.error('Failed to upload asset:', error);
      const errorMessage = error.message || 'Failed to upload asset';
      setUploadError(errorMessage);
      setIsUploading(false);
      if (onError) onError(errorMessage);
      setSelectedFile(null);
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
        className="inline-flex items-center gap-2 px-2 py-1 bg-gray-800/50 border border-gray-700 rounded-sm"
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
        className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/50 border border-gray-700 rounded-sm hover:bg-gray-800/70 hover:border-gray-600 text-gray-400 hover:text-gray-300 transition-all text-xs"
        style={{ height: isSmall ? '28px' : '40px' }}
        disabled={disabled || isUploading}
      >
        <AttachFileIcon sx={{ fontSize: isSmall ? 14 : 18 }} />
        <span>Attach</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.txt,.csv,.json"
        onChange={handleFileInputChange}
        className="hidden"
      />
    </Box>
  );
}
