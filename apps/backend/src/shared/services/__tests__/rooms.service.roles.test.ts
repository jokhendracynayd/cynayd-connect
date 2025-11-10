import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ParticipantRole } from '@prisma/client';
import { RoomService } from '../rooms.service';
import prisma from '../../database/prisma';
import { ForbiddenError, ConflictError } from '../../utils/errors';

vi.mock('../../database/prisma', () => ({
  default: {
    room: {
      findUnique: vi.fn(),
    },
    participant: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const prismaMock = prisma as unknown as {
  room: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  participant: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
};

const baseRoom = {
  id: 'room-1',
  adminId: 'host-1',
};

const activeParticipant = {
  id: 'participant-1',
  role: ParticipantRole.PARTICIPANT,
};

describe('RoomService co-host role management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.room.findUnique.mockResolvedValue(baseRoom);
  });

  it('promotes an active participant to co-host', async () => {
    prismaMock.participant.findFirst.mockResolvedValue(activeParticipant);
    prismaMock.participant.update.mockResolvedValue({ role: ParticipantRole.COHOST });

    const result = await RoomService.promoteToCoHost('host-1', 'room-1', 'user-2');

    expect(prismaMock.participant.update).toHaveBeenCalledWith({
      where: { id: activeParticipant.id },
      data: { role: ParticipantRole.COHOST },
      select: { role: true },
    });
    expect(result).toEqual({ userId: 'user-2', role: ParticipantRole.COHOST });
  });

  it('demotes a co-host back to participant', async () => {
    prismaMock.participant.findFirst.mockResolvedValue({
      id: 'participant-2',
      role: ParticipantRole.COHOST,
    });
    prismaMock.participant.update.mockResolvedValue({ role: ParticipantRole.PARTICIPANT });

    const result = await RoomService.demoteToParticipant('host-1', 'room-1', 'user-3');

    expect(prismaMock.participant.update).toHaveBeenCalledWith({
      where: { id: 'participant-2' },
      data: { role: ParticipantRole.PARTICIPANT },
      select: { role: true },
    });
    expect(result).toEqual({ userId: 'user-3', role: ParticipantRole.PARTICIPANT });
  });

  it('skips database write when role is unchanged', async () => {
    prismaMock.participant.findFirst.mockResolvedValue({
      id: 'participant-3',
      role: ParticipantRole.COHOST,
    });

    const result = await RoomService.promoteToCoHost('host-1', 'room-1', 'user-4');

    expect(prismaMock.participant.update).not.toHaveBeenCalled();
    expect(result).toEqual({ userId: 'user-4', role: ParticipantRole.COHOST });
  });

  it('rejects co-host promotion attempts from non-host actors', async () => {
    prismaMock.room.findUnique.mockResolvedValue(baseRoom);

    await expect(
      RoomService.promoteToCoHost('user-2', 'room-1', 'user-3')
    ).rejects.toBeInstanceOf(ForbiddenError);

    expect(prismaMock.participant.update).not.toHaveBeenCalled();
  });

  it('prevents reassigning the host role', async () => {
    prismaMock.participant.findFirst.mockResolvedValue(activeParticipant);

    await expect(
      RoomService.setParticipantRole('host-1', 'room-1', 'user-2', ParticipantRole.HOST)
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

