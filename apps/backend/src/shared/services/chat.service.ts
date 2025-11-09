import { ChatMessageType, Prisma } from '@prisma/client';
import prisma from '../database/prisma';
import { logger } from '../utils/logger';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const messageInclude = {
  sender: {
    select: {
      id: true,
      name: true,
      email: true,
      picture: true,
    },
  },
  recipient: {
    select: {
      id: true,
      name: true,
      email: true,
      picture: true,
    },
  },
} satisfies Prisma.ChatMessageInclude;

export interface SaveMessageInput {
  roomId: string;
  senderId: string;
  recipientId?: string | null;
  content: string;
  messageType: ChatMessageType;
}

export interface FetchMessagesInput {
  roomId: string;
  limit?: number;
  cursor?: string;
}

export interface FetchDirectMessagesInput extends FetchMessagesInput {
  participantAId: string;
  participantBId: string;
}

export type ChatMessageRecord = Prisma.ChatMessageGetPayload<{
  include: typeof messageInclude;
}>;

export class ChatService {
  static async saveMessage(input: SaveMessageInput): Promise<ChatMessageRecord> {
    try {
      return await prisma.chatMessage.create({
        data: {
          roomId: input.roomId,
          senderId: input.senderId,
          recipientId: input.recipientId ?? null,
          content: input.content,
          messageType: input.messageType,
        },
        include: messageInclude,
      });
    } catch (error: any) {
      logger.error('ChatService.saveMessage failed', {
        roomId: input.roomId,
        senderId: input.senderId,
        recipientId: input.recipientId,
        error: error?.message ?? error,
      });
      throw error;
    }
  }

  static async getBroadcastMessages(params: FetchMessagesInput): Promise<ChatMessageRecord[]> {
    const limit = this.normalizeLimit(params.limit);
    return prisma.chatMessage.findMany({
      where: {
        roomId: params.roomId,
        messageType: {
          in: [ChatMessageType.BROADCAST, ChatMessageType.SYSTEM],
        },
      },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    }).then(messages => messages.reverse());
  }

  static async getDirectMessages(params: FetchDirectMessagesInput): Promise<ChatMessageRecord[]> {
    const limit = this.normalizeLimit(params.limit);
    return prisma.chatMessage.findMany({
      where: {
        roomId: params.roomId,
        messageType: ChatMessageType.DIRECT,
        OR: [
          {
            senderId: params.participantAId,
            recipientId: params.participantBId,
          },
          {
            senderId: params.participantBId,
            recipientId: params.participantAId,
          },
        ],
      },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    }).then(messages => messages.reverse());
  }

  private static normalizeLimit(limit?: number): number {
    if (!limit || Number.isNaN(limit)) {
      return DEFAULT_LIMIT;
    }
    return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
  }
}


