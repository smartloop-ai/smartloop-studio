import { Box, Chip } from '@mui/material';
import { Mention, MentionsInput, SuggestionDataItem } from 'react-mentions';
import ManageSearchIcon from '@mui/icons-material/ManageSearch';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import FlashOnIcon from '@mui/icons-material/FlashOn';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FileAttacher from '@/app/components/file-attacher';
import { DEFAULT_COLOR } from '@/app/constants';

// Extend SuggestionDataItem to include color property
interface ProjectSuggestion extends SuggestionDataItem {
  color?: string;
}

interface WelcomeScreenProps {
  user: any;
  message: string;
  selectedProject: any;
  conversation: any;
  messageAttachments?: Array<{ file_id: string; name: string }>;
  clearAttachmentTrigger?: number;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  handleMentionChange: (event: any, newValue: string, newPlainTextValue: string, mentions: any[]) => void;
  handleSendMessage: () => void;
  handleFileAttached: (documentId: string, fileName: string) => void;
  fetchProjects: (search: string, callback: (data: ProjectSuggestion[]) => void) => void;
  renderProjectSuggestion: (suggestion: ProjectSuggestion, search: string, highlightedDisplay: React.ReactNode) => JSX.Element;
  onNavigate: (path: string) => void;
  onClearProject: () => void;
  onProjectSelected: (projectId: string | number) => void;
}

const features = [
  {
    title: 'Instantly extract information',
    subtitle: 'Extract',
    icon: <ManageSearchIcon sx={{ fontSize: 20 }} />,
  },
  {
    title: 'Learn smarter, faster',
    subtitle: 'Learn',
    icon: <MenuBookIcon sx={{ fontSize: 20 }} />,
  },
  {
    title: 'Grow with AI power',
    subtitle: 'Grow',
    icon: <TrendingUpIcon sx={{ fontSize: 20 }} />,
  },
];

const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good Morning';
    } else if (hour < 18) {
      return 'Good Afternoon';
    } else {
      return 'Good Evening';
    }
};

