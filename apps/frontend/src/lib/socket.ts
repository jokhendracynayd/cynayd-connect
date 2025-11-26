import io, { Socket } from 'socket.io-client';
import { config } from '../config';
import { reconnectionManager } from './reconnectionManager';

class SocketManager {
  private socket: Socket | null = null;
  private reconnectingCallbacks: Set<() => void> = new Set();
  private reconnectedCallbacks: Set<() => void> = new Set();
  private reconnectFailedCallbacks: Set<() => void> = new Set();

  connect(token: string): Socket {
    // If already connected with same token, return existing socket
    if (this.socket?.connected) {
      // Check if token changed (e.g., after refresh)
      const currentAuthToken = (this.socket.auth as any)?.token;
      if (currentAuthToken === token) {
        return this.socket;
      }
      // Token changed, reconnect
      this.socket.disconnect();
      this.socket = null;
    }

    // Get token from localStorage if not provided (for page refresh scenarios)
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    if (!authToken) {
      throw new Error('No authentication token available');
    }

    this.socket = io(config.socketUrl, {
      path: config.signalingPath,
      auth: { token: authToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
      // Notify reconnection manager of successful connection
      reconnectionManager.handleReconnect();
      // Emit reconnected event
      this.reconnectedCallbacks.forEach(callback => {
        try {
          callback();
        } catch (error) {
          console.error('Error in reconnected callback:', error);
        }
      });
    });

    // Listen to Socket.io's built-in reconnection events
    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.log('Socket reconnect attempt:', attempt);
      // ReconnectionManager already tracks reconnecting state via handleDisconnect
      // Just log the attempt number
    });

    this.socket.io.on('reconnect', (attempt) => {
      console.log('Socket reconnected after', attempt, 'attempt(s)');
      // The 'connect' event will also fire, which calls handleReconnect()
      // This is just for logging
    });

    this.socket.io.on('reconnect_error', (error) => {
      console.error('Socket reconnect error:', error);
      // Don't mark as failed yet - Socket.io will keep trying
      // Only mark as failed if max attempts reached (handled by reconnect_failed)
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error('Socket reconnect failed - max attempts reached');
      reconnectionManager.handleReconnectFailed();
      this.emitReconnectFailed();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      
      // Notify reconnection manager
      reconnectionManager.handleDisconnect(reason);
      
      // Emit reconnecting event
      this.emitReconnecting();
      
      // Socket.io handles automatic reconnection by default (reconnection: true)
      // Only manually reconnect for specific cases where auto-reconnect might not work
      // For auth errors, we handle token refresh in the error handler
      // For server disconnects, Socket.io will auto-reconnect unless explicitly disabled
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
      
      // If auth error, try to refresh token
      if (error === 'Authentication error') {
        // Token might be expired, try to refresh
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
        if (refreshToken) {
          // Import api dynamically to avoid circular dependency
          import('./api').then(({ default: api }) => {
            api.post('/api/auth/refresh', { refreshToken })
              .then((response: any) => {
                const { accessToken } = response.data;
                localStorage.setItem('token', accessToken);
                // Reconnect with new token
                this.connect(accessToken);
              })
              .catch(() => {
                // Refresh failed, mark as permanent failure
                reconnectionManager.handleReconnectFailed();
                this.emitReconnectFailed();
                this.disconnect();
              });
          });
        } else {
          // No refresh token, permanent failure
          reconnectionManager.handleReconnectFailed();
          this.emitReconnectFailed();
        }
      }
    });

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
      
