import * as mediasoup from 'mediasoup';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';
import { RedisStateService } from '../shared/services/state.redis';

type Router = mediasoup.types.Router;
type WebRtcTransport = mediasoup.types.WebRtcTransport;

// Store event listeners for cleanup
type TransportEventHandlers = {
  icestatechange: (iceState: string) => void;
  dtlsstatechange: (dtlsState: string) => void;
};

export class TransportManager {
  private static transports: Map<string, WebRtcTransport> = new Map();
  private static eventHandlers: Map<string, TransportEventHandlers> = new Map();

  static async createTransport(
    router: Router,
    socketId: string,
    roomId: string,
    isProducer: boolean
  ): Promise<WebRtcTransport> {
    const transport = await router.createWebRtcTransport(mediasoupConfig.webRtcTransport);

    // Create event handlers that can be cleaned up
    const handlers: TransportEventHandlers = {
      icestatechange: (iceState: string) => {
        logger.debug(`Transport ${transport.id} ICE state: ${iceState}`);
      },
      dtlsstatechange: (dtlsState: string) => {
        logger.debug(`Transport ${transport.id} DTLS state: ${dtlsState}`);
        if (dtlsState === 'closed') {
          // Clean up event listeners before closing
          this.removeEventListeners(transport.id);
          transport.close();
        }
      },
    };

    // Attach event listeners
    transport.on('icestatechange', handlers.icestatechange);
    transport.on('dtlsstatechange', handlers.dtlsstatechange);

    // Store handlers for cleanup
    this.eventHandlers.set(transport.id, handlers);
    this.transports.set(transport.id, transport);
    
    // Store transport metadata in Redis
    try {
      await RedisStateService.storeTransportMetadata(
        transport.id,
        socketId,
        roomId,
        isProducer
      );
    } catch (error) {
      logger.error(`Failed to store transport metadata in Redis: ${transport.id}`, error);
      // Continue without Redis - graceful degradation
    }
    
    // Log transport details for debugging
    const iceParameters = transport.iceParameters;
    const iceCandidates = transport.iceCandidates;
    const announcedIp = mediasoupConfig.webRtcTransport.listenIps[0]?.announcedIp;
    
    // Check for problematic ICE candidates (0.0.0.0 IPs)
    const hasInvalidIps = iceCandidates.some((c: any) => c.ip === '0.0.0.0');
    if (hasInvalidIps && !announcedIp) {
      logger.warn(`⚠️ Transport ${transport.id} has ICE candidates with 0.0.0.0 IP. Set MEDIASOUP_ANNOUNCED_IP environment variable for remote connections!`);
      logger.warn(`Current ICE candidates:`, iceCandidates.map((c: any) => ({ ip: c.ip, port: c.port, type: c.type })));
    }
    
    logger.info(`Transport created: ${transport.id}`, {
      iceParameters,
      iceCandidatesCount: iceCandidates.length,
      announcedIp: announcedIp || 'auto-detect (may not work for remote connections)',
      hasInvalidIps,
    });
    
    return transport;
  }

  static getTransport(transportId: string): WebRtcTransport | undefined {
    return this.transports.get(transportId);
  }

  static async closeTransport(transportId: string): Promise<void> {
    const transport = this.transports.get(transportId);
    if (transport) {
      // Get metadata before removing
      try {
        const metadata = await RedisStateService.getTransportMetadata(transportId);
        if (metadata) {
          await RedisStateService.removeTransportMetadata(transportId, metadata.socketId);
        }
      } catch (error) {
        logger.error(`Failed to remove transport metadata from Redis: ${transportId}`, error);
      }
      
      // Remove event listeners before closing
      this.removeEventListeners(transportId);
      transport.close();
      this.transports.delete(transportId);
    }
  }

  private static removeEventListeners(transportId: string) {
    const transport = this.transports.get(transportId);
    const handlers = this.eventHandlers.get(transportId);

    if (transport && handlers) {
      // Remove all event listeners
      transport.off('icestatechange', handlers.icestatechange);
      transport.off('dtlsstatechange', handlers.dtlsstatechange);

      // Remove handlers from map
      this.eventHandlers.delete(transportId);
      logger.debug(`Removed event listeners for transport ${transportId}`);
    }
  }

  static async closeAllTransports(socketId: string): Promise<void> {
    // Get transports for this socket from Redis (for cross-server scenarios)
    let transportIds: string[] = [];
    try {
      transportIds = await RedisStateService.getSocketTransports(socketId);
    } catch (error) {
      logger.error(`Failed to get transport IDs from Redis for socket ${socketId}:`, error);
    }

    // Also check local transports (if socketId matches)
    // Note: We don't have socketId -> transports mapping locally, so we'll rely on Redis
    // If Redis fails, we'll need another approach - for now, try to close transports from Redis metadata
    const transportsToClose: string[] = [];
    
    // Get metadata from Redis to find which transports belong to this socket
    for (const transportId of transportIds) {
      // Check if transport exists locally
      if (this.transports.has(transportId)) {
        transportsToClose.push(transportId);
      }
    }
    
    // Close local transports
    await Promise.all(transportsToClose.map(transportId => this.closeTransport(transportId)));
    
    // Clean up from Redis for this socket (even if not found locally)
    try {
      await Promise.all(transportIds.map(tid => 
        RedisStateService.getTransportMetadata(tid).then(async (metadata) => {
          if (metadata && metadata.socketId === socketId) {
            await RedisStateService.removeTransportMetadata(tid, socketId);
          }
        }).catch(err =>
          logger.error(`Failed to remove transport metadata: ${tid}`, err)
        )
      ));
    } catch (error) {
      logger.error(`Failed to cleanup transport metadata from Redis for socket ${socketId}:`, error);
    }
    
    logger.debug(`Closed all transports for socket ${socketId}`);
  }

  static getStats() {
    return {
      total: this.transports.size,
    };
  }
}

