import type { Router, WebRtcTransport } from 'mediasoup';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';

// Store event listeners for cleanup
type TransportEventHandlers = {
  icestatechange: (iceState: string) => void;
  icecandidate: (candidate: any) => void;
  dtlsstatechange: (dtlsState: string) => void;
  close: () => void;
};

export class TransportManager {
  private static transports: Map<string, WebRtcTransport> = new Map();
  private static eventHandlers: Map<string, TransportEventHandlers> = new Map();

  static async createTransport(router: Router, _socketId: string): Promise<WebRtcTransport> {
    const transport = await router.createWebRtcTransport(mediasoupConfig.webRtcTransport);

    // Create event handlers that can be cleaned up
    const handlers: TransportEventHandlers = {
      icestatechange: (iceState: string) => {
        logger.debug(`Transport ${transport.id} ICE state: ${iceState}`);
      },
      icecandidate: (candidate: any) => {
        logger.debug(`Transport ${transport.id} ICE candidate:`, {
          foundation: candidate?.foundation,
          priority: candidate?.priority,
          ip: candidate?.ip,
          port: candidate?.port,
          type: candidate?.type,
          protocol: candidate?.protocol,
        });
      },
      dtlsstatechange: (dtlsState: string) => {
        logger.debug(`Transport ${transport.id} DTLS state: ${dtlsState}`);
        if (dtlsState === 'closed') {
          // Clean up event listeners before closing
          this.removeEventListeners(transport.id);
          transport.close();
        }
      },
      close: () => {
        // Remove from maps and clean up handlers
        this.removeEventListeners(transport.id);
        this.transports.delete(transport.id);
        logger.debug(`Transport ${transport.id} closed`);
      },
    };

    // Attach event listeners
    transport.on('icestatechange', handlers.icestatechange);
    transport.on('icecandidate', handlers.icecandidate);
    transport.on('dtlsstatechange', handlers.dtlsstatechange);
    transport.on('close', handlers.close);

    // Store handlers for cleanup
    this.eventHandlers.set(transport.id, handlers);
    this.transports.set(transport.id, transport);
    
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

  static closeTransport(transportId: string) {
    const transport = this.transports.get(transportId);
    if (transport) {
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
      transport.off('icecandidate', handlers.icecandidate);
      transport.off('dtlsstatechange', handlers.dtlsstatechange);
      transport.off('close', handlers.close);

      // Remove handlers from map
      this.eventHandlers.delete(transportId);
      logger.debug(`Removed event listeners for transport ${transportId}`);
    }
  }

  static closeAllTransports(_socketId: string) {
    const transportsToClose: string[] = [];
    
    for (const [transportId] of this.transports.entries()) {
      transportsToClose.push(transportId);
    }
    
    transportsToClose.forEach(transportId => {
      this.closeTransport(transportId);
    });
    
    // Clean up any remaining handlers
    this.eventHandlers.clear();
    
    logger.debug(`Closed all transports`);
  }

  static getStats() {
    return {
      total: this.transports.size,
    };
  }
}

