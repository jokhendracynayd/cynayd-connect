import { useState, useRef, useCallback } from 'react';
import type { NetworkMonitor } from '../../lib/networkMonitor';
import type { ActiveSpeakerDetector } from '../../lib/activeSpeaker';

export function useCallStreams() {
  // Stream state
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [screenShareStreams, setScreenShareStreams] = useState<Map<string, MediaStream>>(new Map());

  // Local video refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [localVideoElement, setLocalVideoElement] = useState<HTMLVideoElement | null>(null);

  const setLocalVideoRef = useCallback((element: HTMLVideoElement | null) => {
    localVideoRef.current = element;
    setLocalVideoElement(element);
  }, []);

  // Remote video refs
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const remoteVideoRefCallbacks = useRef<Map<string, (element: HTMLVideoElement | null) => void>>(new Map());

  // Remote audio refs
  const remoteAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const hasEnabledAudioPlayback = useRef(false);

  // Producer tracking refs
  const consumingProducersRef = useRef<Set<string>>(new Set());
  const screenShareProducersRef = useRef<Map<string, string>>(new Map());
  const producerMetadataRef = useRef<Map<string, { source?: string; userId?: string; kind?: 'audio' | 'video' }>>(new Map());
  const activeScreenShareProducersRef = useRef<Set<string>>(new Set());
  const isStoppingScreenShareRef = useRef(false);

  // Network and speaker detection refs
  const networkMonitorRef = useRef<NetworkMonitor | null>(null);
  const activeSpeakerDetectorRef = useRef<ActiveSpeakerDetector | null>(null);
  const pendingParticipantEventsRef = useRef<Map<string, Array<() => void>>>(new Map());

  // getRemoteVideoRef callback
  const getRemoteVideoRef = useCallback((userId: string) => {
    // Always create/update the callback to ensure it has the latest remoteStreams reference
    remoteVideoRefCallbacks.current.set(userId, (element: HTMLVideoElement | null) => {
      if (!element) {
        remoteVideoRefs.current.delete(userId);
        return;
      }

      // Only update ref if element changed (prevents unnecessary updates)
      const existingRef = remoteVideoRefs.current.get(userId);
      if (existingRef === element) {
        // Element hasn't changed, check if stream needs updating
        const existingStream = remoteStreams.get(userId);
        if (existingStream && element.srcObject !== existingStream) {
          element.srcObject = existingStream;
          // Let autoPlay handle initial play, only manually play if video is paused and ready
          // This prevents AbortError when streams are updated rapidly
          if (element.paused && element.readyState >= 2) {
            element.play().catch(err => {
              // AbortError is harmless - it means a new play() was requested before the previous one completed
              if (err.name !== 'AbortError') {
                console.error('Error playing video on mount for user:', userId, err);
              }
            });
          }
        }
        return;
      }

      remoteVideoRefs.current.set(userId, element);

      // Immediately attach existing stream if available (fixes timing issue where stream arrives before video element)
      const existingStream = remoteStreams.get(userId);
      if (existingStream) {
        // Only attach if stream is not already attached (prevents duplicate attachments and blinking)
        if (element.srcObject !== existingStream) {
          element.srcObject = existingStream;
          // Let autoPlay handle initial play, only manually play if video is paused and ready
          // This prevents AbortError when streams are attached rapidly
          if (element.paused && element.readyState >= 2) {
            element.play().catch(err => {
              // AbortError is harmless - it means a new play() was requested before the previous one completed
              if (err.name !== 'AbortError') {
                console.error('Error playing video on mount for user:', userId, err);
              }
            });
          }
        }
      }
    });

    return remoteVideoRefCallbacks.current.get(userId)!;
  }, [remoteStreams]);

  // getRemoteAudioRef callback
  const getRemoteAudioRef = useCallback((userId: string) => {
    return (element: HTMLAudioElement | null) => {
      if (!element) {
        remoteAudioRefs.current.delete(userId);
        return;
      }

      const existingRef = remoteAudioRefs.current.get(userId);
      if (existingRef === element) {
        // Element hasn't changed, check if stream needs updating
        const existingStream = remoteStreams.get(userId);
        if (existingStream && element.srcObject !== existingStream) {
          element.srcObject = existingStream;
          element.volume = 1.0;
          if (element.paused) {
            element.play().catch(err => {
              if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
                console.error('Error playing audio for user:', userId, err);
              }
            });
          }
        }
        return;
      }

      remoteAudioRefs.current.set(userId, element);

      // Immediately attach existing stream if available
      const existingStream = remoteStreams.get(userId);
      if (existingStream) {
        if (element.srcObject !== existingStream) {
          element.srcObject = existingStream;
          element.volume = 1.0;
          if (element.paused) {
            element.play().catch(err => {
              if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
                console.error('Error playing audio on mount for user:', userId, err);
              }
            });
          }
        }
      }
    };
  }, [remoteStreams]);

  return {
    // Stream state
    remoteStreams,
    setRemoteStreams,
    screenShareStreams,
    setScreenShareStreams,
    // Local video
    localVideoRef,
    localVideoElement,
    setLocalVideoElement,
    setLocalVideoRef,
    // Remote video refs
    remoteVideoRefs,
    remoteVideoRefCallbacks,
    getRemoteVideoRef,
    // Remote audio refs
    remoteAudioRefs,
    hasEnabledAudioPlayback,
    getRemoteAudioRef,
    // Producer tracking
    consumingProducersRef,
    screenShareProducersRef,
    producerMetadataRef,
    activeScreenShareProducersRef,
    isStoppingScreenShareRef,
    // Network and speaker detection
    networkMonitorRef,
    activeSpeakerDetectorRef,
    pendingParticipantEventsRef,
  };
}

