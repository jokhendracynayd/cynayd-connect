import { FastifyRequest, FastifyReply } from 'fastify';
import { RoomService } from '../../shared/services/rooms.service';

export class RoomsController {
  static async createRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { name } = request.body as any;
    
    const room = await RoomService.createRoom(userId, { name });
    
    return reply.code(201).send({
      success: true,
      data: room,
      message: 'Room created successfully',
    });
  }

  static async getRoom(request: FastifyRequest, reply: FastifyReply) {
    const { roomCode } = request.params as any;
    
    const room = await RoomService.getRoomByCode(roomCode);
    
    return reply.code(200).send({
      success: true,
      data: room,
    });
  }

  static async joinRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { roomCode } = request.params as any;
    
    const room = await RoomService.joinRoom(userId, roomCode);
    
    return reply.code(200).send({
      success: true,
      data: room,
      message: 'Joined room successfully',
    });
  }

  static async leaveRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { roomCode } = request.params as any;
    
    await RoomService.leaveRoom(userId, roomCode);
    
    return reply.code(200).send({
      success: true,
      message: 'Left room successfully',
    });
  }
}

