import { Box, IconButton, CircularProgress, Tooltip, TextField, InputAdornment } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import SearchIcon from '@mui/icons-material/Search';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { useMemo, useState, useEffect, useRef } from 'react';
import { userService } from '@/app/services/user.service';
import { API_ENDPOINT } from '@/app/constants';

interface RightSidebarProps {
  selectedProject: any;
  currentProjectData: any;
  projectRules: string;
  isSavingRules: boolean;
  onRulesChange: (value: string) => void;
  onAddDocument: () => void;
  onDeleteDocument: (doc: any) => void;
  user: any;
  setUser: (user: any) => void;
}

export default function RightSidebar({
  selectedProject,
  currentProjectData,
  projectRules,
  isSavingRules,
  onRulesChange,
  onAddDocument,
  onDeleteDocument,
  user,
  setUser,
}: RightSidebarProps) {
  const [activeSection, setActiveSection] = useState<'rules' | 'documents' | null>(null);
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<any>(null);

  // SimpleMDE editor options
  const editorOptions = useMemo(() => ({
    spellChecker: false,
    status: ["words", "lines"] as const,
    toolbar: [
      'bold',
      'italic',
      'heading',
      '|',
      'unordered-list',
      'ordered-list',
      '|',
      'quote',
      'code',
      '|',
      'preview',
      '|',
      'guide',
    ] as const,
    autoSave: {
      enabled: true,
      uniqueId: `project-rules-${selectedProject?.id || 'none'}`,
      delay: 1000,
    },
    minHeight: '300px',
    placeholder: 'Add rules or guidelines for this project...',
  }), [selectedProject?.id]);

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

  const validateAndUploadFile = async (file: File) => {
    const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain', 'text/csv'];
    const maxSize = 50 * 1024 * 1024; // 50MB

    if (!allowedTypes.includes(file.type)) {
      setUploadError('Invalid file type. Supported: PDF, DOCX, TXT, CSV');
      return;
    }

    if (file.size > maxSize) {
      setUploadError('File size exceeds 50MB limit');
      return;
    }

    if (!selectedProject) {
      setUploadError('No project selected');
      return;
    }

    setIsUploading(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const token = await userService.token();
      const url = `${API_ENDPOINT}/projects/${selectedProject.id}/documents`;
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.detail || result.message || 'Upload failed');
      }

      const uploadedDocument = await response.json();

      // Update user state
      if (user) {
        const updatedProjects = user.projects.map((p: any) => {
          if (p.id === selectedProject.id) {
            const updatedDocs = [...(p.documents || []), uploadedDocument];
            return { ...p, documents: updatedDocs };
          }
          return p;
        });

        const updatedUser = { ...user, projects: updatedProjects };
        setUser(updatedUser);
      }

      window.dispatchEvent(new CustomEvent('documentUploaded', {
        detail: { projectId: selectedProject.id }
      }));

      setUploadError('');
    } catch (error: any) {
      setUploadError(error.message || 'Failed to upload document');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUploadFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndUploadFile(e.dataTransfer.files[0]);
    }
  };

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
          <Box className="flex items-center justify-between py-4 mb-4 border-b border-gray-800">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              {activeSection === 'documents' ? 'Documents' : activeSection === 'rules' ? 'Rules' : ''}
            </span>
            {selectedProject && activeSection === 'documents' && currentProjectData.documents.length > 0 && (
              <button
                onClick={onAddDocument}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-pink-500 border border-pink-500 hover:bg-pink-600 hover:text-white rounded-sm transition-colors"
              >
                <AddBoxIcon sx={{ fontSize: 16 }} />
                <span>Add</span>
              </button>
            )}
          </Box>

        {/* Project Rules Section */}
        {activeSection === 'rules' && selectedProject && currentProjectData && (
          <div className=" w-full">
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
              <ul>
                <li>- Use markdown to format the rules.</li>
                <li>- Clearly define guidelines for document processing.</li>
                <li>- Examples: preferred response style, prohibited content, specific instructions.</li>
              </ul>
            </p>
          </div>
        )}

        {/* Documents Section */}
        {activeSection === 'documents' && (
          <div
            className="space-y-3"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
          {selectedProject && currentProjectData ? (
            currentProjectData.documents && currentProjectData.documents.length > 0 ? (
              <>
                {/* Hidden file input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {/* Compact Drop Zone */}
                {/* <Box
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-sm p-4 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-pink-500 bg-pink-500/10'
                      : 'border-gray-700 hover:border-pink-500/50 bg-gray-900/30'
                  }`}
                >
                  {isUploading ? (
                    <Box className="flex items-center justify-center gap-2">
                      <CircularProgress size={16} sx={{ color: '#ec4899' }} />
                      <span className="text-gray-300 text-xs">Uploading...</span>
                    </Box>
                  ) : (
                    <Box className="flex items-center justify-center gap-2">
                      <CloudUploadIcon sx={{ fontSize: 16, color: '#9ca3af' }} />
                      <span className="text-gray-400 text-xs">Drop files here or click to upload</span>
                    </Box>
                  )}
                </Box> */}

                {uploadError && (
                  <Box className="text-red-400 text-xs text-center -mt-1">
                    {uploadError}
                  </Box>
                )}

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
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Box
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-sm p-8 text-center transition-all cursor-pointer ${
                    isDragging
                      ? 'border-pink-500 bg-pink-500/10'
                      : 'border-gray-700 hover:border-pink-600 bg-gray-900/50'
                  }`}
                >
                  {isUploading ? (
                    <Box className="flex flex-col items-center gap-3">
                      <CircularProgress size={48} sx={{ color: '#ec4899' }} />
                      <Box className="text-gray-300 text-sm">Uploading...</Box>
                    </Box>
                  ) : (
                    <>
                      <CloudUploadIcon className="text-5xl text-gray-500 mb-2" />
                      <Box className="text-gray-300 text-sm mb-1">
                        Drag and drop your file here
                      </Box>
                      <Box className="text-gray-500 text-xs mb-3">
                        or click to browse
                      </Box>
                      <Box className="text-gray-600 text-xs">
                        Supported: PDF, DOCX, TXT, CSV (Max 50MB)
                      </Box>
                    </>
                  )}
                </Box>
                {uploadError && (
                  <Box className="text-red-400 text-xs mt-2 text-center">
                    {uploadError}
                  </Box>
                )}
              </>
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
