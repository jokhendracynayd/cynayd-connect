import { useCallback } from 'react';
import { webrtcManager } from '../../lib/webrtc';
import { useCallStore } from '../../store/callStore';
import type { ActiveSpeakerDetector } from '../../lib/activeSpeaker';

interface UseCallProducerConsumptionProps {
  // Refs
  consumingProducersRef: React.MutableRefObject<Set<string>>;
  producerMetadataRef: React.MutableRefObject<Map<string, { source?: string; userId?: string; kind?: 'audio' | 'video' }>>;
  screenShareProducersRef: React.MutableRefObject<Map<string, string>>;
  activeScreenShareProducersRef: React.MutableRefObject<Set<string>>;
  activeSpeakerDetectorRef: React.MutableRefObject<ActiveSpeakerDetector | null>;
  remoteAudioRefs: React.MutableRefObject<Map<string, HTMLAudioElement>>;
  // State setters
  setRemoteStreams: React.Dispatch<React.SetStateAction<Map<string, MediaStream>>>;
  setScreenShareStreams: React.Dispatch<React.SetStateAction<Map<string, MediaStream>>>;
  // Store methods
  setActiveSpeaker: (userId: string | null) => void;
  updateParticipant: (userId: string, updates: any) => void;
  // Helper functions
  runOrQueueParticipantUpdate: (targetUserId: string | undefined, action: () => void) => void;
}

