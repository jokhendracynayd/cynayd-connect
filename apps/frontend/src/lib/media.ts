import { Device } from 'mediasoup-client';
import type { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';

export class MediaManager {
  private device: Device | null = null;
  private localStream: MediaStream | null = null;

  async initialize(rtpCapabilities: RtpCapabilities) {
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
      const constraints: MediaStreamConstraints = {
        audio: audio ? (audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true) : false,
        video: video ? (videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true) : true,
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

  canProduce(kind: 'audio' | 'video'): boolean {
    if (!this.device) return false;
    return this.device.canProduce(kind);
  }

  async getDevices() {
    try {
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

