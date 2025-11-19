import { config } from '../config';

interface VoiceIndicatorConfig {
  enabled: boolean;
  method: 'stats' | 'audiocontext' | 'hybrid';
  updateInterval: number;
  debounceDelay: number;
  audioThreshold: number;
  silenceThreshold: number;
}

type EmitCallback = (userId: string, isActive: boolean) => void;
type LocalEmitCallback = (isActive: boolean) => void;

/**
 * ActiveSpeakerDetector - Monitors audio levels to detect who is speaking
 * 
 * Uses WebRTC stats (primary) and AudioContext (fallback) to detect audio activity.
 * Optimized for performance with throttled monitoring and debounced emissions.
 */
export class ActiveSpeakerDetector {
  private readonly config: VoiceIndicatorConfig;
  
  // Monitoring state
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private audioContexts: Map<string, AudioContext> = new Map();
  private analysers: Map<string, AnalyserNode> = new Map();
  private audioSources: Map<string, MediaStreamAudioSourceNode> = new Map();
  private currentSpeakers: Map<string, boolean> = new Map();
  private emissionQueue: Map<string, NodeJS.Timeout> = new Map();
  
  // Track metadata
  private trackMetadata: Map<string, { userId: string; isLocal: boolean }> = new Map();
  private emitCallbacks: Map<string, EmitCallback | LocalEmitCallback> = new Map();
  
  // Producer/Consumer references for stats
  private producers: Map<string, any> = new Map(); // userId -> producer (for local)
  private consumers: Map<string, any> = new Map(); // userId -> consumer (for remote)

  constructor(customConfig?: Partial<VoiceIndicatorConfig>) {
    const defaultConfig = config.features.voiceIndicator;
    this.config = {
      enabled: customConfig?.enabled ?? defaultConfig.enabled,
      method: customConfig?.method ?? defaultConfig.method,
      updateInterval: customConfig?.updateInterval ?? defaultConfig.updateInterval,
      debounceDelay: customConfig?.debounceDelay ?? defaultConfig.debounceDelay,
      audioThreshold: customConfig?.audioThreshold ?? defaultConfig.audioThreshold,
      silenceThreshold: customConfig?.silenceThreshold ?? defaultConfig.silenceThreshold,
    };
  }

  /**
   * Start monitoring local audio track (for PreJoin and Call local participant)
   */
  startMonitoringLocal(
    track: MediaStreamTrack,
    userId: string,
    emitCallback: LocalEmitCallback,
    producer?: any,
    originalStream?: MediaStream
  ): void {
    if (!this.config.enabled) {
      return;
    }

    if (!track || track.readyState === 'ended' || track.kind !== 'audio') {
      console.warn('[ActiveSpeakerDetector] Invalid track for local monitoring:', userId);
      return;
    }

    // Stop existing monitoring for this user if any
    this.stopMonitoring(userId);

    this.trackMetadata.set(userId, { userId, isLocal: true });
    this.emitCallbacks.set(userId, emitCallback);
    
    if (producer) {
      this.producers.set(userId, producer);
    }

    // Start monitoring based on configured method
    if (this.config.method === 'stats' && producer) {
      this.monitorLocalWithStats(userId, producer, emitCallback);
    } else if (this.config.method === 'stats' && !producer) {
      // No producer available (e.g., PreJoin page), fallback to AudioContext
      this.monitorWithAudioContext(userId, track, emitCallback, originalStream);
    } else if (this.config.method === 'audiocontext') {
      this.monitorWithAudioContext(userId, track, emitCallback, originalStream);
    } else if (this.config.method === 'hybrid') {
      // Try stats first, fallback to AudioContext
      if (producer) {
        this.monitorLocalWithStats(userId, producer, emitCallback);
      } else {
        this.monitorWithAudioContext(userId, track, emitCallback, originalStream);
      }
    }
  }

