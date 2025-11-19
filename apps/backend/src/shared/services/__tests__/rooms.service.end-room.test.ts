import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParticipantRole } from '@prisma/client';
import { RoomService } from '../rooms.service';
import prisma from '../../database/prisma';

vi.mock('../../database/prisma', () => {
  const mockRoom = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const mockParticipant = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prismaMock = {
    room: mockRoom,
    participant: mockParticipant,
    $transaction: vi.fn(),
  };

  return {
    default: prismaMock,
  };
});

vi.mock('../../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

const prismaMock = prisma as unknown as {
  room: {
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  participant: {
    findFirst: ReturnType<typeof vi.fn>;
    updateMany: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

describe('RoomService.endRoom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (cb: any) => {
      if (typeof cb === 'function') {
        return cb({
          room: {
            update: prismaMock.room.update,
          },
          participant: {
            updateMany: prismaMock.participant.updateMany,
          },
        });
      }
      return undefined;
    });
  });

  it('allows the host to end the room', async () => {
    const now = new Date('2024-01-01T00:00:00.000Z');

    prismaMock.room.findUnique.mockResolvedValue({
      id: 'room-1',
      adminId: 'host-1',
      isActive: true,
      endedAt: null,
    });

    prismaMock.room.update.mockResolvedValue({
      id: 'room-1',
      endedAt: now,
    });

    prismaMock.participant.updateMany.mockResolvedValue({
      count: 3,
    });

    const result = await RoomService.endRoom('host-1', 'room-1');

    expect(result.wasAlreadyEnded).toBe(false);
    expect(result.participantsUpdated).toBe(3);
    expect(prismaMock.participant.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.room.update).toHaveBeenCalledWith({
      where: { id: 'room-1' },
      data: {
        isActive: false,
        endedAt: expect.any(Date),
      },
      select: {
        id: true,
        endedAt: true,
      },
    });
  });

  it('allows a co-host to end the room', async () => {
    prismaMock.room.findUnique.mockResolvedValue({
      id: 'room-2',
      adminId: 'host-9',
      isActive: true,
      endedAt: null,
    });

    prismaMock.participant.findFirst.mockResolvedValue({
      role: ParticipantRole.COHOST,
    });

    prismaMock.room.update.mockResolvedValue({
      id: 'room-2',
      endedAt: new Date(),
    });

    prismaMock.participant.updateMany.mockResolvedValue({
      count: 5,
    });

    const result = await RoomService.endRoom('cohost-1', 'room-2');
    expect(result.endedBy).toBe('cohost-1');
    expect(result.participantsUpdated).toBe(5);
  });

  it('prevents participants from ending the room', async () => {
    prismaMock.room.findUnique.mockResolvedValue({
      id: 'room-3',
      adminId: 'host-2',
      isActive: true,
      endedAt: null,
    });

    prismaMock.participant.findFirst.mockResolvedValue({
      role: ParticipantRole.PARTICIPANT,
    });

    await expect(RoomService.endRoom('user-3', 'room-3')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Only the host or a co-host can end the meeting.',
    });
  });

  it('returns idempotent result when already ended', async () => {
    const endedAt = new Date('2024-02-02T10:00:00.000Z');

    prismaMock.room.findUnique.mockResolvedValue({
      id: 'room-4',
      adminId: 'host-4',
      isActive: false,
      endedAt,
    });

    const result = await RoomService.endRoom('host-4', 'room-4');

    expect(result.wasAlreadyEnded).toBe(true);
    expect(result.endedAt).toEqual(endedAt);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});


