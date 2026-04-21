
import { conversationService } from '@/app/services/conversation.service';
import { storageService } from '@/app/services/storage.service';
import React, { useEffect, useRef, useState } from "react";
import { Box } from "@mui/material";
import OpenAI from 'openai';

import { Streamdown } from 'streamdown';
import "streamdown/styles.css";
import { createCodePlugin } from "@streamdown/code";
const code = createCodePlugin({
  themes: ['github-light', 'github-dark'],
});
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";

import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SearchIcon from '@mui/icons-material/Search';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import MessageInput from './message-input';

import { getLocalApiEndpoint } from '@/app/constants';

import LightbulbIcon from '@mui/icons-material/Lightbulb';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';

import { CopyToClipboard } from 'react-copy-to-clipboard';

import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';

import '@/app/styles/chat.css';

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
  onConversationCreated?: (conversation: any) => void,
  onConversationUpdate?: (conversation: any) => void
}) {
  const messagesEndRef = useRef<null | HTMLDivElement>(null)

  const [formData, setFormData] = useState({
    message: "",
  });
  const [selectedQuote, setSelectedQuote] = useState<string>("");
  const messageAttachmentsRef = useRef<Attachment[]>([]);
  const [clearAttachmentTrigger, setClearAttachmentTrigger] = useState(0);

  const [messages, setMessages]: any = useState([]);
  const [searchQuery] = useState("");
  const [filteredMessages, setFilteredMessages]: any = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTips, setShowTips] = useState<null | boolean>(null);
  const [copied, setCopied]: any = useState("");
  const streamStartRef = useRef<number>(0);
  const streamTokenCountRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentConversationIdRef = useRef<string | null>(null);
  const sendingMessageRef = useRef<boolean>(false);  // Track if currently sending
  const hasLocalErrorRef = useRef<boolean>(false);  // Track if there's a local error message
  const modelLoadingRef = useRef<boolean>(false);  // Track if a model is being initialized
  const lastTpsRef = useRef<number | null>(null);  // Last known tok/s value
  const pendingConversationUpdateRef = useRef<any | null>(null);  // Pending onConversationUpdate to fire after render
  const [isServiceReady, setIsServiceReady] = useState(false);
  const [, setStatusInfo] = useState<{ model: string; memory: number | null }>({ model: '', memory: null });
  const [modelDownloadProgress, setModelDownloadProgress] = useState<{ downloading: boolean; model: string; percent: number; status: string; stage?: string } | null>(null);
  const [indexingProgress, setIndexingProgress] = useState<{ total: number; indexed: number; pending: number } | null>(null);

  // Load last tok/s value from storage
  useEffect(() => {
    storageService.getItem('last_tokens_per_second').then((val: any) => {
      if (val) lastTpsRef.current = val;
    });
  }, []);

  // Check if the SLP service is already available, and listen for it to come online
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await getLocalApiEndpoint();
      if (!cancelled && url) setIsServiceReady(true);
    })();
    const handler = () => {
      if (!cancelled) {
        setIsServiceReady(true);
        setModelDownloadProgress(null);
        modelLoadingRef.current = false;
      }
    };
    window.addEventListener('slpServiceReady', handler);
    return () => { cancelled = true; window.removeEventListener('slpServiceReady', handler); };
  }, []);

  // Fetch status info (model, memory) when service is ready and periodically
  useEffect(() => {
    if (!isServiceReady) return;
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const model = props.project?.model_name || await storageService.getItem('selected_model') || 'gemma3-1b';
        const baseUrl = await getLocalApiEndpoint();
        let memPct: number | null = null;
        if (baseUrl) {
          try {
            const res = await fetch(`${baseUrl}/health`);
            if (res.ok) {
              const health = await res.json();
              memPct = health?.memory_percent ?? health?.memory ?? null;

              // Sync indexing status to SQLite and broadcast to sidebar
              const indexingDocs = health?.indexing?.documents;
              if (Array.isArray(indexingDocs) && props.project?.id) {
                const projectId = props.project.id;
                const indexingMap: Record<string, string> = {};
                let indexedCount = 0;
                let pendingCount = 0;
                for (const d of indexingDocs) {
                  if (!d.id) continue;
                  indexingMap[d.id] = d.status || 'unknown';
                  if (d.status === 'indexed') {
                    indexedCount++;
                    storageService.setDocumentProcessed(d.id, projectId);
                  } else {
                    pendingCount++;
                  }
                }
                if (pendingCount > 0) {
                  setIndexingProgress({ total: indexingDocs.length, indexed: indexedCount, pending: pendingCount });
                } else {
                  setIndexingProgress(null);
                }
                window.dispatchEvent(new CustomEvent('indexingStatusUpdate', {
                  detail: { projectId, documents: indexingMap },
                }));
              } else {
                setIndexingProgress(null);
              }
            }
          } catch { }
        }
        if (!cancelled) setStatusInfo({ model, memory: memPct });
      } catch { }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isServiceReady, props.project]);

  // Track model init status from Settings and sync status bar
  useEffect(() => {
    const handler = async (e: any) => {
      const loading = e.detail?.loading ?? false;
      modelLoadingRef.current = loading;
      if (loading) {
        // Model is starting to load — show initial progress
        setModelDownloadProgress({ downloading: true, model: e.detail?.model || '', percent: 0, status: 'Initializing model...' });
      } else {
        // Model finished loading — clear progress
        setModelDownloadProgress(null);
        const model = e.detail?.model || props.project?.model_name || await storageService.getItem('selected_model') || 'gemma3-1b';
        setStatusInfo(prev => ({ ...prev, model }));
      }
    };
    const progressHandler = (e: any) => {
      if (e.detail) {
        setModelDownloadProgress(e.detail);
      }
    };
    window.addEventListener('modelInitStatus', handler);
    window.addEventListener('modelDownloadProgress', progressHandler);
    return () => {
      window.removeEventListener('modelInitStatus', handler);
      window.removeEventListener('modelDownloadProgress', progressHandler);
    };
  }, []);

  // Log project prop for debugging
  useEffect(() => {
    console.log('[Chat] Project prop:', {
      project: props.project,
      projectId: props.project?.id,
      projectName: props.project?.title || props.project?.name
    });
  }, [props.project]);

  // Update attachments when props change
  // Only update ref if props.attachments is provided and not empty
  // Don't clear ref if props.attachments is empty - it might be cleared after message is sent
  useEffect(() => {
    console.log('[Chat useEffect] Attachments prop updated:', props.attachments);
    if (props.attachments && props.attachments.length > 0) {
      console.log('[Chat useEffect] Setting ref to:', props.attachments);
      messageAttachmentsRef.current = [...props.attachments];
    }
    // Don't clear ref when props.attachments is empty - preserve attachments until message is sent
    console.log('[Chat useEffect] Ref after update:', messageAttachmentsRef.current);
  }, [props.attachments]);


  // Clear any existing quote highlights
  const clearQuoteHighlight = () => {
    const existingHighlights = document.querySelectorAll('.quote-highlight');
    existingHighlights.forEach((el) => {
      const parent = el.parentNode;
      if (parent) {
        // Replace the highlight span with its text content
        const textNode = document.createTextNode(el.textContent || '');
        parent.replaceChild(textNode, el);
        parent.normalize(); // Merge adjacent text nodes
      }
    });
  };

  // Handle text selection from assistant messages
  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const selectedText = selection.toString().trim();
      // Check if the selection is within an assistant message
      const anchorNode = selection.anchorNode;
      if (anchorNode) {
        const chatContent = anchorNode.parentElement?.closest('.chat-content');
        if (chatContent) {
          // Clear previous highlights first
          clearQuoteHighlight();

          // Wrap selection in highlight span
          try {
            const range = selection.getRangeAt(0);
            const highlightSpan = document.createElement('span');
            highlightSpan.className = 'quote-highlight';
            range.surroundContents(highlightSpan);
          } catch (e) {
            // surroundContents can fail if selection spans multiple elements
            // In that case, just set the quote without visual highlight
            console.log('Could not highlight selection spanning multiple elements');
          }

          setSelectedQuote(selectedText);
          selection.removeAllRanges(); // Clear browser selection after highlighting
        }
      }
    }
  };

  // Clear highlight when quote is cleared
  const handleQuoteClear = () => {
    clearQuoteHighlight();
    setSelectedQuote("");
  };

  // Attach text selection listener
  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, []);



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

  const sendMessage = async (_: any, messageOverride?: string, retryAfterRestart = false) => {
    // Prevent duplicate sends
    if (isLoading || sendingMessageRef.current) {
      console.log('[Chat] Already sending a message, skipping duplicate send');
      return;
    }

    let userMessage = messageOverride || formData.message.trim();

    if (userMessage.length === 0) {
      console.log('Empty message, skipping');
      return;
    }

    // Prepend selected quote if present
    if (selectedQuote) {
      userMessage = `> ${selectedQuote.split('\n').join('\n> ')}\n\n${userMessage}`;
      clearQuoteHighlight(); // Clear the visual highlight
      setSelectedQuote(""); // Clear the quote after using
    }

    // Mark as sending
    sendingMessageRef.current = true;

    const messageId = `msg-${Date.now()}`;
    const responseId = `response-${Date.now()}`;

    const effectiveProjectId = props.project?.id;
    console.log('Sending message:', userMessage, 'Project ID:', effectiveProjectId);

    // Use attachments from props if available, fallback to ref
    // IMPORTANT: Check props first (most up-to-date), then ref (from previous props update)
    // This ensures attachments from welcome screen are used correctly
    console.log('[Chat sendMessage] props.attachments:', props.attachments);
    console.log('[Chat sendMessage] messageAttachmentsRef.current:', messageAttachmentsRef.current);
    let currentAttachments = props.attachments && props.attachments.length > 0
      ? [...props.attachments]  // Use props first - most current
      : (messageAttachmentsRef.current.length > 0
        ? [...messageAttachmentsRef.current]  // Fallback to ref
        : []);

    // Create conversation if it doesn't exist (first message)
    // Use ref as primary source of truth (updated immediately when conversation is created)
    // Fallback to props.conversation?.id only for initial load
    let conversationId = currentConversationIdRef.current || props.conversation?.id;

    // If conversation already exists, check if this is the first message
    // For the first message, we should still include project attachment even if conversation exists
    // (because conversation was just created and this is the first message being sent)
    const isFirstMessage = !messages || messages.length === 0;

    if (conversationId && !isFirstMessage) {
      // Filter out project attachments only for subsequent messages
      // Backend uses memory and project_id, so no need to send project attachment again
      currentAttachments = currentAttachments.filter(
        (att: any) => !att.file_id || !att.file_id.startsWith('project-')
      );
      console.log('[Chat sendMessage] Filtered out project attachments for existing conversation (not first message):', conversationId);
    }

    // Always add project attachment for first message if project is selected and attachment doesn't exist
    // This handles the case when sending from welcome screen where attachments might not be passed correctly
    if (isFirstMessage && props.project?.id) {
      const projectAttachment = {
        file_id: `project-${props.project.id}`,
        name: props.project.title || props.project.name || 'Project'
      };
      // Check if project attachment already exists
      const hasProjectAttachment = currentAttachments.some(
        (att: any) => att.file_id === projectAttachment.file_id
      );
      if (!hasProjectAttachment) {
        currentAttachments.push(projectAttachment);
        console.log('[Chat sendMessage] Added project as attachment (first message, project selected):', projectAttachment);
      } else {
        console.log('[Chat sendMessage] Project attachment already exists in currentAttachments');
      }
    }
    console.log('[Chat sendMessage] currentAttachments to send:', currentAttachments);

    if (!conversationId) {
      console.log('[Chat] No conversation exists, creating new one...');
      // Generate title from first 5 words of message
      const words = userMessage.split(' ');
      const titleWords = words.slice(0, 5).join(' ');
      const conversationTitle = words.length > 5 ? `${titleWords}...` : titleWords;

      try {
        const projectId = props.project?.id || null;
        const conversationResult = await conversationService.createConversation({
          title: conversationTitle,
          project_id: projectId
        });

        if (conversationResult.success && conversationResult.data) {
          conversationId = conversationResult.data.id;
          console.log('[Chat] Created new conversation:', conversationId);

          // Update the ref immediately so subsequent messages know the conversation exists
          currentConversationIdRef.current = conversationId;

          // Notify parent component
          if (props.onConversationCreated) {
            props.onConversationCreated(conversationResult.data);
          }
        } else {
          console.error('[Chat] Failed to create conversation:', conversationResult.error);
          alert('Failed to create conversation. Please try again.');
          sendingMessageRef.current = false;
          setIsLoading(false);
          return;
        }
      } catch (error: any) {
        console.error('[Chat] Error creating conversation:', error);
        alert('Failed to create conversation. Please try again.');
        sendingMessageRef.current = false;
        setIsLoading(false);
        return;
      }
    }

    console.log('Using conversation ID:', conversationId);

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

    // Messages are now managed via conversation state - synced via onConversationUpdate callback

    setFormData({ message: "" });
    // Clear attachments AFTER they've been used in the message
    // Don't clear immediately - let them be used first
    setClearAttachmentTrigger(prev => prev + 1); // Trigger FileAttacher to clear
    if (props.onAttachmentsClear) {
      props.onAttachmentsClear();
    }
    // Clear ref after a small delay to ensure message was sent with attachments
    setTimeout(() => {
      messageAttachmentsRef.current = [];
    }, 100);
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
      // Initialize OpenAI client pointing to local SLP service
      const localBaseUrl = await getLocalApiEndpoint();

      const openai = new OpenAI({
        baseURL: `${localBaseUrl}/v1`,
        apiKey: 'local',
        dangerouslyAllowBrowser: true
      });

      let fullText = '';

      const projectId = props.project?.id ? String(props.project.id) : undefined;

      console.log('[Chat sendMessage] Current project:', {
        projectId: projectId,
        projectObject: props.project,
        conversationId: conversationId
      });

      // Filter to only file attachments for the SLP server request
      // Project attachments (project-*) are handled via project_id param, not needed as attachments
      // SLP server expects attachment IDs as plain strings (the asset_id without the "file-" prefix)
      const fileAttachmentIds = currentAttachments
        .filter((att: any) => att.file_id && att.file_id.startsWith('file-'))
        .map((att: any) => att.file_id.replace(/^file-/, ''));

      // Prepare the message object — SLP expects attachments inside each message
      const messageObject: any = {
        role: 'user',
        content: userMessage,
      };
      if (fileAttachmentIds.length > 0) {
        messageObject.attachments = fileAttachmentIds;
      }

      console.log('[Chat sendMessage] Final message object:', messageObject);

      // Wait for model init to finish if one is in progress
      if (modelLoadingRef.current) {
        console.log('[Chat] Waiting for model init to complete...');
        setMessages((prev: any) =>
          prev.map((msg: any) =>
            msg.id === responseId ? { ...msg, content: 'Waiting for model to load...' } : msg
          )
        );
        await new Promise<void>((resolve) => {
          const check = (e: any) => {
            if (!e.detail?.loading) {
              window.removeEventListener('modelInitStatus', check);
              resolve();
            }
          };
          window.addEventListener('modelInitStatus', check);
          // Also poll in case the event was already fired
          const interval = setInterval(() => {
            if (!modelLoadingRef.current) {
              clearInterval(interval);
              window.removeEventListener('modelInitStatus', check);
              resolve();
            }
          }, 500);
        });
        console.log('[Chat] Model init complete, proceeding with message');
      }

      // Get the selected model from storage (set in Settings), fallback to default
      const selectedModel = await storageService.getItem('selected_model') || 'gemma3-1b';

      // Get temperature from SQLite settings, fallback to default
      let temperature = 0.3;
      try {
        const savedTemp = await storageService.getSetting('default_temperature');
        if (savedTemp !== null && savedTemp !== undefined) {
          temperature = savedTemp;
        }
      } catch { }

      // Create streaming chat completion
      // Pass session_id = conversationId so the SLP server maintains context per tab/conversation
      // Use body override to include custom fields (session_id, project_id)
      // that the OpenAI SDK would otherwise strip from the first arg
      const requestBody: any = {
        model: selectedModel,
        messages: [messageObject],
        stream: true,
        session_id: conversationId,
        temperature,
      };
      if (projectId) {
        requestBody.project_id = projectId;
      }
      if (props.project?.folder_path) {
        requestBody.cwd = props.project.folder_path;
      }

      const createStream = async () => {
        return await openai.chat.completions.create({
          model: selectedModel,
          messages: [messageObject],
          stream: true,
          temperature,
        }, {
          body: requestBody,
        }) as any;
      };

      let stream: any;
      try {
        stream = await createStream();
      } catch (err: any) {
        // If 503 "No model loaded", load the model and retry once
        if (err?.status === 503 || err?.message?.includes('503')) {
          console.log('[Chat] 503 no model loaded, calling /v1/models/load and retrying...');
          setMessages((prev: any) =>
            prev.map((msg: any) =>
              msg.id === responseId ? { ...msg, content: 'Loading model...' } : msg
            )
          );
          try {
            const loadRes = await fetch(`${localBaseUrl}/v1/models/load`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ model_name: selectedModel }),
            });
            if (loadRes.ok && loadRes.body) {
              const reader = loadRes.body.getReader();
              while (true) {
                const { done } = await reader.read();
                if (done) break;
              }
            }
          } catch (loadErr) {
            console.error('[Chat] Model load failed:', loadErr);
            throw err; // re-throw original error
          }
          stream = await createStream();
        } else {
          throw err;
        }
      }

      // Process the stream
      streamStartRef.current = Date.now();
      streamTokenCountRef.current = 0;
      for await (const chunk of stream) {
        // Check if aborted
        if (abortControllerRef.current?.signal.aborted) {
          throw new Error('AbortError');
        }

        // Capture citations from SLP server
        if (chunk.object === 'chat.citations' && chunk.citations) {
          setMessages((prevMessages: any) =>
            prevMessages.map((msg: any) =>
              msg.id === responseId ? { ...msg, citations: chunk.citations } : msg
            )
          );
          continue;
        }

        // Skip status/non-standard chunks from local SLP server
        if (!chunk.choices || !chunk.choices[0]) continue;

        const content = chunk.choices[0]?.delta?.content;

        if (content) {
          fullText += content;
          streamTokenCountRef.current++;

          // Check if the response contains a memory/context limit error
          if (fullText.includes('[ERROR]') && (fullText.includes('allocated memory') || fullText.includes('exceeded the limit') || fullText.includes('exceed context window'))) {
            // Display a clean error message instead of the raw error
            const cleanErrorMessage = 'This conversation has exceeded its context limit. Please start a new conversation to continue.';
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

        }

        // Check for finish
        if (chunk.choices[0]?.finish_reason) {
          break;
        }
      }

      // Calculate tok/s
      const elapsedSec = (Date.now() - streamStartRef.current) / 1000;
      const tps = elapsedSec > 0 && streamTokenCountRef.current > 0
        ? Math.round(streamTokenCountRef.current / elapsedSec)
        : undefined;

      // Persist last tok/s for display
      if (tps) {
        lastTpsRef.current = tps;
        storageService.setItem('last_tokens_per_second', tps);
        storageService.addTpsEntry(tps);
      }

      // Mark response as complete
      setMessages((prevMessages: any) => {
        const finalMessages = prevMessages.map((msg: any) =>
          msg.id === responseId ? {
            ...msg,
            is_new: false,
            ...(tps ? { tokens_per_second: tps } : {})
          } : msg
        );

        // Store pending update — calling onConversationUpdate here would trigger setState
        // during render (inside the state updater). Instead, fire it via useEffect.
        if (conversationId && props.onConversationUpdate) {
          pendingConversationUpdateRef.current = {
            ...props.conversation,
            id: conversationId,
            messages: finalMessages,
            updated_at: new Date().toISOString()
          };
        }

        return finalMessages;
      });

      // Notify parent about token update
      if (props.onTokenUpdate) {
        props.onTokenUpdate();
      }

    } catch (error: any) {
      if (error.message === 'AbortError' || error.name === 'AbortError') {
        console.log('Request aborted by user');
        // Keep the partial response as-is, just mark it as complete
        setMessages((prevMessages: any) => {
          const finalMessages = prevMessages.map((msg: any) => {
            if (msg.id === responseId) {
              // If there's partial content, keep it; if empty, remove the message
              if (msg.content && msg.content.trim().length > 0) {
                return { ...msg, is_new: false };
              }
              return null; // Remove empty response
            }
            return msg;
          }).filter(Boolean);

          // Store pending update — calling onConversationUpdate here would trigger setState
          // during render (inside the state updater). Instead, fire it via useEffect.
          if (conversationId && props.onConversationUpdate) {
            pendingConversationUpdateRef.current = {
              ...props.conversation,
              id: conversationId,
              messages: finalMessages,
              updated_at: new Date().toISOString()
            };
          }

          return finalMessages;
        });
      } else if (
        (error.name === 'APIConnectionError' || error.message?.includes('Failed to fetch') || error.message?.includes('Connection error')) &&
        !retryAfterRestart
      ) {
        // SLP server not reachable — try to start it and retry once
        console.warn('[Chat] Connection error — attempting to start SLP service and retry...');
        setMessages((prev: any) =>
          prev.map((msg: any) =>
            msg.id === responseId ? { ...msg, is_new: true, content: 'Reconnecting to server...' } : msg
          )
        );
        try {
          if (window.electronAPI?.slpServiceStart) {
            await window.electronAPI.slpServiceStart();
            // Wait for the service to become ready (poll health for up to 30s)
            const localBaseUrl = await getLocalApiEndpoint();
            let ready = false;
            for (let i = 0; i < 30; i++) {
              try {
                const res = await fetch(`${localBaseUrl}/health`);
                if (res.ok) { ready = true; break; }
              } catch (_) { /* not ready yet */ }
              await new Promise(r => setTimeout(r, 1000));
            }
            if (ready) {
              console.log('[Chat] SLP service restarted — retrying message...');
              sendingMessageRef.current = false;
              setIsLoading(false);
              sendMessage(null, userMessage, true);
              return;
            }
          }
        } catch (restartErr) {
          console.error('[Chat] Failed to restart SLP service:', restartErr);
        }
        // If restart failed, fall through to show error
        setMessages((prev: any) =>
          prev.map((msg: any) =>
            msg.id === responseId ? {
              ...msg, is_new: false, isError: true, errorIconType: 'build',
              content: 'Unable to connect to the local server. Please check that the service is running.'
            } : msg
          )
        );
        hasLocalErrorRef.current = true;
      } else {

        // Check for 429 rate limit / out of credits error
        let errorMessage = 'An error occurred while processing your message. Please try again.';
        let errorIconType = 'error';

        // Enhanced 429 detection - check status, message content, and error codes
        if (
          error.status === 429 ||
          error.statusCode === 429 ||
          error.message?.includes('429') ||
          error.code === 'rate_limit_exceeded' ||
          error.code === 'insufficient_quota' ||
          error.message?.toLowerCase().includes('insufficient credits')
        ) {
          errorIconType = 'warning';
          errorMessage = 'You have exceeded your usage limit or are out of credits. Please upgrade your account or contact support@smartloop.ai for assistance.';
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
          const updatedMessages = prevState.map((msg: any) => {
            if (msg.id === responseId) {
              console.log('[DEBUG Error] MATCH FOUND - updating message:', msg.id);
              return {
                ...msg,
                is_new: false,
                isError: true,
                errorIconType: errorIconType,
                content: errorMessage
              };
            }
            return msg;
          });

          // Mark that we have a local error to prevent conversation sync from overwriting
          hasLocalErrorRef.current = true;

          return updatedMessages;
        });
      }
    } finally {
      setIsLoading(false);
      sendingMessageRef.current = false;  // Reset sending flag
      abortControllerRef.current = null;
    }
  }

  // Reset input when conversation changes (switching tabs)
  useEffect(() => {
    // Reset input box when switching to a different conversation
    setFormData({ message: "" });
    setSelectedQuote("");
    clearQuoteHighlight();
    messageAttachmentsRef.current = [];
    setClearAttachmentTrigger(prev => prev + 1);
  }, [props.conversation?.id]);

  // Load messages when conversation changes - simple and direct
  useEffect(() => {
    // Don't overwrite messages while actively sending (new conversation scenario)
    if (sendingMessageRef.current || isLoading) {
      console.log('[Chat] Skipping message load - currently sending');
      return;
    }

    // Don't overwrite messages if we have a local error displayed
    if (hasLocalErrorRef.current) {
      console.log('[Chat] Skipping message load - local error message displayed');
      hasLocalErrorRef.current = false; // Reset for next time
      return;
    }

    const conversationMessages = props.conversation?.messages || [];

    console.log('[Chat] Conversation changed:', {
      id: props.conversation?.id,
      messagesCount: conversationMessages.length
    });

    // Update messages from conversation
    setMessages(conversationMessages);
    setShowTips(conversationMessages.length === 0);

    // Update conversation ref
    currentConversationIdRef.current = props.conversation?.id || null;

  }, [props.conversation, isLoading]);

  // Fire any pending onConversationUpdate after messages state has committed to DOM
  // (calling it inside a setMessages updater triggers "setState during render" warning)
  useEffect(() => {
    if (pendingConversationUpdateRef.current && props.onConversationUpdate) {
      const update = pendingConversationUpdateRef.current;
      pendingConversationUpdateRef.current = null;
      props.onConversationUpdate(update);
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup: abort any ongoing requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Handle link clicks: web links -> system browser; local file paths -> system default app
  useEffect(() => {
    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if the clicked element is an anchor tag or inside one
      const anchor = target.closest('a');
      if (!anchor) return;

      // Use raw href attribute to avoid browser-resolved absolute URLs for local paths
      const rawHref = anchor.getAttribute('href') || '';
      const resolvedHref = anchor.href || '';
      if (!rawHref && !resolvedHref) return;

      const electronAPI = (window as any).electronAPI;

      // Web links — open in system browser
      if (rawHref.startsWith('http://') || rawHref.startsWith('https://')) {
        e.preventDefault();
        if (electronAPI?.openExternal) {
          electronAPI.openExternal(rawHref);
        } else {
          window.open(rawHref, '_blank', 'noopener,noreferrer');
        }
        return;
      }

      // Local file — open with system default app
      const isFileScheme = rawHref.startsWith('file://');
      const isAbsolutePath = rawHref.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(rawHref);
      const isHomePath = rawHref.startsWith('~');
      if (isFileScheme || isAbsolutePath || isHomePath) {
        e.preventDefault();
        const path = isFileScheme ? decodeURIComponent(rawHref.replace(/^file:\/\//, '')) : rawHref;
        if (electronAPI?.openInFinder) {
          electronAPI.openInFinder(path);
        }
      }
    };

    // Capture phase so we intercept before any library-level handlers
    document.addEventListener('click', handleLinkClick, true);
    return () => {
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, []);

  // Messages are now managed via conversation service state
  // No need for backup saves - messages are synced to server after each exchange

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

  // Messages are stored in the database via conversation, no localStorage needed
  // The backend handles persistence

  const displayMessages = searchQuery.trim() === "" ? messages : filteredMessages;

  return (
    <>
      <Box className="chat__box flex flex-col h-full bg-black overflow-hidden" sx={{ borderLeft: '1px solid rgba(75, 85, 99, 0.3)' }}>
        <section className="chat__body flex-1 overflow-hidden">
          <div className="flex flex-col-reverse h-full overflow-y-auto px-3 md:px-4 pt-8 md:pt-12 pb-4 md:pb-6 scrollbar-thin">
            <div ref={messagesEndRef} />

            {(displayMessages || []).length === 0 && searchQuery.trim() === "" && modelDownloadProgress &&
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
                  <div className="flex items-center gap-3 mb-4">
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '40px',
                        height: '40px',
                        borderRadius: '10px',
                        bgcolor: 'var(--sl-brand-alpha-10)',
                        border: '1px solid var(--sl-brand-alpha-20)',
                      }}
                    >
                      <AutoAwesomeIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 24 }} />
                    </Box>
                    <div>
                      <h2 className="text-lg md:text-xl font-semibold text-white">Bootstrapping Model</h2>
                      <p className="text-xs text-gray-400 mt-0.5">{modelDownloadProgress.model?.replace(/-/g, ' ')}</p>
                    </div>
                  </div>

                  {/* Stage indicators */}
                  <div className="flex items-center gap-2 mb-3">
                    {['checking', 'downloading'].map((s) => {
                      const stageLabels: Record<string, string> = { checking: 'Checking', downloading: 'Downloading' };
                      const currentStage = modelDownloadProgress.stage || 'initializing';
                      const stageOrder = ['initializing', 'checking', 'downloading', 'extracting', 'verifying', 'preparing', 'complete'];
                      const currentIdx = stageOrder.indexOf(currentStage);
                      const thisIdx = stageOrder.indexOf(s);
                      const isActive = currentStage === s || (s === 'downloading' && (currentStage === 'extracting' || currentStage === 'verifying'));
                      const isDone = currentIdx > thisIdx && !isActive;
                      return (
                        <div key={s} className="flex items-center gap-1.5">
                          <div
                            className={`w-2 h-2 rounded-full ${isDone ? 'bg-green-500' : isActive ? 'bg-pink-500 animate-pulse' : 'bg-gray-600'}`}
                          />
                          <span className={`text-[10px] ${isActive ? 'text-white' : isDone ? 'text-green-400' : 'text-gray-600'}`}>
                            {stageLabels[s]}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-xs text-gray-400">
                      <span>{modelDownloadProgress.status}</span>
                      <span>{modelDownloadProgress.percent > 0 ? `${modelDownloadProgress.percent}%` : ''}</span>
                    </div>
                    <Box
                      sx={{
                        width: '100%',
                        height: '6px',
                        borderRadius: '3px',
                        bgcolor: 'rgba(75, 85, 99, 0.4)',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          width: `${modelDownloadProgress.percent}%`,
                          height: '100%',
                          borderRadius: '3px',
                          bgcolor: 'var(--sl-brand-primary)',
                          transition: 'width 0.3s ease',
                          ...(modelDownloadProgress.percent < 100 && modelDownloadProgress.percent > 0 ? {} : modelDownloadProgress.percent === 0 ? {
                            width: '30%',
                            animation: 'indeterminate 1.5s ease-in-out infinite',
                            '@keyframes indeterminate': {
                              '0%': { transform: 'translateX(-100%)' },
                              '100%': { transform: 'translateX(350%)' },
                            },
                          } : {}),
                        }}
                      />
                    </Box>
                    <p className="text-xs text-gray-500">Please wait as we download and prepare the model...</p>
                  </div>
                </Box>
                <div className="flex-1"></div>
              </div>
            }
            {(displayMessages || []).length === 0 && showTips && searchQuery.trim() === "" && !modelDownloadProgress && isServiceReady && props.project &&
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
                        bgcolor: 'var(--sl-brand-alpha-10)',
                        border: '1px solid var(--sl-brand-alpha-20)',
                      }}
                    >
                      <LightbulbIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 24 }} />
                    </Box>
                    <h2 className="text-lg md:text-xl font-semibold text-white">Tips to Get Started</h2>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <FiberManualRecordIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 8, mt: 0.8, flexShrink: 0 }} />
                      <p className="text-gray-300 text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-white">Ask specific questions:</span> Be detailed and clear. Request summaries, comparisons, or tables. The AI remembers context, so feel free to ask follow-up questions
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <FiberManualRecordIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 8, mt: 0.8, flexShrink: 0 }} />
                      <p className="text-gray-300 text-xs md:text-sm leading-relaxed">
                        <span className="font-semibold text-white">Customize with project skills:</span> Visit the <span className="px-2 py-0.5 bg-gray-700 text-white rounded font-medium">Settings</span> tab to define project skills that refine how the AI responds to your specific needs
                      </p>
                    </div>

                    <div className="flex items-start gap-3">
                      <FiberManualRecordIcon sx={{ color: 'var(--sl-brand-primary)', fontSize: 8, mt: 0.8, flexShrink: 0 }} />
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
                    <SearchIcon sx={{ fontSize: 48, color: 'var(--sl-text-muted)' }} />
                    <p className="mt-4 text-gray-400">No messages found matching "{searchQuery}"</p>
                  </div>
                </div>
              </div>
            }
            <div className="flex flex-col gap-6 w-full">
              {displayMessages && displayMessages.map((msg: any) => {
                return (
                  <React.Fragment key={msg.id}>
                    {msg.role === 'assistant' ?
                      <Box className="flex items-start gap-3 w-full">
                        <Box className="flex-1">
                          <div className="bg-gray-900 border border-gray-900 rounded-sm p-3 md:p-5 text-white text-sm md:text-base leading-relaxed">
                            <div className="prose prose-invert max-w-none chat-content">
                              {msg.is_new && !msg.content ? (
                                <span className="inline-block w-2 h-4 bg-white/80 rounded-sm animate-pulse" />
                              ) : (
                                <Streamdown
                                  mode={msg.is_new ? "streaming" : "static"}
                                  animated
                                  caret="block"
                                  controls={false}
                                  linkSafety={{ enabled: false }}
                                  plugins={{ code, mermaid, math, cjk }}>
                                  {msg.content || ''}
                                </Streamdown>
                              )}
                            </div>
                            {msg.citations && msg.citations.length > 0 && !msg.is_new && (
                              <div className="mt-3 pt-3 border-t border-gray-700/50">
                                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Sources</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {msg.citations.map((citation: any, idx: number) => {
                                    const label = citation.document_name || citation.document_id;
                                    const filePath = citation.source || citation.path || citation.filepath || '';
                                    const isPath = filePath && (filePath.startsWith('/') || filePath.startsWith('~') || /^[A-Z]:\\/.test(filePath));
                                    return (
                                      <span
                                        key={idx}
                                        className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-gray-800/80 border border-gray-700/50 text-gray-400${isPath ? ' cursor-pointer hover:text-gray-200 hover:border-gray-600 transition-colors' : ''}`}
                                        title={filePath || citation.document_id}
                                        onClick={isPath ? () => window.electronAPI?.openInFinder?.(filePath) : undefined}
                                      >
                                        <InsertDriveFileIcon sx={{ fontSize: 10, color: 'var(--sl-brand-primary)' }} />
                                        {label}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                          {msg.content && !msg.is_new && (
                            <div className="flex items-center gap-2 mt-2 px-1">
                              <CopyToClipboard
                                text={msg.content}
                                onCopy={() => {
                                  setCopied(msg.id);
                                  setTimeout(() => setCopied(""), 1500);
                                }}>
                                <button
                                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors"
                                  style={{
                                    color: copied === msg.id ? 'var(--sl-status-success)' : 'var(--sl-text-muted)',
                                    borderColor: 'var(--sl-border-default, #374151)',
                                    background: 'transparent',
                                  }}
                                  title="Copy response"
                                >
                                  {copied === msg.id
                                    ? <><CheckIcon sx={{ fontSize: 12 }} /> Copied</>
                                    : <><ContentCopyIcon sx={{ fontSize: 12 }} /> Copy</>}
                                </button>
                              </CopyToClipboard>
                              <button
                                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border transition-colors"
                                style={{
                                  color: 'var(--sl-text-muted)',
                                  borderColor: 'var(--sl-border-default, #374151)',
                                  background: 'transparent',
                                }}
                                title="Download as Markdown"
                                onClick={() => {
                                  const blob = new Blob([msg.content], { type: 'text/markdown' });
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement('a');
                                  a.href = url;
                                  a.download = 'response.md';
                                  a.click();
                                  URL.revokeObjectURL(url);
                                }}
                              >
                                <FileDownloadIcon sx={{ fontSize: 12 }} /> Download
                              </button>
                            </div>
                          )}
                        </Box>
                      </Box>
                      : <Box className="flex justify-end">
                        <Box className="flex items-start gap-3 max-w-3xl">
                          <Box className="flex flex-col gap-2 flex-1">
                            {/* Attachments - shown above message if present */}
                            {msg.attachments && msg.attachments.filter((attachment: any) => attachment.file_id?.startsWith('file-')).length > 0 && (
                              <Box className="flex flex-wrap gap-2 mb-2 justify-end">
                                {msg.attachments
                                  .filter((attachment: any) => attachment.file_id?.startsWith('file-'))
                                  .map((attachment: any, idx: number) => (
                                    <Box
                                      key={idx}
                                      className="flex items-center gap-2 px-2.5 py-1.5 text-xs bg-gray-800/60 rounded-sm border border-gray-700/50"
                                    >
                                      <Box
                                        sx={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          width: 24,
                                          height: 24,
                                          borderRadius: '50%',
                                          bgcolor: 'var(--sl-brand-alpha-15)',
                                        }}
                                      >
                                        <InsertDriveFileIcon sx={{ fontSize: 12, color: 'var(--sl-brand-primary)' }} />
                                      </Box>
                                      <span className="text-gray-300 truncate max-w-[150px]">{attachment.name || 'Document'}</span>
                                    </Box>
                                  ))}
                              </Box>
                            )}

                            {/* Message bubble */}
                            <div style={{ borderRight: '3px solid var(--sl-brand-primary)' }} className="border border-gray-800 rounded-sm px-3 md:px-5 py-2 md:py-3 text-white text-sm md:text-base leading-relaxed">
                              <pre className="user-message-content text-wrap break-words py-3 whitespace-pre-wrap font-[inherit]">
                                {msg.content}
                              </pre>
                            </div>
                          </Box>

                          <Box className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0">
                            <Box className="w-3 h-3 rounded-full bg-pink-500"></Box>
                          </Box>
                        </Box>
                      </Box>
                    }

                  </React.Fragment>
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
            onStop={() => {
              if (abortControllerRef.current) {
                abortControllerRef.current.abort();
              }
            }}
            placeholder={modelDownloadProgress?.downloading ? "Waiting for model to be ready..." : "Enter your prompt..."}
            disabled={!isServiceReady || !!modelDownloadProgress?.downloading}
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
            selectedQuote={selectedQuote}
            onQuoteClear={handleQuoteClear}
          />
          <div className="flex items-center gap-2.5 mt-1.5 px-1 text-[10px] text-gray-600 leading-none">
            {isServiceReady ? (
              <>
                {indexingProgress ? (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-[6px] h-[6px] rounded-[1px] bg-yellow-500 animate-pulse flex-shrink-0"></span>
                    <span>indexing {indexingProgress.indexed}/{indexingProgress.total} documents</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-[6px] h-[6px] rounded-[1px] bg-pink-500 flex-shrink-0"></span>
                    <span>ready</span>
                  </span>
                )}
                {props.project && (
                  <span className="flex items-center gap-1 font-mono">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="flex-shrink-0">
                      <path d="M2 4l6-2.5L14 4v8l-6 2.5L2 12V4z" stroke="var(--sl-text-faint)" strokeWidth="0.75" fill="none" />
                      <path d="M8 6.5v8" stroke="var(--sl-text-faint)" strokeWidth="0.5" />
                      <path d="M2 4l6 2.5L14 4" stroke="var(--sl-text-faint)" strokeWidth="0.5" fill="none" />
                    </svg>
                    <span>~/smartloop/{props.project.name || props.project.title || 'project'}</span>
                  </span>
                )}
                <span className="flex items-center gap-2.5 ml-auto">
                  <span><span className="text-gray-500">&lt;esc&gt;</span> <span className="text-gray-700">interrupt</span></span>
                  <span><span className="text-gray-500">&lt;ctrl+tab&gt;</span> <span className="text-gray-700">switch conversation</span></span>
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1">
                <span className="inline-block w-[6px] h-[6px] rounded-[1px] bg-yellow-500 animate-pulse flex-shrink-0"></span>
                <span>starting</span>
              </span>
            )}
          </div>
        </footer>

      </Box>

    </>
  )
}
