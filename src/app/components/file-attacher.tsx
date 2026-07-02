import { useState, useRef, useEffect, useCallback } from 'react';
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
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
  showDragDrop?: boolean;
  maxFileSize?: number; // in MB
  clearTrigger?: number; // Increment this to trigger clear from parent

  externalDrop?: { file: File; id: number } | null; // Forwarded from parent drag/drop
}

export default function FileAttacher({
  onSuccess,
  onError,
  onClear,
  onUploadingChange,
  disabled = false,
  size = 'small',
  showDragDrop = false,
  maxFileSize = 20,
  clearTrigger = 0,
  externalDrop = null,
}: FileAttacherProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploadingRaw] = useState(false);
  const setIsUploading = (val: boolean) => {
    setIsUploadingRaw(val);
    onUploadingChange?.(val);
  };
  const [attachError, setAttachError] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevClearTrigger = useRef(clearTrigger);

  const isSmall = size === 'small';

  // Handle external drop forwarded from parent
  const handleFileSelectRef = useRef<(file: File) => Promise<void>>(null as any);
  useEffect(() => {
    if (externalDrop && handleFileSelectRef.current) {
      handleFileSelectRef.current(externalDrop.file);
    }
  }, [externalDrop?.id]);

  // Handle external clear trigger
  useEffect(() => {
    if (clearTrigger !== prevClearTrigger.current) {
      prevClearTrigger.current = clearTrigger;
      setSelectedFile(null);
      setAttachError('');
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
    setAttachError('');

    try {
      // Upload as asset to local SLP server (POST /v1/assets)
      const uploadResult = await documentService.uploadAsset(file);

      if (!uploadResult.success || !uploadResult.data) {
        throw new Error(uploadResult.error || 'Failed to upload asset');
      }

      const asset = uploadResult.data;

      if (asset.id) {
        setAttachError('');
        setIsUploading(false);
        onSuccess(asset.id, file.name);
      } else {
        throw new Error('Asset upload did not return a valid ID');
      }
    } catch (error: any) {
      console.error('Failed to upload asset:', error);
      const errorMessage = error.message || 'Failed to upload asset';
      setAttachError(errorMessage);
      setIsUploading(false);
      if (onError) onError(errorMessage);
    }
  };

  const handleFileSelect = useCallback(async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setSelectedFile(file); // show error state in UI
      setAttachError(validationError);
      if (onError) onError(validationError);
      return;
    }

    setSelectedFile(file);
    setAttachError('');

    // Start upload immediately
    await uploadFile(file);
  }, [maxFileSize, onError]);

  // Keep ref in sync so external drop useEffect can call it
  handleFileSelectRef.current = handleFileSelect;

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
      e.target.value = '';
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setAttachError('');
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
        className="inline-flex items-center gap-2 px-2 py-1 border border-sl-border-subtle rounded-sm"
        style={{ backgroundColor: 'var(--sl-white-alpha-7)' }}
        sx={{ height: isSmall ? '28px' : '40px' }}
      >
        {isUploading ? (
          <>
            <CircularProgress size={isSmall ? 14 : 24} sx={{ color: 'var(--sl-brand-primary)' }} />
            <Box className={`text-sl-text-tertiary ${isSmall ? 'text-xs' : 'text-sm'}`}>
              {attachError && (attachError.toLowerCase().includes('processing') || attachError.toLowerCase().includes('attachment')) ? attachError : 'Attaching...'}
            </Box>
          </>
        ) : attachError ? (
          <>
            <CloseIcon sx={{ color: 'var(--sl-status-error)', fontSize: isSmall ? 14 : 24 }} />
            <Box
              className={`text-sl-status-error ${isSmall ? 'text-xs' : 'text-sm'} whitespace-nowrap`}
              title={attachError}
            >
              {attachError}
            </Box>
          </>
        ) : (
          <>
            <InsertDriveFileIcon sx={{ color: 'var(--sl-status-success)', fontSize: isSmall ? 14 : 24 }} />
            <Box className={`text-sl-text-primary ${isSmall ? 'text-xs' : 'text-sm'} truncate ${isSmall ? 'max-w-[140px]' : 'max-w-[200px]'}`}>
              {selectedFile.name}
            </Box>
          </>
        )}
        {!isUploading && (
          <IconButton
            onClick={handleClear}
            size="small"
            sx={{
              color: 'var(--sl-text-muted)',
              '&:hover': { color: 'var(--sl-status-error)' },
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
        <Box className="absolute inset-0 flex items-center justify-center rounded-lg pointer-events-none z-10" sx={{ bgcolor: 'var(--sl-brand-alpha-10)' }}>
          <CloudUploadIcon sx={{ fontSize: 32, color: 'var(--sl-brand-primary)' }} />
        </Box>
      )}
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 px-2 py-1 border border-sl-border-subtle rounded-sm hover:border-sl-border-hover text-sl-text-muted hover:text-sl-text-tertiary transition-all text-xs"
        style={{ backgroundColor: 'var(--sl-white-alpha-7)', height: isSmall ? '28px' : '40px' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-10)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-7)'; }}
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
