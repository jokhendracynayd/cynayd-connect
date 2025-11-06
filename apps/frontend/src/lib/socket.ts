import io, { Socket } from 'socket.io-client';
import { config } from '../config';

class SocketManager {
  private socket: Socket | null = null;

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
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      
      // If disconnected due to auth error, try to refresh token and reconnect
      if (reason === 'io server disconnect' || reason === 'transport close') {
        // Server closed connection, try to reconnect after a delay
        setTimeout(() => {
          if (!this.socket?.connected) {
            const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
            if (token) {
              console.log('Attempting to reconnect socket...');
              this.connect(token);
            }
          }
        }, 2000);
      }
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
                // Refresh failed, disconnect
                this.disconnect();
              });
          });
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
              });
          });
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

  joinRoom(data: { roomCode: string; name: string; email: string; picture?: string }): Promise<any> {
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
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.socket.connected) {
        // If socket is not connected, resolve immediately (backend will cleanup on disconnect)
        console.log('Socket not connected, skipping leaveRoom emit');
        return resolve({ success: true, skipped: true });
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

  sendChat(message: string) {
    if (!this.socket) return;
    this.socket.emit('chat', { message });
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

  updateRoomSettings(settings: { isPublic: boolean }): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      // Room settings are updated via API, not socket
      // This is a placeholder - actual implementation will use API client
      reject(new Error('Use API client for room settings'));
    });
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
}

export const socketManager = new SocketManager();

