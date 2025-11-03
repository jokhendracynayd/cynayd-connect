import redis from '../database/redis';
import { logger } from '../utils/logger';
import { config } from '../config';
import { createHash } from 'crypto';

/**
 * Room-to-Server Routing Service
 * Implements consistent hashing for room assignment to server instances
 * Supports sticky sessions and automatic failover
 */
export class RoomRoutingService {
  private static readonly KEY_PREFIX = 'connect:routing';
  private static readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private static readonly HEARTBEAT_TTL = 60000; // 60 seconds (must be > interval)
  private static readonly SERVER_STATUS_TTL = 90000; // 90 seconds
  private static heartbeatInterval?: NodeJS.Timeout;

  /**
   * Get or assign server instance for a room using consistent hashing
   * If room already has a server assignment, return it
   * Otherwise, assign to least loaded server
   */
  static async getOrAssignServer(roomId: string): Promise<string> {
    try {
      // Check if room already has a server assignment
      const existingAssignment = await this.getRoomServer(roomId);
      if (existingAssignment && await this.isServerHealthy(existingAssignment)) {
        logger.debug(`Room ${roomId} already assigned to server ${existingAssignment}`);
        return existingAssignment;
      }

      // If existing assignment is unhealthy, find new server
      if (existingAssignment) {
        logger.warn(`Room ${roomId} was assigned to unhealthy server ${existingAssignment}, reassigning...`);
        await this.removeRoomAssignment(roomId);
      }

      // Get list of healthy servers
      const healthyServers = await this.getHealthyServers();
      
      if (healthyServers.length === 0) {
        // No healthy servers, use current instance
        logger.warn('No healthy servers found, assigning room to current instance');
        const currentServer = config.server.instanceId;
        await this.assignRoomToServer(roomId, currentServer);
        return currentServer;
      }

      // Use consistent hashing to assign room to server
      const assignedServer = this.hashRoomToServer(roomId, healthyServers);
      await this.assignRoomToServer(roomId, assignedServer);
      
      logger.info(`Assigned room ${roomId} to server ${assignedServer} (consistent hashing)`);
      return assignedServer;
    } catch (error) {
      logger.error(`Error getting/assigning server for room ${roomId}:`, error);
      // Fallback to current server
      return config.server.instanceId;
    }
  }

  /**
   * Get the server instance that owns a room
   */
  static async getRoomServer(roomId: string): Promise<string | null> {
    try {
      const key = `${this.KEY_PREFIX}:room:${roomId}`;
      const serverId = await redis.get(key);
      return serverId;
    } catch (error) {
      logger.error(`Error getting room server for ${roomId}:`, error);
      return null;
    }
  }

  /**
   * Assign a room to a specific server
   */
  static async assignRoomToServer(roomId: string, serverInstanceId: string): Promise<void> {
    try {
      const key = `${this.KEY_PREFIX}:room:${roomId}`;
      // Store room -> server mapping with long TTL (rooms can last hours)
      await redis.setex(key, 86400, serverInstanceId); // 24 hours

      // Also maintain server -> rooms mapping for load tracking
      await redis.sadd(`${this.KEY_PREFIX}:server:${serverInstanceId}:rooms`, roomId);
      
      logger.debug(`Assigned room ${roomId} to server ${serverInstanceId}`);
    } catch (error) {
      logger.error(`Error assigning room ${roomId} to server ${serverInstanceId}:`, error);
      throw error;
    }
  }

  /**
   * Remove room assignment (when room closes or server fails)
   */
  static async removeRoomAssignment(roomId: string): Promise<void> {
    try {
      const key = `${this.KEY_PREFIX}:room:${roomId}`;
      const serverId = await redis.get(key);
      
      if (serverId) {
        // Remove from server -> rooms mapping
        await redis.srem(`${this.KEY_PREFIX}:server:${serverId}:rooms`, roomId);
      }
      
      await redis.del(key);
      logger.debug(`Removed room assignment for ${roomId}`);
    } catch (error) {
      logger.error(`Error removing room assignment for ${roomId}:`, error);
    }
  }

  /**
   * Consistent hashing: hash roomId to select server from healthy servers list
   */
  private static hashRoomToServer(roomId: string, servers: string[]): string {
    if (servers.length === 0) {
      return config.server.instanceId;
    }

    if (servers.length === 1) {
      return servers[0];
    }

    // Create hash of roomId
    const hash = createHash('sha256').update(roomId).digest('hex');
    const hashInt = parseInt(hash.substring(0, 8), 16);
    
    // Use modulo to select server (consistent hashing)
    const index = hashInt % servers.length;
    return servers[index];
  }

