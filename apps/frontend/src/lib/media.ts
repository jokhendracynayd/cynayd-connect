import { Device } from 'mediasoup-client';
import { config } from '../config';

type RouterRtpCapabilities = Parameters<Device['load']>[0]['routerRtpCapabilities'];

interface AudioProcessingPreferences {
  noiseSuppression?: boolean;
  echoCancellation?: boolean;
  autoGainControl?: boolean;
}

export class MediaManager {
  private device: Device | null = null;
  private localStream: MediaStream | null = null;
  private screenShareStream: MediaStream | null = null;
  private audioProcessingPreferences: AudioProcessingPreferences | null = null;

  /**
   * Set user preferences for audio processing (overrides config defaults)
   */
  setAudioProcessingPreferences(preferences: AudioProcessingPreferences | null) {
    this.audioProcessingPreferences = preferences;
  }

  /**
   * Get effective audio processing settings (user preferences override config)
   */
  private getEffectiveAudioProcessingSettings() {
    const configSettings = config.features.audioProcessing;
    const userPrefs = this.audioProcessingPreferences;

    return {
      noiseSuppression: userPrefs?.noiseSuppression ?? configSettings.noiseSuppression,
      echoCancellation: userPrefs?.echoCancellation ?? configSettings.echoCancellation,
      autoGainControl: userPrefs?.autoGainControl ?? configSettings.autoGainControl,
      sampleRate: configSettings.sampleRate,
      channelCount: configSettings.channelCount,
    };
  }

  /**
   * Detect browser support for audio constraints
   */
  private detectBrowserSupport(): {
    supportsStandard: boolean;
    supportsChromeSpecific: boolean;
    browserName: string;
  } {
    const userAgent = navigator.userAgent.toLowerCase();
    let browserName = 'unknown';
    let supportsChromeSpecific = false;

    if (userAgent.includes('chrome') && !userAgent.includes('edg')) {
      browserName = 'chrome';
      supportsChromeSpecific = true;
    } else if (userAgent.includes('firefox')) {
      browserName = 'firefox';
    } else if (userAgent.includes('safari') && !userAgent.includes('chrome')) {
      browserName = 'safari';
    } else if (userAgent.includes('edg')) {
      browserName = 'edge';
      supportsChromeSpecific = true; // Edge is Chromium-based
    }

    // Check if getUserMedia supports constraints
    const supportsStandard = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

    return {
      supportsStandard,
      supportsChromeSpecific,
      browserName,
    };
  }

  /**
   * Build audio constraints with noise cancellation settings
   * Includes fallback handling for unsupported browsers
   */
  private buildAudioConstraints(
    audioDeviceId?: string,
    attempt: number = 0
  ): MediaTrackConstraints | boolean {
    if (attempt === 0) {
      // First attempt: try with full constraints
      const settings = this.getEffectiveAudioProcessingSettings();
      const browserSupport = this.detectBrowserSupport();

      const constraints: MediaTrackConstraints = {
        ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
        // Note: latency is not a standard constraint, removed for compatibility
      };

      // Add Chrome-specific constraints if supported
      if (browserSupport.supportsChromeSpecific) {
        (constraints as any).googEchoCancellation = settings.echoCancellation;
        (constraints as any).googNoiseSuppression = settings.noiseSuppression;
        (constraints as any).googAutoGainControl = settings.autoGainControl;
      }

      return constraints;
    } else if (attempt === 1) {
      // Second attempt: try without Chrome-specific constraints
      const settings = this.getEffectiveAudioProcessingSettings();
      return {
        ...(audioDeviceId ? { deviceId: { exact: audioDeviceId } } : {}),
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
      };
    } else {
      // Final fallback: basic constraints (deviceId only)
      return audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true;
    }
  }