export function useCallProducerConsumption({
  consumingProducersRef,
  producerMetadataRef,
  screenShareProducersRef,
  activeScreenShareProducersRef,
  activeSpeakerDetectorRef,
  remoteAudioRefs,
  setRemoteStreams,
  setScreenShareStreams,
  setActiveSpeaker,
  updateParticipant,
  runOrQueueParticipantUpdate,
}: UseCallProducerConsumptionProps) {
  const consumeScreenShareProducer = useCallback(
    async (producerId: string, userId?: string) => {
      try {
        // Prevent duplicate consumption
        if (consumingProducersRef.current.has(producerId)) {
          console.log('Already processing screen share producer:', producerId);
          return;
        }

        consumingProducersRef.current.add(producerId);

        console.log('Starting to consume screen share producer:', { producerId, userId });

        const track = await webrtcManager.consumeProducer(producerId);

        consumingProducersRef.current.delete(producerId);

        if (!track) {
          console.warn('No track received from screen share consumer:', producerId);
          return;
        }

        if (track.readyState === 'ended') {
          console.error('Screen share track already ended:', producerId);
          return;
        }

        // Add to screen share streams (separate from participant video streams)
        const ownerId = userId || producerMetadataRef.current.get(producerId)?.userId || producerId;

        setScreenShareStreams(prev => {
          const newStreams = new Map(prev);

          if (track.readyState === 'live') {
            const stream = new MediaStream([track]);
            newStreams.set(ownerId, stream);
            activeScreenShareProducersRef.current.add(producerId);
            console.log('Created screen share stream for user:', ownerId);
          }

          return newStreams;
        });
      } catch (error) {
        consumingProducersRef.current.delete(producerId);
        console.error('Error consuming screen share producer:', error);
      }
    },
    [
      consumingProducersRef,
      producerMetadataRef,
      activeScreenShareProducersRef,
      setScreenShareStreams,
    ]
  );

  const consumeProducer = useCallback(
    async (producerId: string, userId?: string, kind?: 'audio' | 'video') => {
      try {
        // Prevent duplicate consumption of the same producer
        if (consumingProducersRef.current.has(producerId)) {
          console.log('Already processing producer:', producerId, '- skipping duplicate consumption');
          return;
        }

        // Skip if this is a screen share producer (screen shares are handled separately)
        const metadata = producerMetadataRef.current.get(producerId);
        const resolvedUserId = userId ?? metadata?.userId;

        if (metadata?.source === 'screen') {
          // IMPORTANT: Double-check if this is really a screen share
          // If user has no active screen share, this might be mislabeled camera video
          if (resolvedUserId) {
            const hasActiveScreenShare = screenShareProducersRef.current.has(resolvedUserId);
            if (!hasActiveScreenShare) {
              // Update metadata to treat as camera video and continue processing
              producerMetadataRef.current.set(producerId, {
                ...metadata,
                source: 'camera',
              });
              // Continue to process as camera video instead of returning
            } else {
              console.log('Skipping screen share producer in consumeProducer:', producerId);
              return;
            }
          } else {
            console.log('Skipping screen share producer in consumeProducer:', producerId);
            return;
          }
        }

        consumingProducersRef.current.add(producerId);

        console.log('Starting to consume producer:', { producerId, userId: resolvedUserId, kind });

        const track = await webrtcManager.consumeProducer(producerId);

        // Remove from processing set after getting track (even if null)
        consumingProducersRef.current.delete(producerId);

        if (!track) {
          console.warn('No track received from consumer for producer:', producerId);
          return;
        }

        // Start active speaker detection for remote audio tracks
        if (track.kind === 'audio' && resolvedUserId && activeSpeakerDetectorRef.current) {
          // Get consumer from webrtcManager - use getConsumerEntries and find by producerId
          const consumerEntries = webrtcManager.getConsumerEntries();
          const consumerEntry = consumerEntries.find(entry => entry.producerId === producerId);

          if (consumerEntry?.consumer) {
            activeSpeakerDetectorRef.current.startMonitoringRemote(
              resolvedUserId,
              consumerEntry.consumer,
              producerId,
              (userId, isActive) => {
                // Update local state immediately for UI responsiveness
                if (isActive) {
                  setActiveSpeaker(userId);
                  runOrQueueParticipantUpdate(userId, () => {
                    updateParticipant(userId, {
                      isSpeaking: true
                    });
                  });
                } else {
                  const { activeSpeakerId: currentActiveSpeaker } = useCallStore.getState();
                  if (currentActiveSpeaker === userId) {
                    setActiveSpeaker(null);
                  }
                  runOrQueueParticipantUpdate(userId, () => {
                    updateParticipant(userId, {
                      isSpeaking: false
                    });
                  });
                }
                // Emit to other participants only for local user (not needed for remote, backend handles it)
              }
            );
          }
        }

        // Add track event listeners for robustness (CRITICAL for audio reliability)
        const handleTrackEnded = () => {
          console.error('❌ Track ended unexpectedly for producer:', producerId, 'kind:', track.kind);

          // Update participant UI if it's audio/video
          if (resolvedUserId) {
            runOrQueueParticipantUpdate(resolvedUserId, () => {
              if (track.kind === 'audio') {
                updateParticipant(resolvedUserId, { isAudioMuted: true });
              } else if (track.kind === 'video') {
                updateParticipant(resolvedUserId, { isVideoMuted: true });
              }
            });
          }

          // Remove track from stream
          setRemoteStreams(prev => {
            if (!resolvedUserId) return prev;
            const newStreams = new Map(prev);
            const stream = newStreams.get(resolvedUserId);
            if (stream) {
              stream.removeTrack(track);
              if (stream.getTracks().length === 0) {
                newStreams.delete(resolvedUserId);
              } else {
                newStreams.set(resolvedUserId, new MediaStream(stream.getTracks()));
              }
            }
            return newStreams;
          });
        };

        const handleTrackMuted = () => {
          console.warn('⚠️ Track muted for producer:', producerId, 'kind:', track.kind);
          if (!resolvedUserId) return;

          runOrQueueParticipantUpdate(resolvedUserId, () => {
            if (track.kind === 'audio') {
              updateParticipant(resolvedUserId, { isAudioMuted: true });
            }
            if (track.kind === 'video') {
              updateParticipant(resolvedUserId, { isVideoMuted: true });
            }
          });
        };

        const handleTrackUnmuted = () => {
          console.log('✅ Track unmuted for producer:', producerId, 'kind:', track.kind);
          if (!resolvedUserId) return;

          runOrQueueParticipantUpdate(resolvedUserId, () => {
            if (track.kind === 'audio') {
              updateParticipant(resolvedUserId, { isAudioMuted: false });

              // Re-attach to audio element and try to play (in case autoplay failed initially)
              const audioEl = remoteAudioRefs.current.get(resolvedUserId);
              if (audioEl && audioEl.paused) {
                audioEl.play().catch(err => {
                  if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
                    console.error('Error playing audio after unmute:', err);
                  }
                });
              }
            }
            if (track.kind === 'video') {
              updateParticipant(resolvedUserId, { isVideoMuted: false });
            }
          });
        };

        // Attach event listeners
        track.addEventListener('ended', handleTrackEnded);
        track.addEventListener('mute', handleTrackMuted);
        track.addEventListener('unmute', handleTrackUnmuted);

        // Verify track is still live before adding to stream
        if (track.readyState === 'ended') {
          console.error('❌ Track already ended before adding to stream:', producerId);

          // Retry consumption after a delay (race condition recovery)
          // This handles cases where track ends briefly but producer is still active
          const retryKey = `retry_${producerId}`;
          const retryCount = (consumingProducersRef.current as any)[retryKey] || 0;

          if (retryCount < 3) {
            (consumingProducersRef.current as any)[retryKey] = retryCount + 1;
            const retryDelay = 500 * Math.pow(2, retryCount); // Exponential backoff: 500ms, 1s, 2s

            console.log(`Scheduling retry ${retryCount + 1}/3 for producer ${producerId} in ${retryDelay}ms`);
            setTimeout(() => {
              console.log(`Retrying consumption for producer ${producerId} (attempt ${retryCount + 1})`);
              // Recursive call - use the function directly
              void consumeProducer(producerId, userId, kind);
            }, retryDelay);
          } else {
            console.error(`❌ Max retries (3) exceeded for producer ${producerId} - track permanently ended`);
            delete (consumingProducersRef.current as any)[retryKey];
          }

          return;
        }

        console.log('Track received:', {
          producerId,
          userId,
          kind,
          trackId: track.id,
          trackKind: track.kind,
          trackEnabled: track.enabled,
          trackReadyState: track.readyState,
        });

        if (resolvedUserId) {
          // Merge tracks for the same user instead of overwriting
          setRemoteStreams(prev => {
            const newStreams = new Map(prev);
            const existingStream = newStreams.get(resolvedUserId);

            if (existingStream) {
              // Check if track of same kind already exists
              const existingTrackOfKind = existingStream.getTracks().find(
                t => t.kind === track.kind && t.id !== track.id
              );

              if (existingTrackOfKind) {
                // If it's the SAME track, don't do anything
                if (existingTrackOfKind.id === track.id) {
                  console.log('Same track already in stream, skipping:', track.id);
                  return prev; // Return unchanged
                }

                // Only replace if it's a DIFFERENT track (not the same one)
                console.log('Replacing existing track of kind:', track.kind, 'for user:', userId, {
                  oldTrackId: existingTrackOfKind.id,
                  oldTrackState: existingTrackOfKind.readyState,
                  newTrackId: track.id,
                  newTrackState: track.readyState,
                });

                // Only remove old track if it's ended or if new track is live
                if (existingTrackOfKind.readyState === 'ended') {
                  console.log('Old track already ended, removing it');
                  existingStream.removeTrack(existingTrackOfKind);
                  // Don't need to stop - it's already ended
                } else if (track.readyState === 'live') {
                  // Only replace if new track is live and old track is still live
                  // This typically happens when producer replaces its track (e.g., camera restarted)
                  if (existingTrackOfKind.readyState === 'live') {
                    console.log('Replacing live track with new live track (producer track replacement)');
                    // Remove old track from stream first
                    existingStream.removeTrack(existingTrackOfKind);
                    // Stop old track - this is intentional (producer replaced track)
                    try {
                      existingTrackOfKind.stop();
                    } catch (e) {
                      console.warn('Error stopping old track:', e);
                    }
                  } else {
                    // Old track already ended, just remove it
                    console.log('Old track already ended, removing it');
                    existingStream.removeTrack(existingTrackOfKind);
                  }
                } else {
                  // New track is ended, don't replace
                  console.warn('⚠️ New track is ended, not replacing existing track');
                  return prev;
                }
              } else {
                // Check if this exact track is already in the stream
                const isTrackAlreadyInStream = existingStream.getTracks().some(t => t.id === track.id);
                if (isTrackAlreadyInStream) {
                  console.log('Track already in stream, skipping:', track.id);
                  return prev; // Return unchanged
                }
              }

              // Only add track if it's still live
              if (track.readyState === 'live') {
                existingStream.addTrack(track);
                // Create new MediaStream reference to trigger React update
                const updatedStream = new MediaStream(existingStream.getTracks());
                newStreams.set(resolvedUserId, updatedStream);
                console.log('Updated existing stream for user:', resolvedUserId, 'tracks:', updatedStream.getTracks().length, 'track states:', updatedStream.getTracks().map(t => ({ kind: t.kind, id: t.id, state: t.readyState })));
              } else {
                console.error('❌ Track became ended before adding to stream:', track.id, track.readyState);
                return prev; // Don't update if track is ended
              }
            } else {
              // Create new stream for this user - only if track is live
              if (track.readyState === 'live') {
                const stream = new MediaStream([track]);
                newStreams.set(resolvedUserId, stream);
                console.log('Created new stream for user:', resolvedUserId, 'track kind:', track.kind, 'track id:', track.id);
              } else {
                console.error('❌ Track ended before creating stream:', track.id, track.readyState);
                return prev; // Don't create stream with ended track
              }
            }

            return newStreams;
          });
          console.log('Remote stream added to state:', { producerId, userId: resolvedUserId, kind });
        } else {
          // Fallback if no userId (shouldn't happen with current backend)
          console.warn('No userId provided for producer:', producerId);
          setRemoteStreams(prev => {
            const newStreams = new Map(prev);
            const stream = new MediaStream([track]);
            newStreams.set(producerId, stream);
            return newStreams;
          });
          console.log('Remote stream added (no userId):', { producerId });
        }

        if (resolvedUserId) {
          runOrQueueParticipantUpdate(resolvedUserId, () => {
            if (track.kind === 'audio') {
              updateParticipant(resolvedUserId, { isAudioMuted: false });
            }
            if (track.kind === 'video') {
              updateParticipant(resolvedUserId, { isVideoMuted: false });
            }
          });

          const handleTrackMuted = () => {
            runOrQueueParticipantUpdate(resolvedUserId, () => {
              if (track.kind === 'audio') {
                updateParticipant(resolvedUserId, { isAudioMuted: true });
              }
              if (track.kind === 'video') {
                updateParticipant(resolvedUserId, { isVideoMuted: true });
              }
            });
          };

          track.onended = handleTrackMuted;
        }
      } catch (error) {
        consumingProducersRef.current.delete(producerId);
        console.error('Error consuming producer:', { producerId, userId, kind, error });
      }
    },
    [
      consumingProducersRef,
      producerMetadataRef,
      screenShareProducersRef,
      activeSpeakerDetectorRef,
      remoteAudioRefs,
      setRemoteStreams,
      setActiveSpeaker,
      updateParticipant,
      runOrQueueParticipantUpdate,
    ]
  );

  return {
    consumeProducer,
    consumeScreenShareProducer,
  };
}

