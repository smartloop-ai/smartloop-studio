import { useRef } from 'react';
import { Box, Chip } from '@mui/material';
import { Mention, MentionsInput, SuggestionDataItem } from 'react-mentions';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import FileAttacher from './file-attacher';
import { DEFAULT_COLOR } from '@/app/constants';

interface ProjectSuggestion extends SuggestionDataItem {
  color?: string;
}

interface WelcomeScreenProps {
  message: string;
  onMessageChange: (event: any, newValue: string, newPlainTextValue: string, mentions: any[]) => void;
  onSend: () => void;
  onFileAttached: (documentId: string, fileName: string) => void;
  selectedProject?: any;
  conversation?: any;
  clearAttachmentTrigger?: number;
  fetchProjects: (search: string, callback: (data: ProjectSuggestion[]) => void) => void;
  renderProjectSuggestion: (suggestion: ProjectSuggestion, search: string, highlightedDisplay: React.ReactNode) => React.ReactNode;
  onProjectSelected?: (project: any) => void;
}

export default function WelcomeScreen({
  message,
  onMessageChange,
  onSend,
  onFileAttached,
  selectedProject,
  conversation,
  clearAttachmentTrigger = 0,
  fetchProjects,
  renderProjectSuggestion,
  onProjectSelected,
}: WelcomeScreenProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'black' }}>
      <Box className="flex-1 flex items-center justify-center px-4">
        <Box className="max-w-3xl w-full">
          {/* Logo */}
          <Box className="flex justify-center mb-6" sx={{ padding: '10px' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <span className="text-5xl font-semibold text-white tracking-tight">smartloop</span>
              <span className="text-pink-500 text-5xl font-semibold">.</span>
            </Box>
          </Box>

          {/* Prompt input */}
          <Box className="bg-gray-900/50 border rounded-sm p-4 relative transition-all border-gray-700 hover:border-pink-500/50">
            <MentionsInput
              value={message}
              onChange={onMessageChange}
              placeholder="Type your prompt.. (e.g. what are best coffee shop in San Francisco?)"
              className="mentions"
              allowSuggestionsAboveCursor={true}
              style={{
                control: { minHeight: '80px', border: 'none', outline: 'none', boxShadow: 'none' },
                input: { color: 'white', minHeight: '80px', border: 'none', outline: 'none', boxShadow: 'none' },
                highlighter: { minHeight: '80px', border: 'none', outline: 'none', boxShadow: 'none' },
                suggestions: { backgroundColor: '#0a0a0a', border: '1px solid #2a2a2a', borderRadius: '8px', boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)', zIndex: 10000 },
              }}
              inputRef={textareaRef}
              onKeyDown={(e: any) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSend();
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
                onAdd={(id: string | number) => {
                  if (onProjectSelected) {
                    onProjectSelected(id);
                  }
                }}
                style={{ backgroundColor: 'transparent' }}
              />
            </MentionsInput>

            <Box className="flex items-center justify-between mt-3">
              <Box className="flex items-center gap-2">
                <Chip
                  icon={
                    <Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: selectedProject?.color || DEFAULT_COLOR, flexShrink: 0 }} />
                  }
                  label={selectedProject?.name || 'General Chat'}
                  size="small"
                  className="px-1"
                  onClick={() => {/* TODO: project picker */ }}
                  sx={{
                    height: '28px', borderRadius: '2px',
                    bgcolor: 'rgba(236, 72, 153, 0.08)', color: '#9ca3af',
                    border: '1px solid rgba(107, 114, 128, 0.3)', fontSize: '12px',
                    cursor: 'pointer',
                    '&:hover': { bgcolor: 'rgba(236, 72, 153, 0.15)', borderColor: 'rgba(236, 72, 153, 0.4)', color: '#ec4899' },
                  }}
                />
                <FileAttacher
                  conversation={conversation}
                  onSuccess={onFileAttached}
                  onError={(error) => console.error('File upload error:', error)}
                  size="small"
                  showDragDrop={true}
                  clearTrigger={clearAttachmentTrigger}
                />
              </Box>
              <button
                disabled={message.trim().length <= 1}
                className="rounded-full p-2 bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors shadow-lg flex items-center justify-center"
                onClick={onSend}
              >
                <ArrowUpwardIcon sx={{ color: '#fff', fontSize: 20 }} />
              </button>
            </Box>
          </Box>

          {/* Footer text */}
          <Box className="mt-4">
            <Box className="text-xs text-gray-500 text-center">
              Ready to assist you with anything you need.
            </Box>
          </Box>
          {/* extra space, basically height of logo */}
          <Box className="p-10"  />
        </Box>
      </Box>
    </Box>
  );
}
