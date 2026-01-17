import { Box, IconButton, CircularProgress, Tooltip } from '@mui/material';
import AddBoxIcon from '@mui/icons-material/AddBox';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import RuleOutlinedIcon from '@mui/icons-material/RuleOutlined';
import KeyboardDoubleArrowRightIcon from '@mui/icons-material/KeyboardDoubleArrowRight';
import SimpleMDE from 'react-simplemde-editor';
import 'easymde/dist/easymde.min.css';
import '../styles/markdown-editor.css';
import { useMemo, useState } from 'react';

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
  const [activeSection, setActiveSection] = useState<'rules' | 'documents'>('documents');
  const [hoveredDocId, setHoveredDocId] = useState<string | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // SimpleMDE editor options
  const editorOptions = useMemo(() => ({
    spellChecker: false,
    status: false,
    toolbar: false,
    minHeight: '300px',
    maxHeight: '500px',
    placeholder: 'Add rules or guidelines for this project...',
  }), []);

  return (
    <Box
      className="border-l border-gray-900 overflow-y-auto relative"
      sx={{
        width: { xs: '0', md: isCollapsed ? '48px' : '30%' },
        display: { xs: 'none', md: 'block' },
        transition: 'width 0.3s ease',
      }}
    >
      {isCollapsed ? (
        /* Collapsed State - Show Icon Buttons */
        <Box className="flex flex-col items-center py-3 gap-2">
          <Tooltip title="Documents" placement="left">
            <IconButton
              onClick={() => {
                setActiveSection('documents');
                setIsCollapsed(false);
              }}
              sx={{
                color: '#9ca3af',
                bgcolor: 'rgba(255, 255, 255, 0.05)',
                padding: '8px',
                '&:hover': {
                  color: '#ec4899',
                  bgcolor: 'rgba(236, 72, 153, 0.1)',
                },
              }}
              size="small"
            >
              <DescriptionOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Rules" placement="left">
            <IconButton
              onClick={() => {
                setActiveSection('rules');
                setIsCollapsed(false);
              }}
              sx={{
                color: '#9ca3af',
                bgcolor: 'rgba(255, 255, 255, 0.05)',
                padding: '8px',
                '&:hover': {
                  color: '#ec4899',
                  bgcolor: 'rgba(236, 72, 153, 0.1)',
                },
              }}
              size="small"
            >
              <RuleOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      ) : (
      /* Expanded State - Show Full Content */
      <>
      <Box className="p-3 space-y-4">
        {/* Header with Actions */}
        <Box className="flex items-center justify-end gap-1 pb-2">
          {selectedProject && activeSection === 'documents' && (
            <Tooltip title="Add document" placement="left">
              <IconButton
                onClick={onAddDocument}
                size="small"
                sx={{
                  color: '#9ca3af',
                  padding: '6px',
                  '&:hover': {
                    color: '#ec4899',
                    bgcolor: 'rgba(236, 72, 153, 0.1)',
                  },
                }}
              >
                <AddBoxIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Collapse sidebar" placement="left">
            <IconButton
              onClick={() => setIsCollapsed(true)}
              size="small"
              sx={{
                color: '#9ca3af',
                padding: '6px',
                '&:hover': {
                  color: '#ec4899',
                  bgcolor: 'rgba(236, 72, 153, 0.1)',
                },
              }}
            >
              <KeyboardDoubleArrowRightIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        {/* Project Rules Section */}
        {activeSection === 'rules' && selectedProject && currentProjectData && (
          <div className="space-y-3">
            <Box className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Project Rules
              </span>
              <span className="text-xs text-gray-500">
                {projectRules.length}/300
              </span>
            </Box>
            <Box className="relative">
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
              <Box className="markdown-editor-container">
                <SimpleMDE
                  value={projectRules}
                  onChange={onRulesChange}
                  options={editorOptions}
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
              <Box className="space-y-2">
                {currentProjectData.documents.map((doc: any, i: number) => (
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
      </>
      )}
    </Box>
  );
}
