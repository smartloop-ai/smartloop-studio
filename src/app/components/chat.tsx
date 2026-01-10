
import { userService } from '@/app/services/user.service';
import { storageService } from '@/app/services/storage.service';
import { conversationService } from '@/app/services/conversation.service';
import { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import OpenAI from 'openai';

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import MessageInput from './message-input';

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
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

// Configure marked options for proper code rendering
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Custom renderer for code blocks to preserve formatting
const renderer = new Renderer();
const originalCodeRenderer = renderer.code.bind(renderer);
renderer.code = function (token: Tokens.Code) {
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

interface Attachment {
  file_id: string;
  name?: string;
  size?: number;
  type?: string;
}

export default function Chat(props: {
  project?: any,
  initialMessage?: string | null,
  onTokenUpdate?: () => void,
  attachments?: Attachment[],
  onAttachmentsClear?: () => void,
  onFileAttached?: (documentId: string, fileName: string) => void,
  conversation?: any,
  onConversationCreated?: (conversation: any) => void
}) {
  const messagesEndRef = useRef<null | HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    message: "",
  });
  const messageAttachmentsRef = useRef<Attachment[]>([]);
  const [clearAttachmentTrigger, setClearAttachmentTrigger] = useState(0);

  const [messages, setMessages]: any = useState([]);
  const [searchQuery] = useState("");
  const [filteredMessages, setFilteredMessages]: any = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTips, setShowTips] = useState<null | boolean>(null);
  const [copied, setCopied]: any = useState("");
  const [messageSent, setMessageSent] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentProjectIdRef = useRef<string | null>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  const sendingMessageRef = useRef<boolean>(false);  // Track if currently sending

  // Save messages to electron-store
  const saveMessagesToStorage = async (msgs: any[]) => {
    if (props.conversation?.id) {
      await storageService.saveMessages(props.conversation.id, msgs);
    }
  };

  // Load messages from electron-store
  const loadMessagesFromStorage = async () => {
    if (props.conversation?.id) {
      const stored = await storageService.getMessages(props.conversation.id);
      return stored;
    }
    return [];
  };

  // Log project prop for debugging
  useEffect(() => {
    console.log('[Chat] Project prop:', {
      project: props.project,
      projectId: props.project?.id,
      projectName: props.project?.title || props.project?.name
    });
  }, [props.project]);

  // Update attachments when props change
  useEffect(() => {
    console.log('[Chat useEffect] Attachments prop updated:', props.attachments);
    if (props.attachments && props.attachments.length > 0) {
      console.log('[Chat useEffect] Setting ref to:', props.attachments);
      messageAttachmentsRef.current = props.attachments;
    } else {
      console.log('[Chat useEffect] Clearing ref');
      messageAttachmentsRef.current = [];
    }
    console.log('[Chat useEffect] Ref after update:', messageAttachmentsRef.current);
  }, [props.attachments]);

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
    const url = `${API_ENDPOINT}/projects/${props.project.id}/messages/${msg.id}/feedback`;

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

  const handleFileAttached = (documentId: string, fileName: string) => {
    const newAttachments = [{ file_id: `file-${documentId}`, name: fileName }];
    console.log('[Chat handleFileAttached] Setting attachments:', newAttachments);
    messageAttachmentsRef.current = newAttachments;
    console.log('[Chat handleFileAttached] Ref after update:', messageAttachmentsRef.current);

    // Notify parent component if callback provided
    if (props.onFileAttached) {
      console.log('[Chat handleFileAttached] Notifying parent');
      props.onFileAttached(documentId, fileName);
    }
  };

  const sendMessage = async (_: any, messageOverride?: string) => {
    // Prevent duplicate sends
    if (isLoading || sendingMessageRef.current) {
      console.log('[Chat] Already sending a message, skipping duplicate send');
      return;
    }

    const userMessage = messageOverride || formData.message.trim();

    if (userMessage.length === 0) {
      console.log('Empty message, skipping');
      return;
    }

    // Mark as sending
    sendingMessageRef.current = true;

    const messageId = `msg-${Date.now()}`;
    const responseId = `response-${Date.now()}`;

    const effectiveProjectId = props.project?.id;
    console.log('Sending message:', userMessage, 'Project ID:', effectiveProjectId);

    // Use attachments from props if available, fallback to ref
    console.log('[Chat sendMessage] props.attachments:', props.attachments);
    console.log('[Chat sendMessage] messageAttachmentsRef.current:', messageAttachmentsRef.current);
    const currentAttachments = props.attachments && props.attachments.length > 0
      ? [...props.attachments]
      : [...messageAttachmentsRef.current];
    console.log('[Chat sendMessage] currentAttachments to send:', currentAttachments);

    // Use conversation from props
    if (!props.conversation?.id) {
      console.error('No conversation provided. Conversation should be created by parent component.');
      alert('Please create a conversation first before sending messages.');
      return;
    }

    console.log('Using conversation ID:', props.conversation.id);

    // Add user message to the chat (OpenAI format)
    const userMsg = {
      id: messageId,
      role: 'user',
      content: userMessage,
      attachments: currentAttachments.length > 0 ? currentAttachments : undefined
    };

    console.log('[Chat sendMessage] Created userMsg:', userMsg);
    console.log('[Chat sendMessage] userMsg.attachments:', userMsg.attachments);

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    // Add message to conversation locally (don't sync yet - wait for response)
    if (props.conversation?.id) {
      await conversationService.addMessageToConversation(props.conversation.id, userMsg);
    }

    setFormData({ message: "" });
    messageAttachmentsRef.current = [];
    setClearAttachmentTrigger(prev => prev + 1); // Trigger FileAttacher to clear
    if (props.onAttachmentsClear) {
      props.onAttachmentsClear();
    }
    setIsLoading(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Create initial response message for streaming
    const responseMsg = {
      id: responseId,
      role: 'assistant',
      content: '',
      is_new: true
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

      const projectId = props.project?.id ? String(props.project.id) : undefined;

      console.log('[Chat sendMessage] Current project:', {
        projectId: projectId,
        projectObject: props.project,
        conversationId: props.conversation.id
      });

      // Prepare the message object with attachments
      const messageObject: any = {
        role: 'user',
        content: userMessage
      };

      // Add attachments to the message object if they exist
      if (currentAttachments.length > 0) {
        console.log('[Chat sendMessage] Adding attachments to message object:', currentAttachments);
        messageObject.attachments = currentAttachments;
      }

      console.log('[Chat sendMessage] Final message object:', messageObject);

      // Create streaming chat completion with custom fields
      const stream = await openai.chat.completions.create({
        model: 'slp-model-001',
        messages: [messageObject],
        stream: true,
        conversation_id: props.conversation.id
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

          // Check if the response contains a memory/context limit error
          if (fullText.includes('[ERROR]') && (fullText.includes('allocated memory') || fullText.includes('exceeded the limit'))) {
            // Display a clean error message instead of the raw error
            const cleanErrorMessage = 'This conversation has exceeded its memory limit. Please start a new conversation to continue.';
            setMessages((prevMessages: any) =>
              prevMessages.map((msg: any) =>
                msg.id === responseId ? {
                  ...msg,
                  is_new: false,
                  isError: true,
                  errorIconType: 'warning',
                  content: cleanErrorMessage
                } : msg
              )
            );
            break; // Stop processing the stream
          }

          setMessages((prevMessages: any) =>
            prevMessages.map((msg: any) =>
              msg.id === responseId ? {
                ...msg,
                is_new: true,
                content: fullText
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

      // Mark response as complete
      setMessages((prevMessages: any) => {
        const finalMessages = prevMessages.map((msg: any) =>
          msg.id === responseId ? {
            ...msg,
            is_new: false
          } : msg
        );

        // Add the completed response message to conversation and sync entire conversation to server
        const responseMessage = finalMessages.find((msg: any) => msg.id === responseId);
        if (responseMessage && props.conversation?.id) {
          conversationService.addMessageToConversation(props.conversation.id, responseMessage).then(() => {
            // Now sync the entire conversation (both user message + assistant response) once
            conversationService.syncMessagesToServer(props.conversation.id).then(() => {
              console.log('[Chat] Synced conversation after complete exchange');
              // Dispatch event to update sidebar
              window.dispatchEvent(new CustomEvent('conversationUpdated', {
                detail: { conversationId: props.conversation.id }
              }));
            });
          });
        }

        return finalMessages;
      });

      // Notify parent about token update
      if (props.onTokenUpdate) {
        props.onTokenUpdate();
      }

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
        } else if (error.message?.includes('allocated memory') || error.message?.includes('exceeded the limit') || error.message?.includes('context length')) {
          errorIconType = 'warning';
          errorMessage = 'This conversation has exceeded its memory limit. Please start a new conversation to continue.';
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
              content: errorMessage
            } : msg
          );
          saveMessagesToStorage(updatedMessages);
          return updatedMessages;
        });
      }
    } finally {
      setIsLoading(false);
      sendingMessageRef.current = false;  // Reset sending flag
      abortControllerRef.current = null;
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }

  // Update when conversation prop changes
  useEffect(() => {
    const newConversationId = props.conversation?.id;

    if (newConversationId) {
      console.log('Conversation ID updated from props:', newConversationId);
      console.log('Current conversationId ref:', currentConversationIdRef.current);

      // Clear messages immediately when conversation changes (use ref for accurate comparison)
      if (currentConversationIdRef.current && currentConversationIdRef.current !== newConversationId) {
        console.log('Clearing messages for conversation switch from', currentConversationIdRef.current, 'to', newConversationId);
        setMessages([]);
        setShowTips(false);
      }
    }
  }, [props.conversation]);

  // Load messages from electron-store when conversation is available or project changes
  useEffect(() => {
    const conversationId = props.conversation?.id;
    if (conversationId) {
      const currentProjectId = props.project?.id;

      // Reload if the project ID or conversation ID changed
      if (currentProjectIdRef.current !== currentProjectId || currentConversationIdRef.current !== conversationId) {
        console.log('Conversation or project changed, loading new messages');
        currentProjectIdRef.current = currentProjectId;
        currentConversationIdRef.current = conversationId;

        // Clear messages first to ensure clean state
        setMessages([]);

        // Load messages for the new conversation (async)
        loadMessagesFromStorage().then(storedMessages => {
          console.log('Loading messages for conversation:', conversationId, 'Count:', storedMessages.length);
          if (storedMessages.length > 0) {
            setMessages(storedMessages);
            setShowTips(false);
          } else {
            setMessages([]);
            setShowTips(true);
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.conversation, props.project?.id]);

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
    if (props.initialMessage && !messageSent && !isLoading) {
      // Small delay to ensure component is ready (and generalProjectId to be set)
      setTimeout(() => {
        sendMessage({} as any, props.initialMessage || undefined);
        setMessageSent(true);
      }, 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.initialMessage, messageSent, isLoading]);

  // Save messages to localStorage whenever they change (backup save)
  useEffect(() => {
    if (messages.length > 0 && props.conversation?.id) {
      saveMessagesToStorage(messages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, props.conversation]);

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

  // Messages are stored in the database via conversation, no localStorage needed
  // The backend handles persistence

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
                    {msg.role === 'assistant' ?
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
                          <div className="bg-gray-900 border border-gray-900 rounded-sm p-3 md:p-5 text-white text-sm md:text-base leading-relaxed">
                            <div className="prose prose-invert max-w-none chat-content">
                              {msg.isError && msg.errorIconType && (
                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', mr: 1, verticalAlign: 'middle' }}>
                                  {msg.errorIconType === 'warning' && <WarningAmberIcon sx={{ fontSize: 18, color: '#f59e0b' }} />}
                                  {msg.errorIconType === 'lock' && <LockIcon sx={{ fontSize: 18, color: '#ef4444' }} />}
                                  {msg.errorIconType === 'build' && <BuildIcon sx={{ fontSize: 18, color: '#6b7280' }} />}
                                  {msg.errorIconType === 'error' && <ErrorOutlineIcon sx={{ fontSize: 18, color: '#ef4444' }} />}
                                </Box>
                              )}
                              {(!msg.content || msg.content.trim() === '') && msg.is_new ? (
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
                                    __html: marked(msg.content || '')
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
                              text={msg.content} onCopy={() => {
                                setCopied(msg.id);
                                setTimeout(() => setCopied(""), 1000);
                              }}>
                              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-900 hover:bg-gray-800 rounded-sm text-xs text-gray-400 hover:text-gray-300 transition-colors">
                                <ContentCopyIcon sx={{ fontSize: 14 }} />
                                <span>{copied === msg.id ? "Copied!" : "Copy"}</span>
                              </button>
                            </CopyToClipboard>
                            <button
                              className="p-1.5 bg-gray-900 hover:bg-gray-800 rounded-sm text-gray-400 hover:text-white transition-colors"
                              onClick={() => sendPositiveFeedback(msg)}
                            >
                              {
                                msg.feedback === 1 ?
                                  <ThumbUpIcon sx={{ fontSize: 16 }} />
                                  : <ThumbUpOffAltIcon sx={{ fontSize: 16 }} />
                              }
                            </button>
                            <button
                              className="p-1.5 bg-gray-900 hover:bg-gray-800 rounded-sm text-gray-400 hover:text-white transition-colors"
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
                          <Box className="flex flex-col gap-2 flex-1">
                            {/* Attachments bubble - shown above message if present */}
                            {msg.attachments && msg.attachments.filter((attachment: any) => attachment.file_id?.startsWith('file-')).length > 0 && (
                              <div className="border border-pink-500/30 rounded-sm overflow-hidden bg-pink-500/10">
                                <Box className="flex flex-wrap">
                                  {msg.attachments
                                    .filter((attachment: any) => attachment.file_id?.startsWith('file-'))
                                    .map((attachment: any, idx: number) => (
                                      <Box
                                        key={idx}
                                        className="w-full flex items-center gap-2 p-3 text-xs bg-pink-500/20 border border-pink-500/30 rounded-sm"
                                      >
                                        <Box
                                          sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '50%',
                                            bgcolor: 'rgba(236, 72, 153, 0.2)',
                                            border: '1px solid rgba(236, 72, 153, 0.4)',
                                          }}
                                        >
                                          <InsertDriveFileIcon sx={{ fontSize: 14, color: '#ec4899' }} />
                                        </Box>
                                        <span className="text-pink-300">{attachment.name || 'Document attached'}</span>
                                      </Box>
                                    ))}
                                </Box>
                              </div>
                            )}

                            {/* Message bubble */}
                            <div style={{ borderRight: '3px solid #ec4899' }} className="border border-gray-800 rounded-sm px-3 md:px-5 py-2 md:py-3 text-white text-sm md:text-base leading-relaxed">
                              <div className="text-wrap break-words py-3" dangerouslySetInnerHTML={{
                                __html: marked(msg.content)
                              }}>
                              </div>
                            </div>
                          </Box>

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
          <MessageInput
            message={formData.message}
            onMessageChange={(value) => setFormData({ message: value })}
            onSend={() => sendMessage(null)}
            placeholder="Enter your prompt..."
            disabled={false}
            isLoading={isLoading}
            allowAttachments={true}
            conversation={props.conversation}
            onFileAttached={handleFileAttached}
            onAttachmentClear={() => {
              setTimeout(() => {
                messageAttachmentsRef.current = [];
                if (props.onAttachmentsClear) {
                  props.onAttachmentsClear();
                }
              }, 100);
            }}
            clearAttachmentTrigger={clearAttachmentTrigger}
            showDragDrop={true}
            minRows={1}
            maxRows={4}
          />
        </footer>

      </Box>

    </>
  )
}
