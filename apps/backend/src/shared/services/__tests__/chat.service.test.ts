import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChatMessageType } from '@prisma/client';
import { ChatService } from '../chat.service';
import prisma from '../../database/prisma';

vi.mock('../../database/prisma', () => {
  return {
    default: {
      chatMessage: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    },
  };
});

vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const prismaMock = prisma as unknown as {
  chatMessage: {
    create: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

const baseMessage = {
  id: 'message-id',
  roomId: 'room-123',
  senderId: 'user-a',
  recipientId: null,
  content: 'Hello world',
  messageType: ChatMessageType.BROADCAST,
  createdAt: new Date('2025-11-09T10:00:00.000Z'),
  updatedAt: new Date('2025-11-09T10:00:00.000Z'),
  sender: {
    id: 'user-a',
    name: 'User A',
    email: 'a@example.com',
    picture: null,
  },
  recipient: null,
};

describe('ChatService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists chat messages with metadata', async () => {
    prismaMock.chatMessage.create.mockResolvedValue(baseMessage);

    const result = await ChatService.saveMessage({
      roomId: baseMessage.roomId,
      senderId: baseMessage.senderId,
      recipientId: baseMessage.recipientId,
      content: baseMessage.content,
      messageType: ChatMessageType.BROADCAST,
    });

    expect(prismaMock.chatMessage.create).toHaveBeenCalledWith({
      data: {
        roomId: baseMessage.roomId,
        senderId: baseMessage.senderId,
        recipientId: baseMessage.recipientId,
        content: baseMessage.content,
        messageType: ChatMessageType.BROADCAST,
      },
      include: expect.any(Object),
    });
    expect(result).toEqual(baseMessage);
  });

  it('returns broadcast messages in ascending order', async () => {
    const newer = { ...baseMessage, id: 'newer', createdAt: new Date('2025-11-09T11:00:00Z') };
    prismaMock.chatMessage.findMany.mockResolvedValue([newer, baseMessage]);

    const messages = await ChatService.getBroadcastMessages({
      roomId: baseMessage.roomId,
      limit: 25,
    });

    expect(prismaMock.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roomId: baseMessage.roomId,
          messageType: { in: [ChatMessageType.BROADCAST, ChatMessageType.SYSTEM] },
        }),
        orderBy: { createdAt: 'desc' },
        take: 25,
      })
    );
    expect(messages[0]).toEqual(baseMessage);
    expect(messages[1]).toEqual(newer);
  });

  it('filters direct messages by participants', async () => {
    const directMessage = {
      ...baseMessage,
      id: 'direct-1',
      messageType: ChatMessageType.DIRECT,
      recipientId: 'user-b',
    };
    prismaMock.chatMessage.findMany.mockResolvedValue([directMessage]);

    const messages = await ChatService.getDirectMessages({
      roomId: baseMessage.roomId,
      participantAId: 'user-a',
      participantBId: 'user-b',
      limit: 10,
    });

    expect(prismaMock.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roomId: baseMessage.roomId,
          messageType: ChatMessageType.DIRECT,
          OR: [
            { senderId: 'user-a', recipientId: 'user-b' },
            { senderId: 'user-b', recipientId: 'user-a' },
          ],
        }),
        take: 10,
      })
    );
    expect(messages).toEqual([directMessage]);
  });
});


