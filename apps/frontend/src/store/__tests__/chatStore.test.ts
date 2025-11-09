import { describe, it, expect, beforeEach } from 'vitest';
import { useCallStore, EVERYONE_CONVERSATION_ID, type ChatMessage } from '../callStore';

const baseMessage: ChatMessage = {
  id: 'message-1',
  roomId: 'room-1',
  senderId: 'user-1',
  recipientId: null,
  content: 'Hello team',
  messageType: 'BROADCAST',
  createdAt: new Date('2025-11-09T12:00:00Z').toISOString(),
  updatedAt: new Date('2025-11-09T12:00:00Z').toISOString(),
  sender: {
    id: 'user-1',
    name: 'User One',
    email: 'one@example.com',
    picture: null,
  },
  recipient: null,
  status: 'sent',
};

describe('callStore chat state', () => {
  beforeEach(() => {
    useCallStore.getState().resetCallState();
  });

  it('increments unread count when message arrives while panel closed', () => {
    useCallStore
      .getState()
      .ingestChatMessage(baseMessage, { currentUserId: 'local-user', markAsRead: false });

    const state = useCallStore.getState();
    const conversation = state.chat.conversations.get(EVERYONE_CONVERSATION_ID);
    const messages = state.chat.messages.get(EVERYONE_CONVERSATION_ID);

    expect(messages?.length).toBe(1);
    expect(conversation?.unreadCount).toBe(1);
  });

  it('resets unread count when active conversation is selected', () => {
    useCallStore
      .getState()
      .ingestChatMessage(baseMessage, { currentUserId: 'local-user', markAsRead: false });

    useCallStore.getState().setChatActiveConversation(EVERYONE_CONVERSATION_ID);

    const conversation = useCallStore.getState().chat.conversations.get(EVERYONE_CONVERSATION_ID);
    expect(conversation?.unreadCount).toBe(0);
  });

  it('creates direct conversation for DM and increments unread', () => {
    const directMessage: ChatMessage = {
      ...baseMessage,
      id: 'dm-1',
      messageType: 'DIRECT',
      recipientId: 'local-user',
      senderId: 'user-2',
      content: 'Private hello',
      sender: {
        id: 'user-2',
        name: 'User Two',
        email: 'two@example.com',
        picture: null,
      },
    };

    useCallStore
      .getState()
      .ingestChatMessage(directMessage, { currentUserId: 'local-user', markAsRead: false });

    const state = useCallStore.getState();
    const directId = `direct:${directMessage.senderId}`;
    const conversation = state.chat.conversations.get(directId);
    const messages = state.chat.messages.get(directId);

    expect(conversation?.type).toBe('direct');
    expect(conversation?.unreadCount).toBe(1);
    expect(messages?.[0]?.content).toBe('Private hello');
  });
});


