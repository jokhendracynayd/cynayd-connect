import { z } from 'zod';

export const createRoomSchema = z.object({
  body: z.object({
    name: z.string().optional(),
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

