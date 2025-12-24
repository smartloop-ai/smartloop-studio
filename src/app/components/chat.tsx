
import { userService } from '@/app/services/user.service';
import { useEffect, useRef, useState } from "react";
import { Box, CircularProgress, InputAdornment, InputBase } from "@mui/material";
import OpenAI from 'openai';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import SearchIcon from '@mui/icons-material/Search';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';

import { API_ENDPOINT } from '@/app/constants';

import { marked, Renderer, Tokens } from 'marked';

import LightbulbIcon from '@mui/icons-material/Lightbulb';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';

import { CopyToClipboard } from 'react-copy-to-clipboard';
import ThumbUpOffAltIcon from '@mui/icons-material/ThumbUpOffAlt';
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownOffAlt';
import ThumbUpIcon from '@mui/icons-material/ThumbUp';
import ThumbDownIcon from '@mui/icons-material/ThumbDown';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockIcon from '@mui/icons-material/Lock';
import BuildIcon from '@mui/icons-material/Build';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

// Configure marked options for proper code rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Custom renderer for code blocks to preserve formatting
const renderer = new Renderer();
const originalCodeRenderer = renderer.code.bind(renderer);
renderer.code = function(token: Tokens.Code) {
  const code = token.text;
  const language = token.lang || '';

  // For CSV and csvtext, render as table (each line as a row)
  if (language.toLowerCase() === 'csv' || language.toLowerCase() === 'csvtext' || language.toLowerCase().includes('csv')) {
    const lines = code.trim().split('\n').filter(line => line.trim());
    if (lines.length === 0) return '';

    let tableHtml = '<div class="csv-table-wrapper"><table class="csv-table">';

    // First line as header
    const headers = lines[0].split(',').map(h => h.trim());
    tableHtml += '<thead><tr>';
    headers.forEach(header => {
      tableHtml += `<th>${header}</th>`;
    });
    tableHtml += '</tr></thead>';

    // All remaining lines as data rows
    tableHtml += '<tbody>';
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',').map(cell => cell.trim());
      tableHtml += '<tr>';
      cells.forEach(cell => {
        tableHtml += `<td>${cell}</td>`;
      });
      tableHtml += '</tr>';
    }
    tableHtml += '</tbody>';

    tableHtml += '</table></div>';
    return tableHtml;
  }
  return originalCodeRenderer(token);
};

marked.use({ renderer });

