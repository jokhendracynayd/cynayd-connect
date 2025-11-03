import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useCallStore } from '../store/callStore';
import { socketManager } from '../lib/socket';
import { mediaManager } from '../lib/media';
import { webrtcManager } from '../lib/webrtc';
import { toast } from 'react-hot-toast';

export default function Call() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { user, token, logout } = useAuthStore();
  const { 
    settings, 
    localStream, 
    setLocalStream, 
    isAudioMuted,
    isVideoMuted,
    toggleAudio,
    toggleVideo,
    setIsConnected,
    participants,
    addParticipant,
    removeParticipant,
    updateParticipant,
    selectedDevices,
  } = useCallStore();
  
  const navigate = useNavigate();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const hasConnectedRef = useRef(false); // Prevent duplicate connections in React StrictMode
  const consumingProducersRef = useRef<Set<string>>(new Set()); // Track which producers we're consuming

  useEffect(() => {
    if (!user || !token) {
      toast.error('Please login first');
      navigate('/login');
      return;
    }

    if (!roomCode) {
      toast.error('Invalid room code');
      navigate('/');
      return;
    }

    // Prevent duplicate connections (React StrictMode in dev)
    if (hasConnectedRef.current) {
      return;
    }
    hasConnectedRef.current = true;

    connectToRoom();

    return () => {
      hasConnectedRef.current = false;
      consumingProducersRef.current.clear();
      // Clean up event listeners
      Object.entries(eventListenersRef.current).forEach(([event, handler]) => {
        if (handler) {
          socketManager.off(event, handler);
        }
      });
      eventListenersRef.current = {};
      leaveRoom();
    };
  }, [roomCode, user, token]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    // Update remote video elements when streams are added or changed
    remoteStreams.forEach((stream, userId) => {
      const videoEl = remoteVideoRefs.current.get(userId);
      if (videoEl) {
        // Only update if stream changed OR if current srcObject has ended tracks
        const currentSrcObject = videoEl.srcObject as MediaStream | null;
        const shouldUpdate = 
          !currentSrcObject || 
          currentSrcObject !== stream ||
          (currentSrcObject.getVideoTracks().length > 0 && 
           currentSrcObject.getVideoTracks()[0].readyState === 'ended');
        
        if (shouldUpdate) {
          console.log('Updating video element srcObject for user:', userId, {
            hasVideo: stream.getVideoTracks().length > 0,
            videoState: stream.getVideoTracks()[0]?.readyState,
            hasAudio: stream.getAudioTracks().length > 0,
          });
          videoEl.srcObject = stream;
          
          // Force play if paused
          if (videoEl.paused) {
            videoEl.play().catch(err => {
              console.error('Error playing video for user:', userId, err);
            });
          }
        }
      }
    });
  }, [remoteStreams]);

  const connectToRoom = async () => {
    if (!roomCode || !user || !token) return;
    
    setIsConnecting(true);
    setError(null);
    
    // Clear existing participants and streams when connecting to new room
    participants.forEach(p => removeParticipant(p.userId));
    setRemoteStreams(new Map());

    try {
      // Connect Socket.io
      socketManager.connect(token);

      // Join room via Socket.io
      const response = await socketManager.joinRoom({
        roomCode,
        name: user.name,
        email: user.email,
        picture: user.picture,
      });

      console.log('Joined room:', response);

      // Initialize Mediasoup device
      await webrtcManager.initialize(response.rtpCapabilities);

      // Stop any existing media from PreJoin page (may have stopped tracks)
      mediaManager.stopLocalMedia();
      
      // Get fresh local media - always get new tracks (don't reuse stopped tracks from PreJoin)
      let stream: MediaStream | null = null;
      if (settings.joinWithAudio || settings.joinWithVideo) {
        stream = await mediaManager.getLocalMedia(
          settings.joinWithAudio,
          settings.joinWithVideo,
          selectedDevices.audioInput,
          selectedDevices.videoInput
        );
        
        // Set initial enabled state based on muted settings
        if (stream) {
          stream.getAudioTracks().forEach(track => {
            track.enabled = settings.joinWithAudio && !isAudioMuted;
          });
          stream.getVideoTracks().forEach(track => {
            track.enabled = settings.joinWithVideo && !isVideoMuted;
          });
        }
        
        setLocalStream(stream);
      }
      
      // Always create send transport (even without media, in case user enables later)
      // Only create if not already created
      if (!webrtcManager.getSendTransport()) {
        await webrtcManager.createSendTransport();
      }
      
      // Create recv transport for consuming others' streams
      if (!webrtcManager.getRecvTransport()) {
        await webrtcManager.createRecvTransport();
      }
      
      // Produce audio/video if available - check track state before producing
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        const videoTrack = stream.getVideoTracks()[0];
        
        // Only produce if track exists and is not ended
        if (audioTrack && audioTrack.readyState !== 'ended') {
          try {
            await webrtcManager.produceAudio(audioTrack);
          } catch (error: any) {
            console.error('Error producing audio:', error);
            if (error.message?.includes('track ended')) {
              console.warn('Audio track ended, skipping production');
            } else {
              throw error;
            }
          }
        }
        
        if (videoTrack && videoTrack.readyState !== 'ended') {
          try {
            await webrtcManager.produceVideo(videoTrack);
          } catch (error: any) {
            console.error('Error producing video:', error);
            if (error.message?.includes('track ended') || error.name === 'InvalidStateError') {
              console.warn('Video track ended, skipping production');
              // If video track is ended and user wanted video, try to get new track
              if (settings.joinWithVideo) {
                try {
                  const newVideoTrack = await mediaManager.getSingleTrack('video', selectedDevices.videoInput);
                  if (newVideoTrack && newVideoTrack.readyState !== 'ended') {
                    await webrtcManager.produceVideo(newVideoTrack);
                    // Update stream
                    if (stream) {
                      stream.addTrack(newVideoTrack);
                      setLocalStream(new MediaStream(stream));
                    }
                  }
                } catch (trackError) {
                  console.error('Failed to get new video track:', trackError);
                }
              }
            } else {
              throw error;
            }
          }
        }
      }
      
      // Add existing participants first (users who already have producers)
      // Don't add self as participant
      if (response.existingParticipants && Array.isArray(response.existingParticipants)) {
        for (const participantInfo of response.existingParticipants) {
          // Skip self
          if (participantInfo.userId !== user.id) {
            addParticipant({
              userId: participantInfo.userId,
              name: participantInfo.name,
              email: participantInfo.email,
              picture: participantInfo.picture,
              isAudioMuted: false,
              isVideoMuted: false,
              isSpeaking: false,
            });
          }
        }
      }
      
      // Consume existing producers from other participants
      if (response.otherProducers && response.otherProducers.length > 0) {
        for (const producerInfo of response.otherProducers) {
          // Handle both old format (string) and new format (object)
          const producerId = typeof producerInfo === 'string' ? producerInfo : producerInfo.producerId;
          const userId = typeof producerInfo === 'object' ? producerInfo.userId : undefined;
          const kind = typeof producerInfo === 'object' ? producerInfo.kind : undefined;
          
          await consumeProducer(producerId, userId, kind);
        }
      }

      // Set up event listeners
      setupEventListeners();

      setIsConnecting(false);
      setIsConnected(true);
      toast.success('Connected to room');

    } catch (error: any) {
      console.error('Failed to connect:', error);
      setError(error.message || 'Failed to connect to room');
      toast.error(error.message || 'Failed to connect to room');
      setIsConnecting(false);
    }
  };

  // Store event listener references for cleanup
  const eventListenersRef = useRef<{
    'user-joined'?: (data: any) => void;
    'user-left'?: (data: any) => void;
    'new-producer'?: (data: any) => void;
    'producer-closed'?: (data: any) => void;
    'chat'?: (data: any) => void;
  }>({});

  const setupEventListeners = () => {
    // Clean up old listeners first
    Object.entries(eventListenersRef.current).forEach(([event, handler]) => {
      if (handler) {
        socketManager.off(event, handler);
      }
    });
    eventListenersRef.current = {};

    // User joined
    const handleUserJoined = (data: any) => {
      console.log('User joined:', data);
      // Don't add self as participant
      if (data.userId !== user?.id) {
        addParticipant({
          userId: data.userId,
          name: data.name,
          email: data.email,
          picture: data.picture,
          isAudioMuted: false,
          isVideoMuted: false,
          isSpeaking: false,
        });
      }
    };
    socketManager.on('user-joined', handleUserJoined);
    eventListenersRef.current['user-joined'] = handleUserJoined;

    // User left
    const handleUserLeft = (data: any) => {
      console.log('User left:', data);
      removeParticipant(data.userId);
      
      // Close remote stream
      setRemoteStreams(prev => {
        const newStreams = new Map(prev);
        const remoteStream = newStreams.get(data.userId);
        if (remoteStream) {
          remoteStream.getTracks().forEach(track => track.stop());
          newStreams.delete(data.userId);
        }
        return newStreams;
      });
    };
    socketManager.on('user-left', handleUserLeft);
    eventListenersRef.current['user-left'] = handleUserLeft;

    // New producer (someone started sharing audio/video)
    const handleNewProducer = async (data: any) => {
      console.log('New producer:', data);
      if (data.producerId) {
        await consumeProducer(data.producerId, data.userId, data.kind);
      }
    };
    socketManager.on('new-producer', handleNewProducer);
    eventListenersRef.current['new-producer'] = handleNewProducer;

    // Producer closed
    const handleProducerClosed = (data: any) => {
      console.log('Producer closed:', data);
      // Remote stream cleanup handled by user-left
    };
    socketManager.on('producer-closed', handleProducerClosed);
    eventListenersRef.current['producer-closed'] = handleProducerClosed;

    // Chat messages
    const handleChat = (data: any) => {
      console.log('Chat message:', data);
      toast.success(`${data.name}: ${data.message}`, { duration: 3000 });
    };
    socketManager.on('chat', handleChat);
    eventListenersRef.current['chat'] = handleChat;
  };

  const consumeProducer = async (producerId: string, userId?: string, kind?: 'audio' | 'video') => {
    try {
      // Prevent duplicate consumption of the same producer
      if (consumingProducersRef.current.has(producerId)) {
        console.log('Already processing producer:', producerId, '- skipping duplicate consumption');
        return;
      }
      
      consumingProducersRef.current.add(producerId);
      
      console.log('Starting to consume producer:', { producerId, userId, kind });
      
      const track = await webrtcManager.consumeProducer(producerId);
      
      // Remove from processing set after getting track (even if null)
      consumingProducersRef.current.delete(producerId);
      
      if (!track) {
        console.warn('No track received from consumer for producer:', producerId);
        return;
      }

      // Verify track is still live before adding to stream
      if (track.readyState === 'ended') {
        console.error('❌ Track already ended before adding to stream:', producerId);
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

      if (userId) {
        // Merge tracks for the same user instead of overwriting
        setRemoteStreams(prev => {
          const newStreams = new Map(prev);
          const existingStream = newStreams.get(userId);
          
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
              newStreams.set(userId, updatedStream);
              console.log('Updated existing stream for user:', userId, 'tracks:', updatedStream.getTracks().length, 'track states:', updatedStream.getTracks().map(t => ({ kind: t.kind, id: t.id, state: t.readyState })));
            } else {
              console.error('❌ Track became ended before adding to stream:', track.id, track.readyState);
              return prev; // Don't update if track is ended
            }
          } else {
            // Create new stream for this user - only if track is live
            if (track.readyState === 'live') {
              const stream = new MediaStream([track]);
              newStreams.set(userId, stream);
              console.log('Created new stream for user:', userId, 'track kind:', track.kind, 'track id:', track.id);
            } else {
              console.error('❌ Track ended before creating stream:', track.id, track.readyState);
              return prev; // Don't create stream with ended track
            }
          }
          
          return newStreams;
        });
        console.log('Remote stream added to state:', { producerId, userId, kind });
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
    } catch (error) {
      consumingProducersRef.current.delete(producerId);
      console.error('Error consuming producer:', { producerId, userId, kind, error });
    }
  };

  const leaveRoom = async () => {
    try {
      webrtcManager.cleanup();
      await socketManager.leaveRoom();
      mediaManager.stopLocalMedia();
      socketManager.disconnect();
      setLocalStream(null);
      setIsConnected(false);
      navigate('/');
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  };

  const handleToggleAudio = async () => {
    const wasMuted = isAudioMuted; // Store BEFORE toggle
    toggleAudio();
    
    const audioProducer = webrtcManager.getProducer('audio');
    const audioTrack = localStream?.getAudioTracks()[0];
    
    if (audioTrack) {
      if (!wasMuted) {
        // Turning OFF - mute track and pause producer
        audioTrack.enabled = false;
        if (audioProducer) {
          try {
            await webrtcManager.pauseProducer('audio');
          } catch (error) {
            console.error('Error pausing audio producer:', error);
          }
        }
      } else {
        // Turning ON - unmute track and resume producer
        audioTrack.enabled = true;
        if (audioProducer) {
          try {
            await webrtcManager.resumeProducer('audio');
          } catch (error) {
            console.error('Error resuming audio producer:', error);
          }
        }
      }
    }
  };

  const handleToggleVideo = async () => {
    const wasMuted = isVideoMuted; // Store BEFORE toggle
    toggleVideo();
    
    const videoProducer = webrtcManager.getProducer('video');
    const videoTrack = localStream?.getVideoTracks()[0];
    
    if (!wasMuted) {
      // Turning OFF - PHYSICALLY STOP CAMERA
      if (videoTrack) {
        videoTrack.stop(); // This physically stops the camera
        console.log('Camera stopped');
        
        // Pause producer on server
        if (videoProducer) {
          try {
            await webrtcManager.pauseProducer('video');
          } catch (error) {
            console.error('Error pausing video producer:', error);
          }
        }
        
        // Remove video track from stream
        if (localStream) {
          localStream.removeTrack(videoTrack);
          setLocalStream(new MediaStream(localStream));
        }
      }
    } else {
      // Turning ON - Get new video track and replace in producer
      try {
        const newVideoTrack = await mediaManager.getSingleTrack('video', selectedDevices.videoInput);
        
        if (videoProducer) {
          // Replace track in producer
          await webrtcManager.replaceVideoTrack(newVideoTrack);
          
          // Resume producer if it was paused
          try {
            await webrtcManager.resumeProducer('video');
          } catch (error) {
            console.error('Error resuming video producer:', error);
          }
        } else {
          // Producer doesn't exist, create it
          await webrtcManager.produceVideo(newVideoTrack);
        }
        
        // Update local stream
        if (localStream) {
          localStream.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(localStream));
        } else {
          const newStream = new MediaStream([newVideoTrack]);
          setLocalStream(newStream);
        }
        
        console.log('Camera restarted');
      } catch (error: any) {
        console.error('Error turning video on:', error);
        // Revert toggle on error
        toggleVideo();
        
        if (error.name === 'NotAllowedError') {
          toast.error('Camera permission denied');
        } else if (error.name === 'NotFoundError') {
          toast.error('No camera found');
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          toast.error('Camera is busy or not available');
        } else {
          toast.error('Failed to start camera');
        }
      }
    }
  };

  if (isConnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
          <p className="mt-4">Connecting to room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white max-w-md">
          <div className="text-red-500 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold mb-2">Connection Error</h1>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-lg font-medium"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Video Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 pb-24">
        {/* Local Video */}
        <div className="bg-gray-800 rounded-lg overflow-hidden aspect-video relative">
          {localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-700">
              <div className="text-center">
                <svg className="w-20 h-20 mx-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p className="text-gray-400 mt-2">{user?.name}</p>
              </div>
            </div>
          )}
          
          {/* Video Muted Overlay */}
          {isVideoMuted && localStream && (
            <div className="absolute inset-0 w-full h-full flex items-center justify-center bg-gray-700 bg-opacity-90 pointer-events-none">
              <div className="text-center">
                <svg className="w-20 h-20 mx-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p className="text-gray-400 mt-2">{user?.name}</p>
              </div>
            </div>
          )}
          
          {/* Name Badge */}
          <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
            {user?.name} (You)
          </div>

          {/* Mute Indicator */}
          {isAudioMuted && (
            <div className="absolute top-4 left-4 bg-red-600 text-white p-2 rounded-full">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </div>
          )}
        </div>

        {/* Remote Videos - Filter out current user */}
        {participants
          .filter(p => p.userId !== user?.id) // Don't show self in remote participants
          .map((participant) => {
            const remoteStream = remoteStreams.get(participant.userId);
            const videoTracks = remoteStream?.getVideoTracks() || [];
            const hasLiveVideo = videoTracks.length > 0 && videoTracks[0].readyState === 'live';
            const shouldShowVideo = remoteStream && !participant.isVideoMuted && hasLiveVideo;
            
            console.log('Rendering participant:', participant.userId, {
              hasStream: !!remoteStream,
              streamTracks: remoteStream?.getTracks().length || 0,
              videoTracks: videoTracks.length,
              videoState: videoTracks[0]?.readyState,
              shouldShowVideo,
            });
            
            return (
              <div key={participant.userId} className="bg-gray-800 rounded-lg overflow-hidden aspect-video relative">
              {shouldShowVideo ? (
                <video
                  autoPlay
                  playsInline
                  muted={false}
                  className="w-full h-full object-cover"
                  ref={(el) => {
                    if (el && remoteStream && hasLiveVideo) {
                      const videoTracks = remoteStream.getVideoTracks();
                      const audioTracks = remoteStream.getAudioTracks();
                      
                      console.log('Setting video srcObject for user:', participant.userId, {
                        tracks: remoteStream.getTracks().length,
                        videoTracks: videoTracks.length,
                        audioTracks: audioTracks.length,
                        videoTrackId: videoTracks[0]?.id,
                        videoTrackState: videoTracks[0]?.readyState,
                      });
                      
                      // Only set if track is actually live
                      if (videoTracks[0]?.readyState === 'live') {
                        // Only update if different
                        if (el.srcObject !== remoteStream) {
                          el.srcObject = remoteStream;
                        }
                        remoteVideoRefs.current.set(participant.userId, el);
                        
                        // Debug video element events
                        el.onloadedmetadata = () => {
                          console.log('✅ Video metadata loaded for user:', participant.userId, 'readyState:', el.readyState);
                        };
                        el.onplay = () => {
                          console.log('✅ Video playing for user:', participant.userId);
                        };
                        el.onpause = () => {
                          console.warn('⏸️ Video paused for user:', participant.userId);
                        };
                        el.onstalled = () => {
                          console.error('❌ Video stalled for user:', participant.userId);
                        };
                        el.onwaiting = () => {
                          console.warn('⏳ Video waiting for user:', participant.userId);
                        };
                        el.onerror = (e) => {
                          console.error('❌ Video error for user:', participant.userId, 'error:', el.error);
                        };
                        
                        // Try to play immediately (only once)
                        if (el.paused) {
                          el.play().then(() => {
                            console.log('✅ Video play() succeeded for user:', participant.userId);
                          }).catch(err => {
                            // Ignore AbortError (interrupted by new load request)
                            if (err.name !== 'AbortError') {
                              console.error('❌ Video play() failed for user:', participant.userId, err);
                            }
                          });
                        }
                      } else {
                        console.warn('⚠️ Not setting srcObject - video track not live:', participant.userId, videoTracks[0]?.readyState);
                      }
                    }
                  }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-700">
                  <div className="text-center">
                    <svg className="w-20 h-20 mx-auto text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="text-gray-400 mt-2">{participant.name}</p>
                  </div>
                </div>
              )}
              
              {/* Name Badge */}
              <div className="absolute bottom-4 left-4 bg-black bg-opacity-50 text-white px-3 py-1 rounded-full text-sm">
                {participant.name}
              </div>

              {/* Mute Indicator */}
              {participant.isAudioMuted && (
                <div className="absolute top-4 left-4 bg-red-600 text-white p-2 rounded-full">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="fixed bottom-0 left-0 right-0 bg-gray-800 border-t border-gray-700 p-4">
        <div className="flex items-center justify-center space-x-4 max-w-4xl mx-auto">
          {/* Mute Audio */}
          <button
            onClick={handleToggleAudio}
            className={`p-4 rounded-full transition-colors ${
              isAudioMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            } text-white`}
          >
            {isAudioMuted ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
          </button>

          {/* Toggle Video */}
          <button
            onClick={handleToggleVideo}
            className={`p-4 rounded-full transition-colors ${
              isVideoMuted ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-700 hover:bg-gray-600'
            } text-white`}
          >
            {isVideoMuted ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Leave */}
          <button
            onClick={leaveRoom}
            className="p-4 rounded-full bg-red-600 hover:bg-red-700 text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Room Info */}
        <div className="text-center mt-4">
          <p className="text-gray-400 text-sm">
            Room: {roomCode} • {participants.length + 1} participant{participants.length !== 0 ? 's' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}
