import { Device } from 'mediasoup-client';

type RouterRtpCapabilities = Parameters<Device['load']>[0]['routerRtpCapabilities'];

export class MediaManager {
  private device: Device | null = null;
  private localStream: MediaStream | null = null;
  private screenShareStream: MediaStream | null = null;

  async initialize(rtpCapabilities: RouterRtpCapabilities) {
    try {
      this.device = new Device();
      await this.device.load({ routerRtpCapabilities: rtpCapabilities });
      console.log('Media Device initialized:', this.device.rtpCapabilities);
      return true;
    } catch (error) {
      console.error('Failed to initialize media device:', error);
      throw error;
    }
  }

  async getLocalMedia(audio: boolean = true, video: boolean = true, audioDeviceId?: string, videoDeviceId?: string): Promise<MediaStream> {
    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const isSecureContext = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        const errorMessage = isSecureContext
          ? 'getUserMedia API not supported in this browser'
          : 'getUserMedia requires HTTPS or localhost. Please use HTTPS or access from localhost.';
        throw new Error(errorMessage);
      }

      const constraints: MediaStreamConstraints = {
        audio: audio ? (audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true) : false,
        video: video ? (videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true) : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      // Merge with existing stream if it exists (and doesn't have ended tracks)
      if (this.localStream) {
        // Check if existing stream has any active tracks
        const hasActiveTracks = this.localStream.getTracks().some(t => t.readyState !== 'ended');
        
        if (hasActiveTracks) {
          stream.getTracks().forEach(track => {
            // Remove old track of same kind
            const oldTracks = this.localStream!.getTracks().filter(t => t.kind === track.kind);
            oldTracks.forEach(oldTrack => {
              oldTrack.stop();
              this.localStream!.removeTrack(oldTrack);
            });
            // Add new track
            this.localStream!.addTrack(track);
          });
        } else {
          // All tracks are ended, replace the stream entirely
          this.localStream.getTracks().forEach(t => t.stop());
          this.localStream = stream;
        }
      } else {
        this.localStream = stream;
      }
      
      console.log('Got local media stream');
      return stream;
    } catch (error) {
      console.error('Failed to get local media:', error);
      throw error;
    }
  }

  async getSingleTrack(kind: 'audio' | 'video', deviceId?: string): Promise<MediaStreamTrack> {
    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const isSecureContext = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        const errorMessage = isSecureContext
          ? 'getUserMedia API not supported in this browser'
          : 'getUserMedia requires HTTPS or localhost. Please use HTTPS or access from localhost.';
        throw new Error(errorMessage);
      }

      const constraints: MediaStreamConstraints = {
        audio: kind === 'audio' ? (deviceId ? { deviceId: { exact: deviceId } } : true) : false,
        video: kind === 'video' ? (deviceId ? { deviceId: { exact: deviceId } } : true) : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      const track = stream.getTracks().find(t => t.kind === kind);
      
      if (!track) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error(`Failed to get ${kind} track`);
      }

      // Stop other tracks from the stream
      stream.getTracks().forEach(t => {
        if (t.kind !== kind) t.stop();
      });

      console.log(`Got ${kind} track:`, track.id);
      return track;
    } catch (error) {
      console.error(`Failed to get ${kind} track:`, error);
      throw error;
    }
  }

  stopLocalMedia() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped track:', track.kind);
      });
      this.localStream = null;
    }
  }

  getDevice(): Device | null {
    return this.device;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  async startScreenShare(): Promise<MediaStream> {
    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        const isSecureContext = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        const errorMessage = isSecureContext
          ? 'getDisplayMedia API not supported in this browser'
          : 'Screen sharing requires HTTPS or localhost. Please use HTTPS or access from localhost.';
        throw new Error(errorMessage);
      }

      // Capture screen with video (audio optional, disabled for now)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'monitor', // Prefer full screen
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false, // Set to true if capturing system audio is desired
      });

      this.screenShareStream = stream;

      // Handle track end (user stops sharing via browser UI)
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          console.log('Screen share track ended');
          this.screenShareStream = null;
        };
      }

      console.log('Screen share stream started');
      return stream;
    } catch (error) {
      console.error('Failed to start screen share:', error);
      throw error;
    }
  }

  stopScreenShare() {
    if (this.screenShareStream) {
      this.screenShareStream.getTracks().forEach(track => {
        track.stop();
        console.log('Stopped screen share track:', track.kind);
      });
      this.screenShareStream = null;
    }
  }

  getScreenShareStream(): MediaStream | null {
    return this.screenShareStream;
  }

  canProduce(kind: 'audio' | 'video'): boolean {
    if (!this.device) return false;
    return this.device.canProduce(kind);
  }

  async getDevices() {
    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        const isSecureContext = window.isSecureContext || window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        const errorMessage = isSecureContext
          ? 'MediaDevices API not supported in this browser'
          : 'MediaDevices API requires HTTPS or localhost. Please use HTTPS or access from localhost.';
        
        console.warn('⚠️ MediaDevices API not available:', errorMessage);
        console.warn('Current URL:', window.location.href);
        console.warn('Protocol:', window.location.protocol);
        console.warn('Hostname:', window.location.hostname);
        
        return {
          audioInput: [],
          videoInput: [],
          audioOutput: [],
        };
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      
      return {
        audioInput: devices.filter(d => d.kind === 'audioinput'),
        videoInput: devices.filter(d => d.kind === 'videoinput'),
        audioOutput: devices.filter(d => d.kind === 'audiooutput'),
      };
    } catch (error) {
      console.error('Failed to enumerate devices:', error);
      return {
        audioInput: [],
        videoInput: [],
        audioOutput: [],
      };
    }
  }
}

export const mediaManager = new MediaManager();

