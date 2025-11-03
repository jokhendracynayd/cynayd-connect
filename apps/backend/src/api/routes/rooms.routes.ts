import { FastifyInstance } from 'fastify';
import { RoomsController } from '../controllers/rooms.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { createRoomSchema, getRoomSchema, joinRoomSchema } from '../schemas/rooms.schema';

export async function roomsRoutes(fastify: FastifyInstance) {
  // Create room (protected)
  fastify.post('/', {
    preHandler: [authMiddleware],
    schema: createRoomSchema,
    handler: RoomsController.createRoom,
  });

  // Get room details
  fastify.get('/:roomCode', {
    schema: getRoomSchema,
    handler: RoomsController.getRoom,
  });

  // Join room (protected)
  fastify.post('/:roomCode/join', {
    preHandler: [authMiddleware],
    schema: joinRoomSchema,
    handler: RoomsController.joinRoom,
  });

  // Leave room (protected)
  fastify.post('/:roomCode/leave', {
    preHandler: [authMiddleware],
    schema: joinRoomSchema,
    handler: RoomsController.leaveRoom,
  });
}