      // If auth error, try to refresh token
      if (error.message === 'Authentication error' || error.message?.includes('auth')) {
        const refreshToken = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null;
        if (refreshToken) {
          import('./api').then(({ default: api }) => {
            api.post('/api/auth/refresh', { refreshToken })
              .then((response: any) => {
                const { accessToken } = response.data;
                localStorage.setItem('token', accessToken);
                // Reconnect with new token
                this.connect(accessToken);
              })
              .catch(() => {
                console.error('Token refresh failed, socket will not reconnect');
                reconnectionManager.handleReconnectFailed();
                this.emitReconnectFailed();
              });
          });
        } else {
          reconnectionManager.handleReconnectFailed();
          this.emitReconnectFailed();
        }
      }
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  joinRoom(data: { roomCode: string; name: string; email: string; picture?: string | undefined }): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('joinRoom', data, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          // Handle special cases for private rooms
          // Don't reject if waiting for approval or requires request
          if (response.waitingApproval || response.requiresRequest) {
            resolve(response); // Resolve with the response so caller can handle it
          } else {
            reject(new Error(response.error));
          }
        }
      });
    });
  }

  leaveRoom(): Promise<any> {
    return new Promise(resolve => {
      if (!this.socket || !this.socket.connected) {
        // If socket is not connected, resolve immediately (backend will cleanup on disconnect)
        console.log('Socket not connected, skipping leaveRoom emit');
        resolve({ success: true, skipped: true });
        return;
      }
      
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Don't reject, just resolve - backend will cleanup on disconnect anyway
          console.log('LeaveRoom timeout, resolving anyway');
          resolve({ success: true, timeout: true });
        }
      }, 3000); // 3 second timeout
      
      this.socket.emit('leaveRoom', {}, (response: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(response);
        }
      });
    });
  }

  createTransport(isProducer: boolean): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('createTransport', { isProducer }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  connectTransport(transportId: string, dtlsParameters: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('connectTransport', { transportId, dtlsParameters }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  produce(
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: any,
    appData?: Record<string, unknown>
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('produce', { transportId, kind, rtpParameters, appData }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  consume(transportId: string, producerId: string, rtpCapabilities: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('consume', { transportId, producerId, rtpCapabilities }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  pauseProducer(producerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('pauseProducer', { producerId }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  resumeProducer(producerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('resumeProducer', { producerId }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  notifyTrackReplaced(producerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('replaceTrack', { producerId }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  sendChatMessage(
    content: string,
    options: { participantId?: string; clientMessageId?: string } = {}
  ): Promise<{ messageId: string; timestamp: string; clientMessageId?: string }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Not connected'));
      }

      const payload: {
        content: string;
        recipientId?: string;
        clientMessageId?: string;
      } = {
        content,
      };

      if (options.participantId) {
        payload.recipientId = options.participantId;
      }
      if (options.clientMessageId) {
        payload.clientMessageId = options.clientMessageId;
      }

      this.socket.emit('chat:send', payload, (response: any) => {
          if (!response?.success) {
            return reject(new Error(response?.error || 'Failed to send message'));
          }
          resolve({
            messageId: response.messageId,
            timestamp: response.timestamp,
            clientMessageId: response.clientMessageId,
          });
        }
      );
    });
  }

  sendDirectMessage(
    participantId: string,
    content: string,
    options: { clientMessageId?: string } = {}
  ) {
    const directOptions: { participantId?: string; clientMessageId?: string } = {
      participantId,
    };
    if (options.clientMessageId) {
      directOptions.clientMessageId = options.clientMessageId;
    }
    return this.sendChatMessage(content, directOptions);
  }

  requestChatHistory(options: {
    participantId?: string;
    cursor?: string;
    limit?: number;
  }): Promise<{ messages: any[]; nextCursor?: string | null }> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        return reject(new Error('Not connected'));
      }

      const payload: {
        participantId?: string;
        cursor?: string;
        limit?: number;
      } = {};

      if (options?.participantId) {
        payload.participantId = options.participantId;
      }
      if (options?.cursor) {
        payload.cursor = options.cursor;
      }
      if (options?.limit !== undefined) {
        payload.limit = options.limit;
      }

      this.socket.emit('chat:history', payload, (response: any) => {
          if (!response?.success) {
            return reject(new Error(response?.error || 'Failed to load messages'));
          }
          resolve({
            messages: response.messages ?? [],
            nextCursor: response.nextCursor ?? null,
          });
        }
      );
    });
  }

  // Legacy helper (deprecated). Use sendChatMessage instead.
  sendChat(message: string) {
    void this.sendChatMessage(message).catch(error => {
      console.warn('sendChat legacy call failed:', error);
    });
  }

  requestRoomJoin(roomCode: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('requestRoomJoin', { roomCode }, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  approveJoinRequest(requestId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('approveJoinRequest', { requestId }, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  rejectJoinRequest(requestId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('rejectJoinRequest', { requestId }, (response: any) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  raiseHand(isRaised: boolean, userId?: string) {
    if (!this.socket) return;
    // Use provided userId or get from socket data
    const uid = userId || (this.socket as any).data?.userId || '';
    this.socket.emit('raised-hand', { uid, isRaised });
  }

  emitActiveSpeaker(isActiveSpeaker: boolean): void {
    if (!this.socket) return;
    const uid = (this.socket as any).data?.userId || '';
    this.socket.emit('active-speaker', { uid, isActiveSpeaker });
  }

  startScreenShare(producerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('screen-share-started', { producerId }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  stopScreenShare(producerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('screen-share-stopped', { producerId }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  closeProducer(producerId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('closeProducer', { producerId }, (response: any) => {
        if (response.error) reject(new Error(response.error));
        else resolve(response);
      });
    });
  }

  updateRoomSettings(): Promise<any> {
    return Promise.reject(new Error('Use API client for room settings'));
  }

  on(event: string, callback: Function) {
    if (this.socket) {
      this.socket.on(event, callback as any);
    }
  }

  off(event: string, callback?: Function) {
    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback as any);
      } else {
        this.socket.off(event);
      }
    }
  }

  /**
   * Subscribe to reconnecting event
   */
  onReconnecting(callback: () => void): () => void {
    this.reconnectingCallbacks.add(callback);
    return () => {
      this.reconnectingCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to reconnected event
   */
  onReconnected(callback: () => void): () => void {
    this.reconnectedCallbacks.add(callback);
    return () => {
      this.reconnectedCallbacks.delete(callback);
    };
  }

  /**
   * Subscribe to reconnect_failed event
   */
  onReconnectFailed(callback: () => void): () => void {
    this.reconnectFailedCallbacks.add(callback);
    return () => {
      this.reconnectFailedCallbacks.delete(callback);
    };
  }

  /**
   * Emit reconnecting event
   */
  private emitReconnecting(): void {
    this.reconnectingCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in reconnecting callback:', error);
      }
    });
  }

  /**
   * Emit reconnect failed event
   */
  private emitReconnectFailed(): void {
    this.reconnectFailedCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Error in reconnect failed callback:', error);
      }
    });
  }

  /**
   * Check if disconnect is likely temporary based on reason
   */
  isTemporaryDisconnect(reason: string): boolean {
    const lowerReason = reason.toLowerCase();
    // Network and transport issues are usually temporary
    return lowerReason.includes('transport') || 
           lowerReason.includes('network') || 
           lowerReason === 'transport close' ||
           lowerReason === 'ping timeout';
  }
}

export const socketManager = new SocketManager();

