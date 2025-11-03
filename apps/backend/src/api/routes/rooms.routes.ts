import { FastifyInstance } from 'fastify';
import { RoomsController } from '../controllers/rooms.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createRoomSchema,
  getRoomSchema,
  joinRoomSchema,
  requestJoinRoomSchema,
  approveJoinRequestSchema,
  rejectJoinRequestSchema,
  getPendingRequestsSchema,
  updateRoomSettingsSchema,
} from '../schemas/rooms.schema';

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

  // Request to join private room (protected)
  fastify.post('/:roomCode/request-join', {
    preHandler: [authMiddleware],
    schema: requestJoinRoomSchema,
    handler: RoomsController.requestJoinRoom,
  });

  // Approve join request (protected, admin only)
  fastify.post('/:roomCode/approve/:requestId', {
    preHandler: [authMiddleware],
    schema: approveJoinRequestSchema,
    handler: RoomsController.approveJoinRequest,
  });

  // Reject join request (protected, admin only)
  fastify.post('/:roomCode/reject/:requestId', {
    preHandler: [authMiddleware],
    schema: rejectJoinRequestSchema,
    handler: RoomsController.rejectJoinRequest,
  });

  // Get pending join requests (protected, admin only)
  fastify.get('/:roomCode/pending-requests', {
    preHandler: [authMiddleware],
    schema: getPendingRequestsSchema,
    handler: RoomsController.getPendingRequests,
  });

  // Update room settings (protected, admin only)
  fastify.patch('/:roomCode/settings', {
    preHandler: [authMiddleware],
    schema: updateRoomSettingsSchema,
    handler: RoomsController.updateRoomSettings,
  });
}