  /**
   * Get list of healthy server instances
   */
  static async getHealthyServers(): Promise<string[]> {
    try {
      const pattern = `${this.KEY_PREFIX}:server:*:status`;
      const keys = await redis.keys(pattern);
      
      const healthyServers: string[] = [];
      const now = Date.now();

      for (const key of keys) {
        const serverId = key.match(/server:([^:]+):status/)?.[1];
        if (!serverId) continue;

        const statusData = await redis.get(key);
        if (!statusData) continue;

        try {
          const status = JSON.parse(statusData);
          const lastHeartbeat = status.lastHeartbeat || 0;
          const timeSinceHeartbeat = now - lastHeartbeat;

          // Server is healthy if heartbeat within last 60 seconds
          if (timeSinceHeartbeat < this.HEARTBEAT_TTL) {
            healthyServers.push(serverId);
          }
        } catch (error) {
          logger.error(`Error parsing server status for ${serverId}:`, error);
        }
      }

      // Always include current server if not in list
      if (!healthyServers.includes(config.server.instanceId)) {
        healthyServers.push(config.server.instanceId);
      }

      return healthyServers.sort();
    } catch (error) {
      logger.error('Error getting healthy servers:', error);
      // Fallback to current server
      return [config.server.instanceId];
    }
  }

  /**
   * Check if a server is healthy
   */
  static async isServerHealthy(serverInstanceId: string): Promise<boolean> {
    try {
      const key = `${this.KEY_PREFIX}:server:${serverInstanceId}:status`;
      const statusData = await redis.get(key);
      
      if (!statusData) {
        // If current server, consider it healthy
        if (serverInstanceId === config.server.instanceId) {
          return true;
        }
        return false;
      }

      const status = JSON.parse(statusData);
      const lastHeartbeat = status.lastHeartbeat || 0;
      const timeSinceHeartbeat = Date.now() - lastHeartbeat;

      return timeSinceHeartbeat < this.HEARTBEAT_TTL;
    } catch (error) {
      logger.error(`Error checking server health for ${serverInstanceId}:`, error);
      // If checking own server, assume healthy
      return serverInstanceId === config.server.instanceId;
    }
  }

  /**
   * Start heartbeat mechanism to mark this server as alive
   */
  static startHeartbeat(): void {
    if (this.heartbeatInterval) {
      logger.warn('Heartbeat already started');
      return;
    }

    const updateHeartbeat = async () => {
      try {
        const key = `${this.KEY_PREFIX}:server:${config.server.instanceId}:status`;
        const status = {
          serverInstanceId: config.server.instanceId,
          lastHeartbeat: Date.now(),
          port: config.port,
          signalingPort: config.signalingPort,
        };

        await redis.setex(key, this.SERVER_STATUS_TTL / 1000, JSON.stringify(status));
        
        logger.debug(`Heartbeat updated for server ${config.server.instanceId}`);
      } catch (error) {
        logger.error('Error updating heartbeat:', error);
      }
    };

    // Initial heartbeat
    updateHeartbeat();

    // Schedule periodic heartbeats
    this.heartbeatInterval = setInterval(updateHeartbeat, this.HEARTBEAT_INTERVAL);
    
    logger.info(`Started heartbeat mechanism for server ${config.server.instanceId}`);
  }

  /**
   * Stop heartbeat mechanism
   */
  static stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
      logger.info('Stopped heartbeat mechanism');
    }
  }

  /**
   * Get room count for a server (for load balancing)
   */
  static async getServerRoomCount(serverInstanceId: string): Promise<number> {
    try {
      const key = `${this.KEY_PREFIX}:server:${serverInstanceId}:rooms`;
      return await redis.scard(key);
    } catch (error) {
      logger.error(`Error getting room count for server ${serverInstanceId}:`, error);
      return 0;
    }
  }

  /**
   * Get all rooms for a server
   */
  static async getServerRooms(serverInstanceId: string): Promise<string[]> {
    try {
      const key = `${this.KEY_PREFIX}:server:${serverInstanceId}:rooms`;
      return await redis.smembers(key);
    } catch (error) {
      logger.error(`Error getting rooms for server ${serverInstanceId}:`, error);
      return [];
    }
  }

  /**
   * Check if current server should handle a room (for sticky sessions)
   */
  static async shouldHandleRoom(roomId: string): Promise<boolean> {
    try {
      const assignedServer = await this.getRoomServer(roomId);
      
      // If no assignment or assigned to this server, handle it
      if (!assignedServer || assignedServer === config.server.instanceId) {
        return true;
      }

      // If assigned to another server, check if that server is healthy
      const isHealthy = await this.isServerHealthy(assignedServer);
      
      // If assigned server is unhealthy, we should handle it (takeover)
      if (!isHealthy) {
        logger.warn(`Server ${assignedServer} is unhealthy, taking over room ${roomId}`);
        await this.assignRoomToServer(roomId, config.server.instanceId);
        return true;
      }

      // Assigned to healthy server, don't handle
      return false;
    } catch (error) {
      logger.error(`Error checking if should handle room ${roomId}:`, error);
      // On error, handle it (fail-safe)
      return true;
    }
  }
}