export default function WelcomeScreen({
  user,
  message,
  selectedProject,
  conversation,
  clearAttachmentTrigger,
  textareaRef,
  handleMentionChange,
  handleSendMessage,
  handleFileAttached,
  fetchProjects,
  renderProjectSuggestion,
  onNavigate,
  onClearProject,
  onProjectSelected,
}: WelcomeScreenProps) {
  return (
    <Box className="h-screen flex flex-col bg-black">
      <Box className="flex-1 overflow-hidden flex">
        {/* Welcome/Input Area */}
        <Box className="flex-1 overflow-y-auto px-4 md:px-8 lg:px-12 py-4" sx={{ width: '100%' }}>
          <Box className="flex items-center justify-center mt-12 md:mt-20">
            <Box className="max-w-4xl w-full">
              {/* Greeting */}
              <Box className="mb-8">
                <Box className="hidden md:flex items-center mb-4">
                  <Box className="w-12 h-12 flex">
                    <svg width="48" height="48" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <g clip-path="url(#clip0_1_62)">
                        <path d="M23 66.9683C23 84.0784 36.9216 98 54.0317 98L83.124 98C84.1946 98 85.0635 97.1311 85.0635 96.0605L85.0635 66.9683C85.0635 49.8581 71.1419 35.9365 54.0317 35.9365C36.9216 35.9365 23 49.8581 23 66.9683Z" fill="white" />
                        <circle cx="85.4286" cy="47.254" r="18.254" fill="#FF3478" />
                      </g>
                      <defs>
                        <clipPath id="clip0_1_62">
                          <rect width="128" height="128" fill="white" />
                        </clipPath>
                      </defs>
                    </svg>
                  </Box>
                </Box>
                <h1 className="text-2xl md:text-4xl font-light mb-2">
                  <span className="md:hidden ml-2" >{getGreeting()}, <span className="font-semibold text-pink-400">{user?.name?.split(' ')[0] || 'there'}</span>!</span>
                  <span className="hidden md:inline">{getGreeting()}, <span className="font-semibold text-pink-400">{user?.name?.split(' ')[0] || 'there'}</span>!</span>
                </h1>
              </Box>

              {/* Pro Plan Banner - Only show if user is not paid */}
              {!user?.is_paid && (
                <Box
                  className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 cursor-pointer hover:bg-gray-800 transition-colors"
                  onClick={() => onNavigate('/pricing')}
                >
                  <Box className="flex items-center gap-2 text-sm">
                    <FlashOnIcon sx={{ fontSize: 18, color: '#fbbf24' }} />
                    <span>Unlock more features with <span className="font-semibold">Pro Plan</span></span>
                  </Box>
                </Box>
              )}

              {/* Main Input Area */}
              <Box
                className="bg-gray-900/50 border rounded-2xl p-4 md:p-6 mb-6 relative transition-all border-gray-700 hover:border-pink-500/50"
              >
                <MentionsInput
                  value={message}
                  onChange={handleMentionChange}
                  placeholder="Type your message or /project to select a project"
                  className="mentions"
                  allowSuggestionsAboveCursor={true}
                  style={{
                    control: {
                      minHeight: '100px',
                      border: 'none',
                      outline: 'none',
                      boxShadow: 'none',
                    },
                    input: {
                      color: 'white',
                      minHeight: '100px',
                      border: 'none',
                      outline: 'none',
                      boxShadow: 'none',
                    },
                    highlighter: {
                      minHeight: '100px',
                      border: 'none',
                      outline: 'none',
                      boxShadow: 'none',
                    },
                    suggestions: {
                      backgroundColor: '#0a0a0a',
                      border: '1px solid #2a2a2a',
                      borderRadius: '8px',
                      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
                      zIndex: 10000,
                    },
                  }}
                  inputRef={textareaRef}
                  onKeyDown={(e: any) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                >
                  <Mention
                    trigger="/"
                    data={fetchProjects}
                    renderSuggestion={renderProjectSuggestion}
                    displayTransform={(_id: string, _display: string) => ''}
                    markup="/[__display__](__id__)"
                    isLoading={false}
                    onAdd={onProjectSelected}
                    style={{
                      backgroundColor: 'transparent',
                    }}
                  />
                </MentionsInput>

                <Box className="flex items-center justify-between mt-4">
                  {/* Left side - File attachment and project label */}
                  <Box className="flex items-center gap-2">
                    <FileAttacher
                      conversation={conversation}
                      onSuccess={handleFileAttached}
                      onError={(error) => console.error('File upload error:', error)}
                      size="small"
                      showDragDrop={true}
                      clearTrigger={clearAttachmentTrigger}
                    />
                    {/* Selected project label */}
                    {selectedProject && !selectedProject.system && (
                      <Chip
                        icon={
                          <Box
                            sx={{
                              width: 12,
                              height: 12,
                              borderRadius: '2px',
                              bgcolor: selectedProject.color || DEFAULT_COLOR,
                              flexShrink: 0,
                            }}
                          />
                        }
                        label={selectedProject.title || selectedProject.name}
                        size="small"
                        {...(!selectedProject.system && {
                          onDelete: onClearProject
                        })}
                        sx={{
                          height: '28px',
                          borderRadius: '1px',
                          bgcolor: 'rgba(236, 72, 153, 0.1)',
                          color: '#ec4899',
                          border: '1px solid rgba(236, 72, 153, 0.3)',
                          fontSize: '12px',
                          '& .MuiChip-icon': {
                            color: '#ec4899',
                          },
                          '& .MuiChip-deleteIcon': {
                            color: 'rgba(236, 72, 153, 0.6)',
                            fontSize: '14px',
                            '&:hover': {
                              color: '#ec4899',
                            },
                          },
                        }}
                      />
                    )}
                  </Box>

                  <button
                    disabled={message.trim().length <= 1}
                    className="rounded-full p-2 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors shadow-lg flex items-center justify-center"
                    onClick={handleSendMessage}
                  >
                    <ArrowUpwardIcon sx={{ color: '#fff', fontSize: 20 }} />
                  </button>
                </Box>

                {/* Helper Text */}
                <Box className="mt-4 pt-4 border-t border-gray-800">
                  <Box className="text-xs text-gray-500">
                    💡 Tip: Type <span className="text-pink-400 font-mono bg-gray-800 px-1 rounded">/</span> to select a project. Use ↑↓ to navigate, Enter to confirm.
                  </Box>
                </Box>
              </Box>

              {/* Feature Cards */}
              <Box className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 mb-6">
                {features.map((feature, index) => (
                  <Box
                    key={index}
                    className="bg-gray-900/50 border border-gray-700 rounded-xl p-4 md:p-6"
                  >
                    <Box className="mb-4">
                      <h3 className="text-sm font-medium mb-2 text-white">{feature.title}</h3>
                    </Box>
                    <Box className="flex items-center gap-2 text-gray-400">
                      {feature.icon}
                      <span className="text-sm">{feature.subtitle}</span>
                    </Box>
                  </Box>
                ))}
              </Box>

              {/* Bottom Text */}
              <Box className="text-center text-gray-400 text-sm">
                Ready to assist you with anything you need.
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
