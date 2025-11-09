import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { socketManager } from '../../lib/socket';
import { EVERYONE_CONVERSATION_ID, useCallStore } from '../../store/callStore';
import type { ChatConversation, ChatMessage, ChatUserInfo } from '../../store/callStore';

const DIRECT_PREFIX = 'direct:';

const getDirectConversationId = (userId: string) => `${DIRECT_PREFIX}${userId}`;

const getParticipantIdFromConversation = (conversationId: string): string | undefined => {
  if (!conversationId.startsWith(DIRECT_PREFIX)) {
    return undefined;
  }
  return conversationId.slice(DIRECT_PREFIX.length);
};

const normalizeChatMessage = (message: any): ChatMessage => ({
  id: message.id,
  roomId: message.roomId ?? '',
  senderId: message.senderId ?? '',
  recipientId: message.recipientId ?? null,
  content: message.content ?? '',
  messageType: message.messageType ?? 'BROADCAST',
  createdAt: message.createdAt ?? new Date().toISOString(),
  updatedAt: message.updatedAt ?? message.createdAt ?? new Date().toISOString(),
  sender: message.sender ?? null,
  recipient: message.recipient ?? null,
  status: 'sent',
});

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  picture?: string | null;
}

interface ConversationOption {
  id: string;
  title: string;
  type: 'group' | 'direct';
  participantIds: string[];
  unread: number;
}

interface ChatPanelProps {
  currentUser: CurrentUser;
  className?: string;
  onClose?: () => void;
}

