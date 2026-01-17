import { Box, IconButton, CircularProgress, Tooltip, TextField, InputAdornment } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import SearchIcon from '@mui/icons-material/Search';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { useMemo, useState, useEffect, useRef } from 'react';

interface RightSidebarProps {
  selectedProject: any;
  currentProjectData: any;
  projectRules: string;
  isSavingRules: boolean;
  onRulesChange: (value: string) => void;
  onAddDocument: () => void;
  onDeleteDocument: (doc: any) => void;
}

export default function RightSidebar({
  selectedProject,
  currentProjectData,
  projectRules,
  isSavingRules,
  onRulesChange,
  onAddDocument,
  onDeleteDocument,
}: RightSidebarProps) {
  const [activeSection, setActiveSection] = useState<'rules' | 'documents' | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const editorRef = useRef<any>(null);

  // SimpleMDE editor options
  const editorOptions = useMemo(() => ({
    spellChecker: false,
    status: false,
    toolbar: false,
    minHeight: '300px',
    maxHeight: '500px',
    placeholder: 'Add rules or guidelines for this project...',
  }), []);

  // Collapse sidebar when project changes or when system project is selected
  useEffect(() => {
    setActiveSection(null);
  }, [selectedProject?.id]);

  // Ensure sidebar is collapsed for system projects
  useEffect(() => {
    if (selectedProject?.system && activeSection) {
      setActiveSection(null);
    }
  }, [selectedProject?.system, activeSection]);

  // Adjust editor height when rules section is opened
  useEffect(() => {
    if (activeSection === 'rules' && editorRef.current) {
      setTimeout(() => {
        const codemirror = editorRef.current?.codemirror;
        if (codemirror) {
          codemirror.refresh();
        }
      }, 100);
    }
  }, [activeSection]);

  return (
    <Box
      className="border-l border-gray-900 relative"
      sx={{
        width: { xs: '0', md: activeSection ? '30%' : '48px' },
        minWidth: { xs: '0', md: activeSection ? '320px' : '48px' },
        maxWidth: { xs: '0', md: activeSection ? '450px' : '48px' },
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'row',
        transition: 'width 0.3s ease',
      }}
    >
      {/* Content Area */}
      {activeSection && (
        <Box
          className="flex-1 overflow-y-auto p-3 space-y-4"
          sx={{
            opacity: activeSection ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}
        >
          {/* Section Title and Actions */}
          <Box className="flex items-center justify-between pb-3 mb-4 border-b border-gray-800">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {activeSection === 'documents' ? 'Documents' : activeSection === 'rules' ? 'Rules' : ''}
            </span>
            {selectedProject && activeSection === 'documents' && (
              <button
                onClick={onAddDocument}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pink-600 border border-pink-600 hover:bg-pink-600 hover:text-white rounded-sm transition-colors"
              >
                <AddBoxIcon sx={{ fontSize: 16 }} />
                <span>Add</span>
              </button>
            )}
          </Box>

        {/* Project Rules Section */}
        {activeSection === 'rules' && selectedProject && currentProjectData && (
          <div className="space-y-3 w-full">
            <Box className="flex items-center justify-between">
              <span className="text-xs text-gray-500">
                {projectRules.length}/300
              </span>
            </Box>
            <Box className="relative w-full">
              {isSavingRules && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    zIndex: 10,
                    bgcolor: 'rgba(0, 0, 0, 0.7)',
                    borderRadius: '50%',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <CircularProgress size={14} sx={{ color: '#ec4899' }} />
                </Box>
              )}
              <Box className="markdown-editor-container w-full">
                <SimpleMDE
                  value={projectRules}
                  onChange={onRulesChange}
                  options={editorOptions}
                  getMdeInstance={(instance) => {
                    editorRef.current = instance;
                  }}
                />
              </Box>
            </Box>
            <p className="text-gray-400 text-[10px] leading-relaxed">
              Rules are auto-saved and included with every AI message.
            </p>
          </div>
        )}

        {/* Documents Section */}
        {activeSection === 'documents' && (
          <div className="space-y-3">
          {selectedProject && currentProjectData ? (
            currentProjectData.documents && currentProjectData.documents.length > 0 ? (
              <>
                {/* Search Input */}
                <TextField
                  size="small"
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon sx={{ fontSize: 18, color: '#9ca3af' }} />
                      </InputAdornment>
                    ),
                  }}
                  sx={{
                    width: '100%',
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      fontSize: '0.75rem',
                      '& fieldset': {
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                      },
                      '&:hover fieldset': {
                        borderColor: 'rgba(236, 72, 153, 0.3)',
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: '#ec4899',
                      },
                    },
                    '& .MuiInputBase-input': {
                      color: '#fff',
                      padding: '8px 12px',
                      '&::placeholder': {
                        color: '#9ca3af',
                        opacity: 1,
                      },
                    },
                  }}
                />
              <Box className="space-y-2">
                {currentProjectData.documents
                  .filter((doc: any) => {
                    if (!searchQuery) return true;
                    const query = searchQuery.toLowerCase();
                    const filename = (doc.filename || doc.name || '').toLowerCase();
                    const summary = (doc.summary || '').toLowerCase();
                    const markdown = (doc.markdown || '').toLowerCase();
                    return filename.includes(query) || summary.includes(query) || markdown.includes(query);
                  })
                  .map((doc: any, i: number) => (
                  <Box
                    key={doc.id || `doc-${i}`}
                    onMouseEnter={() => setHoveredDocId(doc.id || `doc-${i}`)}
                    onMouseLeave={() => setHoveredDocId(null)}
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
                      position: 'relative',
                    }}
                  >
                    <Box className="flex items-start gap-2">
                      {/* Document Icon */}
                      <Box
                        sx={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          bgcolor: 'rgba(236, 72, 153, 0.12)',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginTop: '2px',
                        }}
                      >
                        <InsertDriveFileIcon sx={{ fontSize: 16, color: '#ec4899' }} />
                      </Box>

                      {/* Document Content */}
                      <Box className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs text-white font-medium truncate">
                            {doc.filename || doc.name || 'Untitled Document'}
                          </span>
                          {/* Delete Icon - Appears on Hover */}
                          <Tooltip title="Delete Document" arrow>
                            <IconButton
                              size="small"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteDocument(doc);
                              }}
                              sx={{
                                opacity: hoveredDocId === (doc.id || `doc-${i}`) ? 1 : 0,
                                transition: 'opacity 0.15s ease',
                                color: '#9ca3af',
                                bgcolor: 'rgba(239, 68, 68, 0.08)',
                                padding: '4px',
                                '&:hover': {
                                  color: '#ef4444',
                                  bgcolor: 'rgba(239, 68, 68, 0.15)',
                                },
                              }}
                            >
                              <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Tooltip>
                        </div>

                        {/* Document Summary/Markdown Preview */}
                        {(doc.summary || doc.markdown) && (
                          <div
                            className="text-[10px] text-gray-400 leading-relaxed mb-1.5"
                            style={{
                              wordBreak: 'break-word',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                            }}
                          >
                            {doc.summary
                              ? doc.summary
                              : doc.markdown.replace(/\n/g, ' ').trim()}
                          </div>
                        )}

                        {/* Document Metadata */}
                        <div className="text-[10px] text-gray-500 flex items-center gap-2 flex-wrap">
                          <span>{doc.updated_at ? new Date(doc.updated_at).toLocaleDateString() : ''}</span>
                          {doc.is_processing || (!doc.num_of_tokens && doc.num_of_tokens !== 0) ? (
                            <span className="flex items-center gap-1.5 text-gray-400">
                              <CircularProgress size={8} sx={{ color: '#9ca3af' }} />
                              <span>Processing</span>
                            </span>
                          ) : doc.num_of_tokens && doc.num_of_tokens > 0 ? (
                            <span className="text-gray-600">
                              • <span style={{ color: '#ec4899' }}>$ {Math.ceil(doc.num_of_tokens / 100)} credits</span>
                            </span>
                          ) : null}
                        </div>
                      </Box>
                    </Box>
                  </Box>
                ))}
              </Box>
              </>
            ) : (
              <Box className="text-center py-6">
                <Box className="text-gray-500 text-xs mb-3">No documents yet</Box>
                <button
                  onClick={onAddDocument}
                  className="text-xs px-3 py-1.5 bg-pink-600 hover:bg-pink-500 text-white rounded transition-colors"
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
        </div>
        )}
        </Box>
      )}

      {/* Vertical Tab Bar on Right Edge */}
      <Box
        className="border-l border-gray-900"
        sx={{
          width: '48px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          py: 2,
          gap: 1,
          bgcolor: 'rgba(0, 0, 0, 0.2)',
        }}
      >
        <Tooltip title={selectedProject?.system ? "Documents (Disabled for General)" : "Documents"} placement="left">
          <span className={selectedProject?.system ? 'cursor-not-allowed' : 'cursor-default'}>
            <IconButton
              onClick={() => !selectedProject?.system && setActiveSection(activeSection === 'documents' ? null : 'documents')}
              disabled={selectedProject?.system}
              sx={{
                color: activeSection === 'documents' ? '#ec4899' : '#9ca3af',
                bgcolor: activeSection === 'documents' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                padding: '10px',
                borderRadius: '8px',
                cursor: selectedProject?.system ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: selectedProject?.system ? '#9ca3af' : '#ec4899',
                  bgcolor: selectedProject?.system ? 'rgba(255, 255, 255, 0.05)' : 'rgba(236, 72, 153, 0.1)',
                },
                '&.Mui-disabled': {
                  color: '#6b7280',
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  pointerEvents: 'auto',
                },
              }}
              size="small"
            >
              <DescriptionOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={selectedProject?.system ? "Rules (Disabled for General)" : "Rules"} placement="left">
          <span className={selectedProject?.system ? 'cursor-not-allowed' : 'cursor-default'}>
            <IconButton
              onClick={() => !selectedProject?.system && setActiveSection(activeSection === 'rules' ? null : 'rules')}
              disabled={selectedProject?.system}
              sx={{
                color: activeSection === 'rules' ? '#ec4899' : '#9ca3af',
                bgcolor: activeSection === 'rules' ? 'rgba(236, 72, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                padding: '10px',
                borderRadius: '8px',
                cursor: selectedProject?.system ? 'not-allowed' : 'pointer',
                '&:hover': {
                  color: selectedProject?.system ? '#9ca3af' : '#ec4899',
                  bgcolor: selectedProject?.system ? 'rgba(255, 255, 255, 0.05)' : 'rgba(236, 72, 153, 0.1)',
                },
                '&.Mui-disabled': {
                  color: '#6b7280',
                  bgcolor: 'rgba(255, 255, 255, 0.03)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  pointerEvents: 'auto',
                },
              }}
              size="small"
            >
              <RuleOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}
