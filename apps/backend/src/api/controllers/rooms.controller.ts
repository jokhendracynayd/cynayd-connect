import { FastifyRequest, FastifyReply } from 'fastify';
import { RoomService } from '../../shared/services/rooms.service';

export class RoomsController {
  static async createRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { name, isPublic } = request.body as any;
    
    const room = await RoomService.createRoom(userId, { name, isPublic });
    
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

  static async requestJoinRoom(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { roomCode } = request.params as any;
    
    const requestData = await RoomService.requestRoomJoin(userId, roomCode);
    
    return reply.code(201).send({
      success: true,
      data: requestData,
      message: 'Join request sent successfully',
    });
  }

  static async approveJoinRequest(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { roomCode, requestId } = request.params as any;
    
    const result = await RoomService.approveJoinRequest(userId, roomCode, requestId);
    
    return reply.code(200).send({
      success: true,
      data: result,
      message: 'Join request approved',
    });
  }

  static async rejectJoinRequest(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { roomCode, requestId } = request.params as any;
    
    const result = await RoomService.rejectJoinRequest(userId, roomCode, requestId);
    
    return reply.code(200).send({
      success: true,
      data: result,
      message: 'Join request rejected',
    });
  }

  static async getPendingRequests(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { roomCode } = request.params as any;
    
    const requests = await RoomService.getPendingRequests(userId, roomCode);
    
    return reply.code(200).send({
      success: true,
      data: requests,
    });
  }

  static async updateRoomSettings(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.user?.userId!;
    const { roomCode } = request.params as any;
    const { isPublic } = request.body as any;
    
    const room = await RoomService.updateRoomSettings(userId, roomCode, { isPublic });
    
    return reply.code(200).send({
      success: true,
      data: room,
      message: 'Room settings updated successfully',
    });
  }
}