export default function ChatPanel({ currentUser, className, onClose }: ChatPanelProps) {
  const roomCode = useCallStore(state => state.roomCode);
  const participants = useCallStore(state => state.participants);
  const activeConversationId = useCallStore(state => state.chat.activeConversationId);
  const conversations = useCallStore(state => state.chat.conversations);
  const messagesMap = useCallStore(state => state.chat.messages);
  const setChatActiveConversation = useCallStore(state => state.setChatActiveConversation);
  const addPendingChatMessage = useCallStore(state => state.addPendingChatMessage);
  const resolvePendingChatMessage = useCallStore(state => state.resolvePendingChatMessage);
  const failPendingChatMessage = useCallStore(state => state.failPendingChatMessage);
  const applyChatHistory = useCallStore(state => state.applyChatHistory);
  const ensureChatConversation = useCallStore(state => state.ensureChatConversation);

  const activeConversation: ChatConversation | undefined = conversations.get(activeConversationId);
  const messages: ChatMessage[] = messagesMap.get(activeConversationId) ?? [];

  const [draft, setDraft] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const lastCountRef = useRef(0);

  const directParticipants = useMemo(
    () => participants.filter(participant => participant.userId !== currentUser.id),
    [participants, currentUser.id]
  );

  const conversationOptions = useMemo<ConversationOption[]>(() => {
    const options: ConversationOption[] = [];
    const groupConversation = conversations.get(EVERYONE_CONVERSATION_ID);

    options.push({
      id: EVERYONE_CONVERSATION_ID,
      title: 'Everyone',
      type: 'group',
      participantIds: [],
      unread: groupConversation?.unreadCount ?? 0,
    });

    directParticipants.forEach(participant => {
      const id = getDirectConversationId(participant.userId);
      const existing = conversations.get(id);
      options.push({
        id,
        title: participant.name || participant.email || 'Direct message',
        type: 'direct',
        participantIds: [participant.userId],
        unread: existing?.unreadCount ?? 0,
      });
    });

    conversations.forEach(conversation => {
      if (conversation.type === 'direct') {
        const exists = options.some(option => option.id === conversation.id);
        if (!exists) {
          options.push({
            id: conversation.id,
            title: conversation.title,
            type: 'direct',
            participantIds: conversation.participantIds,
            unread: conversation.unreadCount,
          });
        }
      }
    });

    return options;
  }, [conversations, directParticipants]);

  const activeParticipantId =
    activeConversation?.type === 'direct'
      ? activeConversation.participantIds[0] ?? getParticipantIdFromConversation(activeConversationId)
      : undefined;

  const activeParticipant = activeParticipantId
    ? participants.find(participant => participant.userId === activeParticipantId)
    : undefined;

  const activeRecipientName =
    activeConversation?.type === 'direct'
      ? activeParticipant?.name || activeParticipant?.email || activeConversation.title
      : 'Everyone';

  const handleSelectConversation = (option: ConversationOption) => {
    const existing = conversations.get(option.id);
    ensureChatConversation({
      id: option.id,
      type: option.type,
      title: option.title,
      participantIds: option.participantIds,
      unreadCount: existing?.unreadCount ?? 0,
      lastMessageAt: existing?.lastMessageAt,
      lastMessagePreview: existing?.lastMessagePreview,
      nextCursor: existing?.nextCursor ?? null,
      hasMoreHistory: existing?.hasMoreHistory ?? true,
    });
    setChatActiveConversation(option.id);
  };

  useEffect(() => {
    lastCountRef.current = messages.length;
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  useEffect(() => {
    const previousCount = lastCountRef.current;
    if (messages.length > previousCount && !loadingHistory) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    lastCountRef.current = messages.length;
  }, [messages.length, loadingHistory]);

  const loadHistory = async () => {
    if (loadingHistory) {
      return;
    }

    if (!activeConversation) {
      return;
    }

    if (!activeConversation.hasMoreHistory && activeConversation.nextCursor === null) {
      return;
    }

    setLoadingHistory(true);
    try {
      const participantId = activeConversation.type === 'direct'
        ? activeParticipantId
        : undefined;
      const response = await socketManager.requestChatHistory({
        participantId,
        cursor: activeConversation.nextCursor ?? undefined,
        limit: 50,
      });

      const normalizedMessages = Array.isArray(response.messages)
        ? response.messages.map(normalizeChatMessage)
        : [];

      applyChatHistory(activeConversationId, normalizedMessages, {
        currentUserId: currentUser.id,
        nextCursor: response.nextCursor ?? null,
        hasMore: Boolean(response.nextCursor),
      });
    } catch (error: any) {
      toast.error(error.message || 'Failed to load conversation history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (!activeConversation) {
      return;
    }

    const hasMessages = messages.length > 0;
    if (!hasMessages && activeConversation.hasMoreHistory) {
      void loadHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  const sendMessage = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    if (!activeConversation) {
      toast.error('Select a conversation before sending a message');
      return;
    }

    const participantId =
      activeConversation.type === 'direct'
        ? activeParticipantId
        : undefined;

    if (activeConversation.type === 'direct' && !participantId) {
      toast.error('Unable to determine participant for direct message');
      return;
    }

    const clientMessageId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const recipientInfo: ChatUserInfo | null =
      participantId && activeParticipant
        ? {
            id: activeParticipant.userId,
            name: activeParticipant.name,
            email: activeParticipant.email,
            picture: activeParticipant.picture,
          }
        : participantId
        ? {
            id: participantId,
            name: activeConversation.title,
            email: '',
            picture: null,
          }
        : null;

    const pendingMessage: ChatMessage = {
      id: '',
      roomId: roomCode ?? '',
      senderId: currentUser.id,
      recipientId: participantId ?? null,
      content: trimmed,
      messageType: activeConversation.type === 'direct' ? 'DIRECT' : 'BROADCAST',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sender: {
        id: currentUser.id,
        name: currentUser.name,
        email: currentUser.email,
        picture: currentUser.picture,
      },
      recipient: recipientInfo,
      clientMessageId,
      status: 'pending',
    };

    try {
      addPendingChatMessage(activeConversationId, pendingMessage);
      setDraft('');

      const response = await socketManager.sendChatMessage(trimmed, {
        participantId,
        clientMessageId,
      });

      resolvePendingChatMessage(activeConversationId, clientMessageId, {
        ...pendingMessage,
        id: response.messageId ?? pendingMessage.id,
        createdAt: response.timestamp ?? pendingMessage.createdAt,
        updatedAt: response.timestamp ?? pendingMessage.updatedAt,
        status: 'sent',
      });
    } catch (error: any) {
      failPendingChatMessage(activeConversationId, clientMessageId);
      toast.error(error.message || 'Failed to send message');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await sendMessage();
  };

  const renderMessage = (message: ChatMessage) => {
    const isSystem = message.messageType === 'SYSTEM';
    const isOwn = message.senderId === currentUser.id;
    const senderName =
      isOwn
        ? 'You'
        : message.sender?.name ??
          participants.find(participant => participant.userId === message.senderId)?.name ??
          'Guest';

    if (isSystem) {
      return (
        <div key={message.id} className="py-2 text-center text-xs text-slate-400">
          {message.content}
        </div>
      );
    }

    const timestamp = new Date(message.createdAt).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <div
        key={message.id || message.clientMessageId}
        className={`flex ${isOwn ? 'justify-end' : 'justify-start'} py-1`}
      >
        <div
          className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
            isOwn
              ? 'bg-blue-600 text-white'
              : 'bg-slate-100 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide">
            <span>{senderName}</span>
            <span className={isOwn ? 'text-white/70' : 'text-slate-400'}>{timestamp}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{message.content}</p>
          {message.status === 'pending' && (
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-white/70">
              Sending…
            </p>
          )}
          {message.status === 'failed' && (
            <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-red-200">
              Failed to send. Tap resend.
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`flex h-full min-h-[480px] flex-col border-l border-slate-200 bg-white ${className ?? ''}`}
    >
      <div className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">Chat</h2>
          <div className="flex items-center gap-3">
            <span className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
              {conversationOptions.length} threads
            </span>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:border-cyan-200 hover:text-cyan-600"
                aria-label="Close chat panel"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {conversationOptions.map(option => {
            const isActive = option.id === activeConversationId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleSelectConversation(option)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? 'border-blue-600 bg-blue-600 text-white shadow'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <span>{option.title}</span>
                {option.unread > 0 && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] ${
                      isActive ? 'bg-white/20 text-white' : 'bg-blue-600 text-white'
                    }`}
                  >
                    {option.unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {activeConversation?.hasMoreHistory && (
          <div className="mb-3 flex justify-center">
            <button
              type="button"
              onClick={loadHistory}
              className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400 transition hover:text-slate-600 disabled:opacity-50"
              disabled={loadingHistory}
            >
              {loadingHistory ? 'Loading…' : 'Load older messages'}
            </button>
          </div>
        )}

        {messages.length === 0 && !loadingHistory ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
            <p className="text-sm font-semibold uppercase tracking-[0.3em]">No messages yet</p>
            <p className="mt-2 text-xs">
              {activeConversation?.type === 'direct'
                ? `Start a private chat with ${activeRecipientName}.`
                : 'Say hello to everyone in the room.'}
            </p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-200 px-5 py-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold uppercase tracking-[0.3em]">
            Sending to {activeRecipientName}
          </span>
          <span>{draft.length}/2000</span>
        </div>
        <textarea
          value={draft}
          onChange={event => {
            if (event.target.value.length <= 2000) {
              setDraft(event.target.value);
            }
          }}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Type a message…"
          className="h-24 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-500 focus:bg-white"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Press Enter to send • Shift + Enter for a new line
          </span>
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-full bg-blue-600 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}


