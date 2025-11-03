import { z } from 'zod';

export const createRoomSchema = z.object({
  body: z.object({
    name: z.string().optional(),
    isPublic: z.boolean().optional(),
  }),
});

export const joinRoomSchema = z.object({
  params: z.object({
    roomCode: z.string().regex(/^[a-z]{4}-[a-z]{4}-[a-z]{4}$/, 'Invalid room code format'),
  }),
});

export const getRoomSchema = z.object({
  params: z.object({
    roomCode: z.string(),
  }),
});

export const requestJoinRoomSchema = z.object({
  params: z.object({
    roomCode: z.string(),
  }),
});

export const approveJoinRequestSchema = z.object({
  params: z.object({
    roomCode: z.string(),
    requestId: z.string().uuid(),
  }),
});

export const rejectJoinRequestSchema = z.object({
  params: z.object({
    roomCode: z.string(),
    requestId: z.string().uuid(),
  }),
});

export const getPendingRequestsSchema = z.object({
  params: z.object({
    roomCode: z.string(),
  }),
});

export const updateRoomSettingsSchema = z.object({
  params: z.object({
    roomCode: z.string(),
  }),
  body: z.object({
    isPublic: z.boolean().optional(),
  }),
});