  /**
   * Start monitoring remote audio consumer (for Call remote participants)
   */
  startMonitoringRemote(
    userId: string,
    consumer: any,
    _producerId: string,
    emitCallback: EmitCallback
  ): void {
    if (!this.config.enabled) {
      return;
    }

    if (!consumer || !consumer.track || consumer.track.readyState === 'ended') {
      console.warn('[ActiveSpeakerDetector] Invalid consumer for remote monitoring:', userId);
      return;
    }

    // Stop existing monitoring for this user if any
    this.stopMonitoring(userId);

    this.trackMetadata.set(userId, { userId, isLocal: false });
    this.emitCallbacks.set(userId, emitCallback);
    this.consumers.set(userId, consumer);

    const track = consumer.track;

    // Start monitoring based on configured method
    if (this.config.method === 'stats') {
      this.monitorRemoteWithStats(userId, consumer, emitCallback);
    } else if (this.config.method === 'audiocontext') {
      this.monitorWithAudioContext(userId, track, emitCallback);
    } else if (this.config.method === 'hybrid') {
      // Try stats first, fallback to AudioContext
      this.monitorRemoteWithStats(userId, consumer, emitCallback);
      // AudioContext can be used as fallback if stats fail
      // Will be automatically tried if stats monitoring fails
    }
  }

  /**
   * Monitor local audio using WebRTC producer stats
   */
  private monitorLocalWithStats(
    userId: string,
    producer: any,
    emitCallback: LocalEmitCallback
  ): void {
    if (this.monitoringIntervals.has(userId)) {
      return; // Already monitoring
    }

    const interval = setInterval(async () => {
      try {
        if (!producer || producer.closed) {
          this.stopMonitoring(userId);
          return;
        }

        const statsResult = await producer.getStats();
        const audioLevelDB = this.getAudioLevelFromStats(statsResult);

        if (audioLevelDB !== null) {
          const isActive = audioLevelDB > this.config.audioThreshold;
          this.updateSpeakerState(userId, isActive, (isActive) => emitCallback(isActive));
        }
      } catch (error) {
        console.warn('[ActiveSpeakerDetector] Failed to get local producer stats:', error);
        // If stats fail and using hybrid, try AudioContext
        if (this.config.method === 'hybrid') {
          const track = this.producers.get(userId)?.track;
          if (track) {
            this.stopMonitoring(userId);
            this.startMonitoringLocal(track, userId, emitCallback, producer);
          }
        }
      }
    }, this.config.updateInterval);

    this.monitoringIntervals.set(userId, interval);
  }

  /**
   * Monitor remote audio using WebRTC consumer stats
   */
  private monitorRemoteWithStats(
    userId: string,
    consumer: any,
    emitCallback: EmitCallback
  ): void {
    if (this.monitoringIntervals.has(userId)) {
      return; // Already monitoring
    }

    const interval = setInterval(async () => {
      try {
        if (!consumer || consumer.closed || !consumer.track || consumer.track.readyState === 'ended') {
          this.stopMonitoring(userId);
          return;
        }

        if (typeof consumer.getStats !== 'function') {
          // Fallback to AudioContext if getStats not available
          if (this.config.method === 'hybrid') {
            const track = consumer.track;
            this.stopMonitoring(userId);
            this.monitorWithAudioContext(userId, track, emitCallback);
          }
          return;
        }

        const statsResult = await consumer.getStats();
        const audioLevelDB = this.getAudioLevelFromStats(statsResult);

        if (audioLevelDB !== null) {
          const isActive = audioLevelDB > this.config.audioThreshold;
          this.updateSpeakerState(userId, isActive, (isActive) => emitCallback(userId, isActive));
        }
      } catch (error) {
        console.warn('[ActiveSpeakerDetector] Failed to get remote consumer stats:', error);
        // If stats fail and using hybrid, try AudioContext
        if (this.config.method === 'hybrid') {
          const track = consumer.track;
          if (track && track.readyState === 'live') {
            this.stopMonitoring(userId);
            this.monitorWithAudioContext(userId, track, emitCallback);
          }
        }
      }
    }, this.config.updateInterval);

    this.monitoringIntervals.set(userId, interval);
  }