  /**
   * Validate that audio constraints were applied correctly
   */
  private validateAudioConstraints(track: MediaStreamTrack): void {
    try {
      const settings = track.getSettings();
      const effectiveSettings = this.getEffectiveAudioProcessingSettings();

      const applied = {
        echoCancellation: settings.echoCancellation,
        noiseSuppression: settings.noiseSuppression,
        autoGainControl: settings.autoGainControl,
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
      };

      // Log actual applied settings for debugging
      if (import.meta.env.DEV) {
        console.log('🎤 Audio constraints applied:', {
          requested: effectiveSettings,
          applied: applied,
          deviceId: settings.deviceId,
        });
      }

      // Warn if critical settings weren't applied
      if (effectiveSettings.echoCancellation && applied.echoCancellation === false) {
        console.warn('⚠️ Echo cancellation requested but not applied by browser');
      }
      if (effectiveSettings.noiseSuppression && applied.noiseSuppression === false) {
        console.warn('⚠️ Noise suppression requested but not applied by browser');
      }
    } catch (error) {
      console.warn('Could not validate audio constraints:', error);
    }
  }

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

      // Build audio constraints with noise cancellation (with fallback)
      let audioConstraints: MediaTrackConstraints | boolean = false;
      if (audio) {
        // Try with full constraints first, fallback if needed
        audioConstraints = this.buildAudioConstraints(audioDeviceId, 0);
      }

      const videoConstraint: boolean | MediaTrackConstraints = video 
        ? (videoDeviceId ? { deviceId: { exact: videoDeviceId } } : true)
        : false;

      const constraints: MediaStreamConstraints = {
        audio: audioConstraints,
        video: videoConstraint,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        // If constraints fail, try with simpler constraints
        if (audio && typeof audioConstraints === 'object') {
          console.warn('Audio constraints failed, trying fallback...', error);
          try {
            const fallbackConstraints = this.buildAudioConstraints(audioDeviceId, 1);
            stream = await navigator.mediaDevices.getUserMedia({
              audio: fallbackConstraints,
              video: videoConstraint,
            });
          } catch (fallbackError) {
            // Final fallback: basic constraints
            console.warn('Fallback constraints failed, using basic constraints', fallbackError);
            stream = await navigator.mediaDevices.getUserMedia({
              audio: audioDeviceId ? { deviceId: { exact: audioDeviceId } } : true,
              video: videoConstraint,
            });
          }
        } else {
          throw error;
        }
      }
      
      // Validate audio constraints were applied
      if (audio) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          this.validateAudioConstraints(audioTrack);
        }
      }
      
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

      // Build constraints with noise cancellation for audio
      let audioConstraints: MediaTrackConstraints | boolean = false;
      let videoConstraints: MediaTrackConstraints | boolean = false;

      if (kind === 'audio') {
        audioConstraints = this.buildAudioConstraints(deviceId, 0);
      } else {
        videoConstraints = deviceId ? { deviceId: { exact: deviceId } } : true;
      }

      const constraints: MediaStreamConstraints = {
        audio: audioConstraints,
        video: videoConstraints,
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        // If audio constraints fail, try with simpler constraints
        if (kind === 'audio' && typeof audioConstraints === 'object') {
          console.warn('Audio constraints failed, trying fallback...', error);
          try {
            const fallbackConstraints = this.buildAudioConstraints(deviceId, 1);
            stream = await navigator.mediaDevices.getUserMedia({
              audio: fallbackConstraints,
              video: false,
            });
          } catch (fallbackError) {
            // Final fallback: basic constraints
            console.warn('Fallback constraints failed, using basic constraints', fallbackError);
            stream = await navigator.mediaDevices.getUserMedia({
              audio: deviceId ? { deviceId: { exact: deviceId } } : true,
              video: false,
            });
          }
        } else {
          throw error;
        }
      }
      const track = stream.getTracks().find(t => t.kind === kind);
      
      if (!track) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error(`Failed to get ${kind} track`);
      }

      // Validate audio constraints were applied
      if (kind === 'audio') {
        this.validateAudioConstraints(track);
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

