/**
 * Chat Stream Service
 * Thin wrapper over the main-process chat channels. The stream itself lives in
 * `electron/chat-stream.js`; this is only the call surface.
 */

import type {
  ChatSendRequest,
  ChatStreamEvent,
  ChatStreamSnapshot,
} from '@/electron';

const api = () => (window as any).electronAPI;

class ChatStreamService {
  /** Start a turn. Resolves as soon as main accepts it, not when it finishes. */
  async send(request: ChatSendRequest) {
    const res = await api()?.chatSend?.(request);
    return res || { success: false as const, error: 'Local API not available' };
  }

  /** Disconnect the socket, which is what actually stops the backend. */
  async stop(conversationId: string) {
    const res = await api()?.chatAbort?.(conversationId);
    return res || { success: false, error: 'Local API not available' };
  }

  /** Every live and recently-finished turn, for adoption after a reload. */
  async snapshot(): Promise<Record<string, ChatStreamSnapshot>> {
    try {
      const res = await api()?.chatGetState?.();
      return res?.success ? res.streams : {};
    } catch (error) {
      console.error('[ChatStream] snapshot failed:', error);
      return {};
    }
  }

  /** Returns an unsubscribe closure — never a channel-wide removeAllListeners. */
  subscribe(callback: (event: ChatStreamEvent) => void): () => void {
    return api()?.onChatStreamEvent?.(callback) ?? (() => {});
  }
}

export const chatStreamService = new ChatStreamService();