  /**
   * Monitor audio using AudioContext (more accurate but higher CPU)
   */
  private monitorWithAudioContext(
    userId: string,
    track: MediaStreamTrack,
    _emitCallback: EmitCallback | LocalEmitCallback,
    originalStream?: MediaStream
  ): void {
    // Stop existing monitoring for this userId first to prevent duplicates
    if (this.monitoringIntervals.has(userId) || this.audioContexts.has(userId)) {
      console.log('[ActiveSpeakerDetector] Already monitoring userId:', userId, 'stopping existing...');
      this.stopMonitoring(userId);
      // Continue to start new monitoring
    }

    try {
      // Create or reuse AudioContext
      let audioContext = this.audioContexts.get(userId);
      if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContext({ sampleRate: 48000 });
        this.audioContexts.set(userId, audioContext);
        console.log('[ActiveSpeakerDetector] Created AudioContext for userId:', userId, 'state:', audioContext.state);
      }

      // Resume AudioContext if suspended (browser autoplay policy)
      // This is required for AudioContext to work in most browsers
      const resumeAudioContext = async () => {
        if (audioContext.state === 'suspended') {
          try {
            await audioContext.resume();
            console.log('[ActiveSpeakerDetector] AudioContext resumed for userId:', userId, 'new state:', audioContext.state);
          } catch (err) {
            console.warn('[ActiveSpeakerDetector] Failed to resume AudioContext:', err);
            // AudioContext might need user interaction - will retry on next processAudio call
          }
        }
      };
      
      // Try to resume immediately
      resumeAudioContext().then(() => {
        if (audioContext.state === 'running') {
          console.log('[ActiveSpeakerDetector] AudioContext is running, starting audio processing for userId:', userId);
        } else {
          console.warn('[ActiveSpeakerDetector] AudioContext not running yet, state:', audioContext.state, 'userId:', userId);
        }
      });

      // Create analyser node
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3; // Lower smoothing for more responsive detection
      analyser.minDecibels = -90;
      analyser.maxDecibels = -10;
      this.analysers.set(userId, analyser);

      // Create media stream source - CRITICAL: The track must be in an active stream
      // Creating a new MediaStream from the track should work, but we need to ensure
      // the track is actually producing audio data
      
      if (!track.enabled || track.readyState !== 'live') {
        console.warn('[ActiveSpeakerDetector] Track not ready for userId:', userId, {
          enabled: track.enabled,
          readyState: track.readyState
        });
        this.stopMonitoring(userId);
        return;
      }

      // Use original stream if provided, otherwise create a new one
      // Using the original stream ensures the track is active and producing audio
      let mediaStream: MediaStream;
      
      if (originalStream && originalStream.getTracks().includes(track)) {
        // Use the original stream (track is already active in it)
        mediaStream = originalStream;
        console.log('[ActiveSpeakerDetector] Using original stream for userId:', userId);
      } else {
        // Create a new MediaStream with just this track
        // IMPORTANT: This creates a new stream reference, but the track is the same
        mediaStream = new MediaStream([track]);
        
        // Verify the track in the stream
        const streamTrack = mediaStream.getTracks()[0];
        if (!streamTrack || streamTrack.id !== track.id) {
          console.error('[ActiveSpeakerDetector] Failed to add track to MediaStream for userId:', userId);
          this.stopMonitoring(userId);
          return;
        }
        console.log('[ActiveSpeakerDetector] Created new MediaStream for userId:', userId);
      }

      try {
        const source = audioContext.createMediaStreamSource(mediaStream);
        
        // Connect source to analyser
        source.connect(analyser);
        
        // Store the source to prevent garbage collection
        this.audioSources.set(userId, source);
        
        // Verify the stream has the track
        const streamTracks = mediaStream.getTracks();
        const hasTrack = streamTracks.some(t => t.id === track.id);
        
        console.log('[ActiveSpeakerDetector] AudioContext setup complete:', {
          userId,
          trackId: track.id,
          trackEnabled: track.enabled,
          trackReadyState: track.readyState,
          audioContextState: audioContext.state,
          mediaStreamTracks: streamTracks.length,
          hasTrack,
          analyserConnected: true,
          trackInStream: hasTrack
        });
        
        // Small delay to let audio start flowing - schedule after setup
        setTimeout(() => {
          // Audio should be flowing now
        }, 100);
      } catch (error) {
        console.error('[ActiveSpeakerDetector] Failed to create MediaStreamSource:', error);
        this.stopMonitoring(userId);
        return;
      }

      // Buffer for audio data
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let lastProcessedTime = 0;
      let processCount = 0;
      let isMonitoringActive = true; // Flag to track if monitoring should continue

      const processAudio = () => {
        // Check if monitoring should continue
        if (!isMonitoringActive || !this.monitoringIntervals.has(userId)) {
          return;
        }
        
        processCount++;
        
        // Log first few calls to verify it's running
        if (userId === 'local-preview' && processCount <= 10) {
          console.log('[ActiveSpeakerDetector] processAudio called:', { count: processCount, audioContextState: audioContext.state, trackState: track?.readyState, hasInterval: this.monitoringIntervals.has(userId) });
        }
        
        const now = performance.now();
        const timeSinceLastProcess = now - lastProcessedTime;
        
        // If not enough time has passed, schedule next frame and return
        if (timeSinceLastProcess < this.config.updateInterval) {
          requestAnimationFrame(processAudio);
          return;
        }
        
        lastProcessedTime = now;

        try {
          if (!track || track.readyState === 'ended') {
            if (userId === 'local-preview') {
              console.warn('[ActiveSpeakerDetector] Track ended for userId:', userId);
            }
            isMonitoringActive = false;
            this.stopMonitoring(userId);
            return;
          }
          
          // Check if track is enabled
          if (!track.enabled) {
            // Track is muted/disabled - still process but mark as not speaking
            if (this.emitCallbacks.get(userId)) {
              const callback = this.emitCallbacks.get(userId);
              if (callback) {
                const isLocal = this.trackMetadata.get(userId)?.isLocal ?? false;
                if (isLocal) {
                  this.updateSpeakerState(userId, false, (isActive) => (callback as LocalEmitCallback)(isActive));
                }
              }
            }
            // Continue monitoring in case it gets enabled
            if (isMonitoringActive && this.monitoringIntervals.has(userId)) {
              requestAnimationFrame(processAudio);
            }
            return;
          }

          // Ensure AudioContext is running (retry resume if needed)
          if (audioContext.state === 'suspended') {
            resumeAudioContext().then(() => {
              // Retry processing after resume
              if (isMonitoringActive && this.monitoringIntervals.has(userId) && audioContext.state === 'running') {
                requestAnimationFrame(processAudio);
              }
            });
            // Continue anyway - will retry next time
            if (isMonitoringActive && this.monitoringIntervals.has(userId)) {
              requestAnimationFrame(processAudio);
            }
            return;
          }
          
          // Double-check AudioContext is still available and running
          if (!audioContext || audioContext.state === 'closed') {
            console.warn('[ActiveSpeakerDetector] AudioContext closed for userId:', userId);
            isMonitoringActive = false;
            this.stopMonitoring(userId);
            return;
          }

          // Use getByteTimeDomainData for more accurate audio level detection
          // Time domain data gives us the actual audio waveform
          analyser.getByteTimeDomainData(dataArray);

          // Calculate RMS (Root Mean Square) from time domain data
          let sum = 0;
          let activeSamples = 0;
          let maxSample = 0;
          let minSample = 255;
          
          for (let i = 0; i < bufferLength; i++) {
            const value = dataArray[i];
            if (value === undefined) continue; // Safety check for TypeScript
            
            minSample = Math.min(minSample, value);
            maxSample = Math.max(maxSample, value);
            
            // Normalize from 0-255 to -1 to 1 range
            // Time domain data is centered at 128 (silence)
            const normalized = (value - 128) / 128;
            sum += normalized * normalized;
            
            // Count non-silent samples (not exactly 128)
            if (Math.abs(value - 128) > 1) {
              activeSamples++;
            }
          }
          
          // Calculate RMS - use all samples or just active samples
          let rms: number;
          if (activeSamples > 0) {
            rms = Math.sqrt(sum / bufferLength);
          } else {
            // All samples are silent (or very close to 128)
            rms = 0;
          }
          
          // Debug: Log sample range occasionally
          if (userId === 'local-preview' && processCount <= 10) {
            console.log('[ActiveSpeakerDetector] Audio samples:', {
              count: processCount,
              min: minSample,
              max: maxSample,
              activeSamples,
              rms: rms.toFixed(6),
              samplesNearCenter: bufferLength - activeSamples
            });
          }

          // Convert to dB
          // Clamp RMS to avoid log10(0) or negative values
          const clampedRms = Math.max(rms, 0.000001); // Minimum to avoid -Infinity
          const dB = clampedRms > 0.000001 ? 20 * Math.log10(clampedRms) : -Infinity;
          
          // Alternative: If we have active samples, use a simpler calculation
          // For very quiet audio, the dB conversion might not work well
          // So we can use a direct amplitude-based threshold
          const amplitude = activeSamples > 0 ? (maxSample - minSample) / 255 : 0;

          // Check if speaking using multiple methods
          // Method 1: dB threshold (standard)
          const isActiveByDB = dB > this.config.audioThreshold;
          
          // Method 2: Direct amplitude threshold (fallback for very quiet audio)
          // Amplitude > 0.01 means ~2.5% variation from center (128)
          const isActiveByAmplitude = amplitude > 0.01 || activeSamples > bufferLength * 0.1;
          
          // Use both - if either indicates activity, consider it active
          // This helps catch very quiet speech that might not pass dB threshold
          const isActive = isActiveByDB || isActiveByAmplitude;

          // Debug logging (only for local preview, more frequent for debugging)
          if (this.trackMetadata.get(userId)?.isLocal && userId === 'local-preview') {
            // Log first 30 calls to see detailed information, then less frequently
            const shouldLog = processCount <= 30 || Math.random() < 0.05;
            if (shouldLog) {
              console.log('[ActiveSpeakerDetector] Audio level:', { 
                count: processCount,
                dB: dB === -Infinity ? '-Infinity' : dB.toFixed(2), 
                rms: rms.toFixed(6), 
                amplitude: amplitude.toFixed(4),
                activeSamples,
                threshold: this.config.audioThreshold,
                isActiveByDB,
                isActiveByAmplitude,
                isActive,
                audioContextState: audioContext.state,
                trackEnabled: track?.enabled,
                trackReadyState: track?.readyState
              });
            }
          }

          // Update state with debounced emission
          if (this.emitCallbacks.get(userId)) {
            const callback = this.emitCallbacks.get(userId);
            if (callback) {
              const isLocal = this.trackMetadata.get(userId)?.isLocal ?? false;
              if (isLocal) {
                this.updateSpeakerState(userId, isActive, (isActive) => (callback as LocalEmitCallback)(isActive));
              } else {
                this.updateSpeakerState(userId, isActive, (isActive) => (callback as EmitCallback)(userId, isActive));
              }
            }
          }
        } catch (error) {
          console.warn('[ActiveSpeakerDetector] Error processing audio:', error);
          isMonitoringActive = false;
          this.stopMonitoring(userId);
          return;
        }

        // Always schedule next frame if monitoring is still active
        if (isMonitoringActive && this.monitoringIntervals.has(userId)) {
          requestAnimationFrame(processAudio);
        }
      };

      // Mark as monitoring FIRST, before starting processAudio
      // This ensures the interval check in processAudio will work
      const keepAliveInterval = setInterval(() => {
        // Keep alive check - if monitoring stops, clear interval
        if (!this.monitoringIntervals.has(userId)) {
          isMonitoringActive = false;
          clearInterval(keepAliveInterval);
        }
      }, 1000);
      this.monitoringIntervals.set(userId, keepAliveInterval);
      
      console.log('[ActiveSpeakerDetector] Started AudioContext monitoring for userId:', userId);
      
      // Start processing AFTER interval is set
      processAudio();

    } catch (error) {
      console.error('[ActiveSpeakerDetector] Failed to create AudioContext:', error);
      this.stopMonitoring(userId);
    }
  }

  /**
   * Extract audio level from WebRTC stats
   */
  private getAudioLevelFromStats(statsResult: any): number | null {
    if (!statsResult) {
      return null;
    }

    // Handle different stats formats
    const statsArray: any[] = Array.isArray(statsResult)
      ? statsResult
      : Array.from((statsResult?.values?.() ?? []) as Iterable<any>);

    for (const stat of statsArray) {
      // Check for audioLevel (0-1 range) or totalAudioEnergy
      if (stat.type === 'inbound-rtp' || stat.type === 'outbound-rtp') {
        if (stat.kind === 'audio') {
          // Try audioLevel first (normalized 0-1)
          if (typeof stat.audioLevel === 'number' && stat.audioLevel > 0) {
            // Convert to dB: 20 * log10(audioLevel)
            return 20 * Math.log10(stat.audioLevel);
          }
          
          // Try totalAudioEnergy (cumulative energy)
          if (typeof stat.totalAudioEnergy === 'number' && stat.totalAudioEnergy > 0) {
            // This is cumulative, so we'd need previous value to calculate level
            // For simplicity, use a threshold check
            // In practice, this would need tracking previous values
            return stat.totalAudioEnergy > 0.0001 ? -30 : -Infinity;
          }

          // Try bytesReceived/bytesSent as fallback (indicates activity)
          if (typeof stat.bytesReceived === 'number' || typeof stat.bytesSent === 'number') {
            const bytes = stat.bytesReceived ?? stat.bytesSent ?? 0;
            if (bytes > 0) {
              // Rough estimate: -40dB if bytes > 0, indicating some activity
              return -40;
            }
          }
        }
      }

      // Check for audio output level (some browsers)
      if (stat.type === 'media-source' && typeof stat.audioLevel === 'number') {
        if (stat.audioLevel > 0) {
          return 20 * Math.log10(stat.audioLevel);
        }
      }
    }

    return null;
  }

  /**
   * Update speaker state with debounced emission
   */
  private updateSpeakerState(
    userId: string,
    isActive: boolean,
    emitCallback: (isActive: boolean) => void
  ): void {
    const currentState = this.currentSpeakers.get(userId) ?? false;

    // Debug logging for local preview
    if (userId === 'local-preview') {
      console.log('[ActiveSpeakerDetector] updateSpeakerState:', { userId, isActive, currentState, changed: currentState !== isActive });
    }

    // Only update if state changed
    if (currentState === isActive) {
      return;
    }

    // Update state
    this.currentSpeakers.set(userId, isActive);

    // Clear existing debounce timer
    const existingTimer = this.emissionQueue.get(userId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Debounce emission
    const timer = setTimeout(() => {
      if (userId === 'local-preview') {
        console.log('[ActiveSpeakerDetector] Emitting state change:', { userId, isActive });
      }
      emitCallback(isActive);
      this.emissionQueue.delete(userId);
    }, this.config.debounceDelay);

    this.emissionQueue.set(userId, timer);
  }

  /**
   * Stop monitoring a specific user
   */
  stopMonitoring(userId: string): void {
    // Clear interval first to stop the loop
    const interval = this.monitoringIntervals.get(userId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(userId);
    }

    // Clear debounce timer
    const debounceTimer = this.emissionQueue.get(userId);
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      this.emissionQueue.delete(userId);
    }

    // Cleanup AudioContext
    const audioContext = this.audioContexts.get(userId);
    if (audioContext) {
      try {
        if (audioContext.state !== 'closed') {
          audioContext.close().catch(err => {
            console.warn('[ActiveSpeakerDetector] Error closing AudioContext:', err);
          });
        }
      } catch (error) {
        console.warn('[ActiveSpeakerDetector] Error disposing AudioContext:', error);
      }
      this.audioContexts.delete(userId);
    }

    // Cleanup analyser
    this.analysers.delete(userId);

    // Cleanup audio source
    const audioSource = this.audioSources.get(userId);
    if (audioSource) {
      try {
        audioSource.disconnect();
      } catch (error) {
        console.warn('[ActiveSpeakerDetector] Error disconnecting audio source:', error);
      }
      this.audioSources.delete(userId);
    }

    // Cleanup metadata
    this.trackMetadata.delete(userId);
    this.emitCallbacks.delete(userId);
    this.currentSpeakers.delete(userId);
    this.producers.delete(userId);
    this.consumers.delete(userId);
  }

  /**
   * Cleanup all monitoring
   */
  cleanup(): void {
    const userIds = Array.from(this.monitoringIntervals.keys());
    userIds.forEach(userId => this.stopMonitoring(userId));
    
    // Ensure everything is cleaned up
    this.monitoringIntervals.clear();
    this.audioContexts.clear();
    this.analysers.clear();
    this.audioSources.clear();
    this.currentSpeakers.clear();
    this.emissionQueue.clear();
    this.trackMetadata.clear();
    this.emitCallbacks.clear();
    this.producers.clear();
    this.consumers.clear();
  }
}
