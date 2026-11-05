import { useState, useRef, useEffect, useCallback } from 'react';
import { Box, IconButton, CircularProgress } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { documentService } from '@/app/services/document.service';

// Qwen2-VL / Qwen2.5-VL process images as 28x28 patches, so token cost scales
// with pixel count. A 2B model parses reliably when the long edge is capped
// around 1024px (~36x36 patches) — downscale before upload to keep the image
// legible while avoiding oversized, token-heavy inputs.
const MAX_IMAGE_EDGE = 1024;

const isResizableImage = (file: File): boolean =>
  file.type === 'image/png' || file.type === 'image/jpeg';

// Downscale an image so its longest edge is <= MAX_IMAGE_EDGE, preserving aspect
// ratio. Returns the original file untouched if it's already small enough or if
// anything goes wrong (so upload still proceeds).
const resizeImageForVision = async (file: File): Promise<File> => {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const longest = Math.max(width, height);

    if (longest <= MAX_IMAGE_EDGE) {
      bitmap.close();
      return file;
    }

    const scale = MAX_IMAGE_EDGE / longest;
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    bitmap.close();

    // Re-encode as JPEG unless the source is a PNG (preserve transparency/format).
    const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, outType, 0.85)
    );
    if (!blob) return file;

    return new File([blob], file.name, { type: outType, lastModified: file.lastModified });
  } catch (err) {
    console.warn('[FileAttacher] Image resize failed, uploading original:', err);
    return file;
  }
};

interface FileAttacherProps {
  conversation?: any; // Made optional since v2 endpoint doesn't require it
  onSuccess: (documentId: string, fileName: string) => void;
  onError?: (error: string) => void;
  onClear?: () => void;
  onUploadingChange?: (uploading: boolean) => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
  showDragDrop?: boolean;
  clearTrigger?: number; // Increment this to trigger clear from parent
  allowImages?: boolean; // Accept PNG/JPG — only when a vision model is enabled (backend OCRs them)

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
  clearTrigger = 0,
  allowImages = false,
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
      'application/json',
      // Images are OCR'd/described by the vision model on the SLP backend —
      // only accepted when a vision-capable model is enabled.
      ...(allowImages ? ['image/png', 'image/jpeg'] : []),
    ];

    // Also check file extension as fallback (especially for JSON files)
    const allowedExtensions = ['.pdf', '.docx', '.txt', '.csv', '.json', '.md', ...(allowImages ? ['.png', '.jpg', '.jpeg'] : [])];
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

    // Check by MIME type OR by file extension
    const isValidType = allowedTypes.includes(file.type) || allowedExtensions.includes(fileExtension);

    if (!isValidType) {
      return `Invalid file type. Supported: PDF, DOCX, TXT, CSV, JSON${allowImages ? ', PNG, JPG' : ''}`;
    }
    return null;
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setAttachError('');

    try {
      // Downscale large images so a vision-capable SLM (e.g. Qwen2-VL 2B) can
      // parse them without oversized, token-heavy inputs. Non-images pass through.
      const uploadTarget = isResizableImage(file) ? await resizeImageForVision(file) : file;

      // Upload as asset to local SLP server (POST /v1/assets)
      const uploadResult = await documentService.uploadAsset(uploadTarget);

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
  }, [onError]);

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
        className="inline-flex items-center gap-2 px-2 border border-sl-border-default rounded-md"
        style={{ backgroundColor: 'var(--sl-white-alpha-7)' }}
        sx={{ height: isSmall ? '28px' : '40px', boxSizing: 'border-box' }}
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
        className="flex items-center gap-1.5 px-2 border border-sl-border-default rounded-md hover:border-sl-border-hover text-sl-text-muted hover:text-sl-text-tertiary transition-all text-xs leading-4"
        style={{ backgroundColor: 'var(--sl-white-alpha-7)', height: isSmall ? '28px' : '40px', boxSizing: 'border-box' }}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-10)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--sl-white-alpha-7)'; }}
        disabled={disabled || isUploading}
      >
        <AttachFileIcon sx={{ fontSize: isSmall ? 15 : 18 }} />
        <span>Attach</span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={`.pdf,.docx,.txt,.csv,.json,.md${allowImages ? ',.png,.jpg,.jpeg' : ''}`}
        onChange={handleFileInputChange}
        className="hidden"
      />
    </Box>
  );
}
