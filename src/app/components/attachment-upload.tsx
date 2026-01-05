import { Box, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

interface AttachmentUploadProps {
  fileName: string;
  isUploading: boolean;
  uploadError?: string;
  onClear?: () => void;
  size?: 'small' | 'medium';
}

export default function AttachmentUpload({
  fileName,
  isUploading,
  uploadError,
  onClear,
  size = 'small',
}: AttachmentUploadProps) {
  const isSmall = size === 'small';

  return (
    <Box
      className="inline-flex items-center gap-2 px-2 py-1 bg-gray-800/50 border border-gray-700 rounded-lg"
      sx={{ height: isSmall ? '28px' : '40px' }}
    >
      {isUploading ? (
        <>
          <CircularProgress size={isSmall ? 14 : 24} sx={{ color: '#ec4899' }} />
          <Box className={`text-gray-300 ${isSmall ? 'text-xs' : 'text-sm'}`}>
            {uploadError && uploadError.toLowerCase().includes('processing') ? uploadError : 'Uploading...'}
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
            {fileName}
          </Box>
        </>
      )}
      {!isUploading && onClear && (
        <IconButton
          onClick={onClear}
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
