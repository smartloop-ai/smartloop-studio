import { Box, IconButton, CircularProgress } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';

interface DocumentsSidebarProps {
  selectedProject: any;
  currentProjectData: any;
  onAddDocument: () => void;
}

export default function DocumentsSidebar({
  selectedProject,
  currentProjectData,
  onAddDocument,
}: DocumentsSidebarProps) {
  return (
    <Box
      className="border-l border-gray-900 overflow-y-auto"
      sx={{
        width: { xs: '0', md: '30%' },
        display: { xs: 'none', md: 'block' },
      }}
    >
      <Box className="p-3">
        <Box className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Documents
          </span>
          {selectedProject && (
            <IconButton
              onClick={onAddDocument}
              size="small"
              sx={{
                color: '#9ca3af',
                padding: '4px',
                '&:hover': {
                  color: '#ec4899',
                  bgcolor: 'rgba(236, 72, 153, 0.1)',
                },
              }}
              title="Add document"
            >
              <AddBoxIcon fontSize="small" />
            </IconButton>
          )}
        </Box>
        {selectedProject && currentProjectData ? (
          currentProjectData.documents && currentProjectData.documents.length > 0 ? (
            <Box className="space-y-2">
              {currentProjectData.documents.map((doc: any, i: number) => (
                <Box
                  key={`doc-${i}`}
                  sx={{
                    padding: '10px',
                    borderRadius: '6px',
                    bgcolor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      bgcolor: 'rgba(255, 255, 255, 0.04)',
                      borderColor: 'rgba(255, 255, 255, 0.08)',
                    },
                  }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-xs text-white font-medium truncate flex-1">
                      {doc.filename || doc.name || 'Untitled'}
                    </span>
                    {doc.is_processing || (!doc.num_of_tokens && doc.num_of_tokens !== 0) ? (
                      <CircularProgress size={10} sx={{ color: '#9ca3af' }} />
                    ) : null}
                  </div>
                  <div className="text-xs text-gray-500">
                    {doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : ''}
                    {doc.num_of_tokens && doc.num_of_tokens > 0 ? (
                      <span className="ml-2">
                        • <span style={{ color: '#ec4899' }}>{Math.ceil(doc.num_of_tokens / 100)} credits</span>
                      </span>
                    ) : null}
                  </div>
                </Box>
              ))}
            </Box>
          ) : (
            <Box className="text-center py-8">
              <Box className="text-gray-500 text-xs mb-3">No documents yet</Box>
              <button
                onClick={onAddDocument}
                className="text-xs px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded-sm transition-colors"
              >
                Add Document
              </button>
            </Box>
          )
        ) : (
          <Box className="text-gray-500 text-xs py-4 text-center">
            Select a project to view documents
          </Box>
        )}
      </Box>
    </Box>
  );
}