export default function Chat(props: { project?: any, initialMessage?: string | null, onTokenUpdate?: () => void }) {
  const messagesEndRef = useRef<null | HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    message: "",
  });

  const [messages, setMessages]: any = useState([]);
  const [searchQuery] = useState("");
  const [filteredMessages, setFilteredMessages]: any = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTips, setShowTips] = useState<null | Boolean>(null);
  const [copied, setCopied]: any = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [generalProjectId, setGeneralProjectId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleInput = (e: any) => {
    const fieldName = e.target.name;
    const fieldValue = e.target.value;

    setFormData((prevState) => ({
      ...prevState,
      [fieldName]: fieldValue
    }));
  }

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({
        inline: 'nearest',
        behavior: 'smooth',
        block: 'end',
      });
    }
  }

  const sendFeedback = async (msg: any) => {
    var url = `${API_ENDPOINT}/projects/${props.project.id}/messages/${msg.id}/feedback`;

    const options = {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userService.token()}`
      },
      body: JSON.stringify({
        feedback: msg.feedback
      })
    }

    await fetch(url, options);
  }

  const sendPositiveFeedback = (msg: any) => {
    setMessages((prevState: any) => ([
      ...prevState.map((_msg: any) => {
        if (_msg.id === msg.id) {
          _msg.feedback = 1;
        }
        return _msg;
      })
    ]));

    sendFeedback(msg);
  }

  const sendNegativeFeedback = (msg: any) => {
    setMessages((prevState: any) => ([
      ...prevState.map((_msg: any) => {
        if (_msg.id === msg.id) {
          _msg.feedback = 2;
        }
        return _msg;
      })
    ]));
    sendFeedback(msg);
  }

  const handleKeyDown = (e: any) => {
    if (e.keyCode === 13 && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e);
      scrollToBottom();
    }
  }

  // Save messages to localStorage
  const saveMessagesToStorage = (msgs: any[]) => {
    if (sessionId) {
      const projectId = props.project?.id || generalProjectId || 'general';
      const key = `chat_${sessionId}_${projectId}`;
      localStorage.setItem(key, JSON.stringify(msgs));
    }
  };

  // Load messages from localStorage
  const loadMessagesFromStorage = () => {
    if (sessionId) {
      const projectId = props.project?.id || generalProjectId || 'general';
      const key = `chat_${sessionId}_${projectId}`;
      const stored = localStorage.getItem(key);
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch (e) {
          console.error('Error parsing stored messages:', e);
        }
      }
    }
    return [];
  };

  const sendMessage = async (_: any, messageOverride?: string) => {
    if (isLoading) {
      console.log('Already loading, skipping message send');
      return;
    }

    let userMessage = messageOverride || formData.message.trim();

    if (userMessage.length === 0) {
      console.log('Empty message, skipping');
      return;
    }

    const messageId = `msg-${Date.now()}`;
    const responseId = `response-${Date.now()}`;

    const effectiveProjectId = props.project?.id || generalProjectId || 'general';
    console.log('Sending message:', userMessage, 'Project ID:', effectiveProjectId, 'General ID:', generalProjectId);

    // Add user message to the chat
    const userMsg = {
      id: messageId,
      direction: 'in',
      payload: {
        type: 'text',
        text: userMessage,
        html: marked(userMessage),
        is_new: false
      }
    };

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    saveMessagesToStorage(updatedMessages);
    setFormData({ message: "" });
    setIsLoading(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Create initial response message for streaming
    let responseMsg = {
      id: responseId,
      direction: 'out',
      is_new: true,
      payload: {
        type: 'text',
        text: '',
        html: ''
      }
    };

    setMessages((prevState: any) => [...prevState, responseMsg]);

    try {
      // Initialize OpenAI client
      const openai = new OpenAI({
        baseURL: `${API_ENDPOINT}/openai`,
        apiKey: userService.token() || '',
        dangerouslyAllowBrowser: true
      });

      let fullText = '';

      // Determine assistant type and project ID based on whether a project is selected
      const assistantType = props.project?.id ? 'project_assistant' : 'general_assistant';
      const projectId = props.project?.id ? String(props.project.id) : (generalProjectId || 'general');

      // Create streaming chat completion with custom fields
      const stream = await openai.chat.completions.create({
        model: 'slp-model-001',
        messages: [{ role: 'user', content: userMessage }],
        stream: true,
        assistant_type: assistantType,
        project_id: projectId,
        session_id: sessionId || 'default_session'
      } as any) as any;

      // Process the stream
      for await (const chunk of stream) {
        // Check if aborted
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('AbortError');
        }

        const content = chunk.choices[0]?.delta?.content;

        if (content) {
          fullText += content;

          setMessages((prevMessages: any) =>
            prevMessages.map((msg: any) =>
              msg.id === responseId ? {
                ...msg,
                is_new: true,
                payload: {
                  ...msg.payload,
                  text: fullText,
                  html: marked(fullText) as string
                }
              } : msg
            )
          );

          setTimeout(() => {
            scrollToBottom();
          }, 10);
        }

        // Check for finish
        if (chunk.choices[0]?.finish_reason) {
          break;
        }
      }

      // Mark response as complete and save to storage
      setMessages((prevMessages: any) => {
        const finalMessages = prevMessages.map((msg: any) =>
          msg.id === responseId ? {
            ...msg,
            is_new: false
          } : msg
        );
        saveMessagesToStorage(finalMessages);
        return finalMessages;
      });

      // Notify parent about token update
      if (props.onTokenUpdate) {
        props.onTokenUpdate();
      }

      // Refocus input after response
      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);

    } catch (error: any) {
      if (error.message === 'AbortError' || error.name === 'AbortError') {
        console.log('Request aborted');
      } else {
        console.error('Error sending message:', error);

        // Check for 429 rate limit / out of credits error
        let errorMessage = 'An error occurred while processing your message. Please try again.';
        let errorIconType = 'error';

        if (error.status === 429 || error.message?.includes('429') || error.message?.includes('rate limit')) {
          errorIconType = 'warning';
          errorMessage = 'You have exceeded your usage limit or are out of credits. Please upgrade your account or reach out to us at support@smartloop.ai';
        } else if (error.status === 401 || error.status === 403) {
          errorIconType = 'lock';
          errorMessage = 'Authentication error. Please log in again.';
        } else if (error.status >= 500) {
          errorIconType = 'build';
          errorMessage = 'Server error. Our team has been notified. Please try again later.';
        } else if (error.message) {
          errorMessage = `Error: ${error.message}`;
        }

        // Update the response message with the error instead of removing it
        setMessages((prevState: any) => {
          const updatedMessages = prevState.map((msg: any) =>
            msg.id === responseId ? {
              ...msg,
              is_new: false,
              isError: true,
              errorIconType: errorIconType,
              payload: {
                ...msg.payload,
                text: errorMessage,
                html: marked(errorMessage) as string
              }
            } : msg
          );
          saveMessagesToStorage(updatedMessages);
          return updatedMessages;
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      setTimeout(() => {
        scrollToBottom();
        inputRef.current?.focus();
      }, 100);
    }
  }

  // Load userId on mount and generate general project ID and session ID
  useEffect(() => {
    userService.get().then(u => {
      if (u && u.email) {
        setUserId(u.email);

        // Generate or retrieve a consistent project ID for general assistant
        const storageKey = `general_assistant_project_${u.email}`;
        let storedProjectId = localStorage.getItem(storageKey);

        if (!storedProjectId) {
          // Generate a random project ID for this user's general assistant
          storedProjectId = `general_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
          localStorage.setItem(storageKey, storedProjectId);
        }

        console.log('General project ID set:', storedProjectId);
        setGeneralProjectId(storedProjectId);

        // Generate or retrieve a session ID for this user session
        const sessionKey = `chat_session_${u.email}`;
        let storedSessionId = sessionStorage.getItem(sessionKey);

        if (!storedSessionId) {
          // Generate a unique session ID for this browser session
          storedSessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
          sessionStorage.setItem(sessionKey, storedSessionId);
        }

        console.log('Session ID set:', storedSessionId);
        setSessionId(storedSessionId);
      }
    });
  }, []);

  // Load messages from localStorage when sessionId is available or project changes
  useEffect(() => {
    if (sessionId) {
      const currentProjectId = props.project?.id || generalProjectId || 'general';

      // Only reload if the project ID actually changed
      if (currentProjectIdRef.current !== currentProjectId) {
        currentProjectIdRef.current = currentProjectId;

        // Small delay to ensure generalProjectId is set
        setTimeout(() => {
          const storedMessages = loadMessagesFromStorage();
          console.log('Loading messages for project:', currentProjectId, 'Count:', storedMessages.length);
          if (storedMessages.length > 0) {
            setMessages(storedMessages);
            setShowTips(false);
          } else {
            setMessages([]);
            setShowTips(true);
          }
        }, 100);
      }
    }
  }, [sessionId, generalProjectId, props.project?.id]);

  useEffect(() => {
    // Show tips if no messages and no initial message is being sent
    if (messages.length === 0 && !props.initialMessage && !messageSent) {
      setTimeout(() => {
        setShowTips(true);
      }, 100);
    } else if (messages.length > 0 || props.initialMessage || messageSent) {
      setShowTips(false);
    }
  }, [messages.length, props.initialMessage, messageSent]);

  // Cleanup: abort any ongoing requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Auto-send initial message when provided
  useEffect(() => {
    if (props.initialMessage && !messageSent && !isLoading && userId) {
      // Small delay to ensure component is ready (and generalProjectId to be set)
      setTimeout(() => {
        sendMessage({} as any, props.initialMessage || undefined);
        setMessageSent(true);
      }, 800);
    }
  }, [props.initialMessage, messageSent, isLoading, userId]);

  useEffect(() => {
    if (searchQuery.trim() === "") {
      setFilteredMessages(messages);
    } else {
      const filtered = messages.filter((msg: any) => {
        return msg.payload.text.toLowerCase().includes(searchQuery.toLowerCase());
      });
      setFilteredMessages(filtered);
    }
  }, [searchQuery, messages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Save messages to localStorage whenever they change (backup save)
  useEffect(() => {
    if (messages.length > 0 && sessionId) {
      saveMessagesToStorage(messages);
    }
  }, [messages, sessionId, props.project?.id]);

  const displayMessages = searchQuery.trim() === "" ? messages : filteredMessages;

  return (
    <>
      <style>{`
        @keyframes blink {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.2;
          }
        }

        .chat-content table,
        .chat-content .csv-table {
          width: 100%;
          border-collapse: collapse;
          margin: 1em 0;
          background-color: #1a1a1a;
          border: 1px solid #374151;
          overflow-x: auto;
          display: block;
        }

        .chat-content table thead,
        .chat-content .csv-table thead {
          background-color: #111827;
          display: table;
          width: 100%;
          table-layout: fixed;
        }

        .chat-content table th,
        .chat-content .csv-table th {
          padding: 12px;
          text-align: left;
          font-weight: 600;
          color: #e5e7eb;
          border: 1px solid #374151;
          border-bottom: 2px solid #4b5563;
        }

        .chat-content table tbody,
        .chat-content .csv-table tbody {
          display: table;
          width: 100%;
          table-layout: fixed;
        }

        .chat-content table td,
        .chat-content .csv-table td {
          padding: 10px 12px;
          color: #d1d5db;
          border: 1px solid #374151;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }

        .chat-content table tbody tr:hover,
        .chat-content .csv-table tbody tr:hover {
          background-color: #1f2937;
        }

        .chat-content table tbody tr:nth-child(even),
        .chat-content .csv-table tbody tr:nth-child(even) {
          background-color: #0f1419;
        }

        .chat-content h1 {
          color: #fff;
          font-size: 2rem;
          font-weight: 700;
          margin-top: 1.5rem;
          margin-bottom: 1rem;
        }

        .chat-content h2 {
          color: #fff;
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.75rem;
        }

        .chat-content h3 {
          color: #fff;
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }

        .chat-content h4,
        .chat-content h5,
        .chat-content h6 {
          color: #fff;
          font-weight: 600;
        }

        .chat-content p {
          color: #d1d5db;
          line-height: 1.7;
          margin-bottom: 1rem;
        }

        .chat-content strong {
          color: #fff;
          font-weight: 600;
        }

        .chat-content em {
          font-style: italic;
        }

        .chat-content a {
          color: #ec4899;
          text-decoration: underline;
        }

        .chat-content a:hover {
          color: #f472b6;
        }

        .chat-content blockquote {
          border-left: 4px solid #ec4899;
          padding-left: 1rem;
          color: #9ca3af;
          font-style: italic;
          margin-bottom: 1rem;
        }

        .chat-content hr {
          border: none;
          border-top: 1px solid #374151;
          margin-top: 2rem;
          margin-bottom: 2rem;
        }

        .chat-content ul {
          list-style-type: disc;
          margin-left: 1.5em;
          margin-top: 0.5em;
          margin-bottom: 0.5em;
          padding-left: 0.5em;
        }

        .chat-content ol {
          list-style-type: decimal;
          margin-left: 1.5em;
          margin-top: 0.5em;
          margin-bottom: 0.5em;
          padding-left: 0.5em;
        }

        .chat-content li {
          margin-bottom: 0.5rem;
          padding-left: 0.25em;
          color: #d1d5db;
        }

        .chat-content ul ul {
          list-style-type: circle;
          margin-top: 0.25em;
        }

        .chat-content ul ul ul {
          list-style-type: square;
        }

        .chat-content ol ol {
          list-style-type: lower-alpha;
          margin-top: 0.25em;
        }

        .chat-content ol ol ol {
          list-style-type: lower-roman;
        }

        .chat-content pre {
          background-color: #1a1a1a;
          border: 1px solid #374151;
          border-radius: 8px;
          padding: 16px;
          margin: 1em 0;
          overflow-x: auto;
          white-space: pre-wrap;
          word-wrap: break-word;
          word-break: break-word;
        }

        .chat-content pre code {
          background-color: transparent;
          padding: 0;
          border: none;
          font-size: 0.875rem;
          line-height: 1.6;
          color: #e5e7eb;
          display: block;
          white-space: pre-wrap;
          word-wrap: break-word;
        }

        .chat-content code {
          background-color: #1f2937;
          border: 1px solid #374151;
          border-radius: 4px;
          padding: 2px 6px;
          font-size: 0.875em;
          color: #ec4899;
          font-family: 'Courier New', Courier, monospace;
        }

        .chat-content p code {
          white-space: pre-wrap;
          word-break: break-word;
        }

        /* CSV table wrapper for horizontal scrolling */
        .chat-content .csv-table-wrapper {
          width: 100%;
          overflow-x: auto;
          margin: 1em 0;
        }

        /* Retro block cursor */
        #message textarea {
          caret-color: transparent;
        }

        #message textarea::after {
          content: '';
          position: absolute;
          width: 8px;
          height: 1.2em;
          background-color: #ec4899;
          animation: blink 1s step-end infinite;
        }

        @keyframes blink {
          0%, 50% {
            opacity: 1;
          }
          50.1%, 100% {
            opacity: 0;
          }
        }
      `}</style>
      <Box className="chat__box flex flex-col h-full bg-black overflow-hidden" sx={{ borderLeft: '1px solid rgba(75, 85, 99, 0.3)' }}>
        <section className="chat__body flex-1 overflow-hidden">
          <div className="flex flex-col-reverse h-full overflow-y-auto px-3 md:px-4 pt-8 md:pt-12 pb-4 md:pb-6 scrollbar-thin">
            <div ref={messagesEndRef} />

            {(displayMessages || []).length === 0 && showTips && searchQuery.trim() === "" &&
              <div className="flex flex-col gap-2 h-full w-full justify-center items-center px-3 md:px-6">
                <div className="flex-1"></div>
                <Box
                  sx={{
                    bgcolor: 'rgba(17, 24, 39, 0.6)',
                    border: '1px solid rgba(75, 85, 99, 0.3)',
                    borderRadius: '16px',
                    padding: { xs: '20px', md: '32px' },
                    maxWidth: '700px',
                    width: '100%',
                  }}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        bgcolor: 'rgba(236, 72, 153, 0.1)',
                        border: '1px solid rgba(236, 72, 153, 0.2)',
                      }}
                    >
                      <LightbulbIcon sx={{ color: '#ec4899', fontSize: 24 }} />
                    </Box>
                    <h2 className="text-lg md:text-xl font-semibold text-white">Tips to Get Started</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <KeyboardArrowRightIcon sx={{ color: '#ec4899', fontSize: 20, mt: 0.3, flexShrink: 0 }} />
                      <p className="text-gray-300 text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-white">Ask specific questions:</span> Be detailed and clear. Request summaries, comparisons, or tables. The AI remembers context, so feel free to ask follow-up questions
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <KeyboardArrowRightIcon sx={{ color: '#ec4899', fontSize: 20, mt: 0.3, flexShrink: 0 }} />
                      <p className="text-gray-300 text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-white">Customize with project rules:</span> Visit the <span className="px-2 py-0.5 bg-gray-700 text-white rounded font-medium">Settings</span> tab to define project rules that refine how the AI responds to your specific needs
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <KeyboardArrowRightIcon sx={{ color: '#ec4899', fontSize: 20, mt: 0.3, flexShrink: 0 }} />
                      <p className="text-gray-300 text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-white">Work across documents:</span> The AI analyzes all uploaded documents together. Ask comprehensive questions to get insights from multiple sources
                      </p>
                    </div>
                  </div>
                </Box>
                <div className="flex-1"></div>
              </div>
            }
            {(displayMessages || []).length === 0 && searchQuery.trim() !== "" &&
              <div className="flex flex-col gap-2 h-full w-full justify-center">
                <div className="flex justify-center">
                  <div className="bg-gray-800 rounded-lg p-8 text-center">
                    <SearchIcon sx={{ fontSize: 48, color: '#9ca3af' }} />
                    <p className="mt-4 text-gray-400">No messages found matching "{searchQuery}"</p>
                  </div>
                </div>
              </div>
            }
            <div className="flex flex-col gap-6 w-full">
              {displayMessages && displayMessages.map((msg: any) => {
                return (
                  <>
                    {msg.direction === 'out' ?
                      <Box key={msg.id} className="flex items-start gap-3 max-w-3xl">
                        <Box className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 relative">
                          <Box
                            className="w-3 h-3 rounded-full bg-gradient-to-br from-pink-500 to-purple-500"
                            sx={msg.is_new ? {
                              '@keyframes blink': {
                                '0%, 100%': { opacity: 1 },
                                '50%': { opacity: 0.3 }
                              },
                              animation: 'blink 1s ease-in-out infinite'
                            } : {}}
                          ></Box>
                        </Box>

                        <Box className="flex-1">
                          <div className="bg-gray-900 border border-gray-900 rounded-lg p-3 md:p-5 text-white text-sm md:text-base leading-relaxed">
                            <div className="prose prose-invert max-w-none chat-content">
                              {msg.isError && msg.errorIconType && (
                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', mr: 1, verticalAlign: 'middle' }}>
                                  {msg.errorIconType === 'warning' && <WarningAmberIcon sx={{ fontSize: 18, color: '#f59e0b' }} />}
                                  {msg.errorIconType === 'lock' && <LockIcon sx={{ fontSize: 18, color: '#ef4444' }} />}
                                  {msg.errorIconType === 'build' && <BuildIcon sx={{ fontSize: 18, color: '#6b7280' }} />}
                                  {msg.errorIconType === 'error' && <ErrorOutlineIcon sx={{ fontSize: 18, color: '#ef4444' }} />}
                                </Box>
                              )}
                              {(!msg.payload.text || msg.payload.text.trim() === '') && msg.is_new ? (
                                <span
                                  className="inline-block bg-white"
                                  style={{
                                    width: '2px',
                                    height: '10px',
                                    animation: 'blink 1s ease-in-out infinite'
                                  }}
                                ></span>
                              ) : (
                                <>
                                  <div dangerouslySetInnerHTML={{
                                    __html: msg.payload.html || marked(msg.payload.text || '')
                                  }} />
                                  {msg.is_new && (
                                    <span
                                      className="inline-block bg-white ml-1"
                                      style={{
                                        width: '2px',
                                        height: '10px',
                                        animation: 'blink 1s ease-in-out infinite',
                                        verticalAlign: 'middle'
                                      }}
                                    ></span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <Box className="flex gap-2 mt-2">
                            <CopyToClipboard
                              text={msg.payload.text} onCopy={() => {
                                setCopied(msg.id);
                                setTimeout(() => setCopied(""), 1000);
                              }}>
                              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded-lg text-xs text-gray-400 hover:text-gray-300 transition-colors">
                                <ContentCopyIcon sx={{ fontSize: 14 }} />
                                <span>{copied === msg.id ? "Copied!" : "Copy"}</span>
                              </button>
                            </CopyToClipboard>
                            <button
                              className="p-1.5 bg-gray-900 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                              onClick={() => sendPositiveFeedback(msg)}
                            >
                              {
                                msg.feedback === 1 ?
                                  <ThumbUpIcon sx={{ fontSize: 16 }} />
                                  : <ThumbUpOffAltIcon sx={{ fontSize: 16 }} />
                              }
                            </button>
                            <button
                              className="p-1.5 bg-gray-900 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
                              onClick={() => sendNegativeFeedback(msg)}
                            >
                              {
                                msg.feedback === 2 ?
                                  <ThumbDownIcon sx={{ fontSize: 16 }} />
                                  : <ThumbDownAltIcon sx={{ fontSize: 16 }} />
                              }
                            </button>
                          </Box>
                        </Box>
                      </Box>
                      : <Box key={msg.id} className="flex justify-end">
                        <Box className="flex items-start gap-3 max-w-3xl">
                          <div className="bg-pink-600 border border-gray-900 rounded-lg p-3 md:p-5 text-white text-sm md:text-base leading-relaxed">
                            <div className="text-wrap break-words" dangerouslySetInnerHTML={{
                              __html: marked(msg.payload.text)
                            }}>
                            </div>
                          </div>
                          <Box className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                            <Box className="w-3 h-3 rounded-full bg-pink-500"></Box>
                          </Box>
                        </Box>
                      </Box>
                    }

                  </>
                )
              })
              }
            </div>
          </div>
        </section>
        <footer className="flex-none px-3 md:px-4 py-4 md:py-6 bg-black border-t border-gray-900">
          <Box>
            <Box
              className="px-4 md:px-6 py-3 md:py-4 border border-gray-800 rounded-lg shadow-lg"
              sx={{
                bgcolor: 'rgba(17, 24, 39, 0.5)',
                borderLeft: '3px solid #ec4899',
               }}
            >
              <InputBase
                inputRef={inputRef}
                id="message"
                name="message"
                autoComplete="off"
                placeholder={isLoading ? "Thinking..." : "Enter your prompt..."}
                type="text"
                multiline={true}
                maxRows={4}
                value={formData.message}
                onChange={handleInput}
                fullWidth
                disabled={isLoading}
                className="w-full text-inherit mb-3"
                onKeyDown={handleKeyDown}
                startAdornment={
                  isLoading ? (
                    <InputAdornment position="start">
                      <AutoAwesomeIcon sx={{ color: '#ec4899', fontSize: 18, mr: 0.5 }} />
                    </InputAdornment>
                  ) : null
                }
                sx={{
                  border: 'none',
                  height: '100%',
                  fontSize: '15px',
                  lineHeight: '1.5',
                  '& .MuiInputBase-input': {
                    caretColor: '#ec4899',
                  },
                  '& .MuiInputBase-input.Mui-disabled': {
                    color: '#9ca3af !important',
                    WebkitTextFillColor: '#9ca3af !important',
                  },
                  '& .MuiInputBase-input::placeholder': {
                    color: '#4b5563',
                    opacity: 1
                  },
                  '& .MuiInputBase-input.Mui-disabled::placeholder': {
                    color: '#9ca3af !important',
                    opacity: '1 !important',
                    WebkitTextFillColor: '#9ca3af !important',
                  },
                }}
              />

              <Box className="flex items-center justify-end">
                <button
                  disabled={isLoading || !formData.message.trim()}
                  className="p-2 md:p-3 rounded-lg bg-pink-500 hover:bg-pink-600 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors shadow-lg"
                  onClick={sendMessage}
                >
                  {isLoading ? (
                    <CircularProgress size={20} sx={{ color: '#fff' }} />
                  ) : (
                    <ArrowUpwardIcon sx={{ color: '#fff', fontSize: { xs: 18, md: 20 } }} />
                  )}
                </button>
              </Box>
            </Box>
          </Box>
        </footer>

      </Box>

    </>
  )
}
