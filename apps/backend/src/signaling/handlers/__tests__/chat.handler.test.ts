import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../shared/services/chat.service', () => ({
  ChatService: {
    saveMessage: vi.fn(),
  },
}));

vi.mock('../../../shared/services/state.redis', () => ({
  RedisStateService: {
    getRoomControlState: vi.fn(),
  },
}));

vi.mock('../../../shared/services/rooms.service', () => ({
  RoomService: {
    getRoomHostState: vi.fn(),
  },
}));

vi.mock('../../../shared/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { ChatService } from '../../../shared/services/chat.service';
import { RedisStateService } from '../../../shared/services/state.redis';
import { RoomService } from '../../../shared/services/rooms.service';
import { chatHandler } from '../chat.handler';

const saveMessageMock = ChatService.saveMessage as ReturnType<typeof vi.fn>;
const getRoomControlStateMock = RedisStateService.getRoomControlState as ReturnType<typeof vi.fn>;
const getRoomHostStateMock = RoomService.getRoomHostState as ReturnType<typeof vi.fn>;

describe('chatHandler chat mute enforcement', () => {
  beforeEach(() => {
    saveMessageMock.mockReset();
    getRoomControlStateMock.mockReset();
    getRoomHostStateMock.mockReset();
  });

  const createSocket = (overrides: Partial<any> = {}) => {
    const handlers: Record<string, (...args: any[]) => void> = {};
    const socket = {
      data: {
        roomId: 'room-123',
        roomCode: 'team-room',
        userId: 'user-1',
        isAdmin: false,
        ...overrides.data,
      },
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        handlers[event] = handler;
      }),
      emit: vi.fn(),
      to: vi.fn(() => ({
        emit: vi.fn(),
      })),
    };
    return { socket, handlers };
  };

  const createIo = () => ({
    to: vi.fn(() => ({
      emit: vi.fn(),
    })),
    sockets: {
      sockets: new Map(),
    },
  });

  it('rejects non-host chat messages when chat is force muted', async () => {
    getRoomControlStateMock.mockResolvedValue({
      roomCode: 'team-room',
      locked: false,
      lockedBy: null,
      lockedAt: null,
      lockedReason: null,
      audioForceAll: false,
      audioForcedBy: null,
      audioForcedAt: null,
      audioForceReason: null,
      videoForceAll: false,
      videoForcedBy: null,
      videoForcedAt: null,
      videoForceReason: null,
      chatForceAll: true,
      chatForcedBy: 'host-1',
      chatForcedAt: Date.now(),
      chatForceReason: 'Moderation pause',
      updatedAt: Date.now(),
    });

    const io = createIo();
    const { socket, handlers } = createSocket();

    chatHandler(io as any, socket as any);

    const sendHandler = handlers['chat:send'];
    expect(sendHandler).toBeDefined();

    const ack = vi.fn();
    await sendHandler({ content: 'This should fail' }, ack);

    expect(ack).toHaveBeenCalledWith({
      success: false,
      error: 'Chat disabled by host: Moderation pause',
      code: 'CHAT_MUTED',
    });
    expect(saveMessageMock).not.toHaveBeenCalled();
    expect(getRoomHostStateMock).not.toHaveBeenCalled();
  });

  it('allows host to send messages even when chat is force muted', async () => {
    getRoomControlStateMock.mockResolvedValue({
      roomCode: 'team-room',
      locked: false,
      lockedBy: null,
      lockedAt: null,
      lockedReason: null,
      audioForceAll: false,
      audioForcedBy: null,
      audioForcedAt: null,
      audioForceReason: null,
      videoForceAll: false,
      videoForcedBy: null,
      videoForcedAt: null,
      videoForceReason: null,
      chatForceAll: true,
      chatForcedBy: 'host-1',
      chatForcedAt: Date.now(),
      chatForceReason: 'Moderation pause',
      updatedAt: Date.now(),
    });

    const messageCreatedAt = new Date().toISOString();
    saveMessageMock.mockResolvedValue({
      id: 'msg-1',
      roomId: 'room-123',
      senderId: 'host-1',
      recipientId: null,
      content: 'Host announcement',
      messageType: 'BROADCAST',
      createdAt: messageCreatedAt,
      updatedAt: messageCreatedAt,
      sender: null,
      recipient: null,
    });

    const io = createIo();
    const { socket, handlers } = createSocket({
      data: { userId: 'host-1', isAdmin: true },
    });

    chatHandler(io as any, socket as any);

    const sendHandler = handlers['chat:send'];
    const ack = vi.fn();

    await sendHandler({ content: 'Host announcement' }, ack);

    expect(saveMessageMock).toHaveBeenCalledTimes(1);
    expect(io.to).toHaveBeenCalledWith('team-room');
    expect(ack).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        messageId: 'msg-1',
      })
    );
  });
});

