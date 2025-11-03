import io, { Socket } from 'socket.io-client';
import { config } from '../config';

class SocketManager {
  private socket: Socket | null = null;

  connect(token: string): Socket {
    if (this.socket?.connected) return this.socket;

    this.socket = io(config.socketUrl, {
      path: config.signalingPath,
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
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
          reject(new Error(response.error));
        }
      });
    });
  }

  leaveRoom(): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('leaveRoom', {}, (response: any) => {
        resolve(response);
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

  produce(transportId: string, kind: 'audio' | 'video', rtpParameters: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Not connected'));
      
      this.socket.emit('produce', { transportId, kind, rtpParameters }, (response: any) => {
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

