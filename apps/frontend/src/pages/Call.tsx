import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import { useCallStore, EVERYONE_CONVERSATION_ID, type ChatMessage } from '../store/callStore';
import { socketManager } from '../lib/socket';
import { mediaManager } from '../lib/media';
import { webrtcManager } from '../lib/webrtc';
import { NetworkMonitor } from '../lib/networkMonitor';
import ChatPanel from '../components/call/ChatPanel';
import ParticipantList from '../components/call/ParticipantList';
import PendingRequestsPanel from '../components/call/PendingRequestsPanel';
import RoomSettings from '../components/call/RoomSettings';
import WaitingRoom from '../components/call/WaitingRoom';
import ScreenShareSection from '../components/call/ScreenShareSection';
import { getPendingRequests, requestRoomJoin } from '../lib/api';
import api from '../lib/api';
import { storage } from '../lib/storage';

type SocketEventKey =
  | 'user-joined'
  | 'user-left'
  | 'new-producer'
  | 'producer-closed'
  | 'chat:message'
  | 'chat'
  | 'audio-mute'
  | 'video-mute'
  | 'active-speaker'
  | 'raised-hand'
  | 'join-request'
  | 'pending-requests-loaded'
  | 'screen-share-started'
  | 'screen-share-stopped';

type ServerParticipant = {
  userId: string;
  name: string;
  email: string;
  picture?: string | null;
  isAdmin?: boolean;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  isSpeaking?: boolean;
  hasRaisedHand?: boolean;
  joinedAt?: string;
  audioMutedAt?: string | null;
  videoMutedAt?: string | null;
};

interface ParticipantTile {
  userId: string;
  name: string;
  email: string;
  picture?: string | null;
  isLocal: boolean;
  isHost: boolean;
  stream?: MediaStream | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isSpeaking: boolean;
  hasRaisedHand: boolean;
}

export default function Call() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { user, token, hasCheckedAuth } = useAuthStore();
  const { 
    settings, 
    localStream, 
    setLocalStream, 
    isAudioMuted,
    isVideoMuted,
    setLocalAudioMuted,
    setLocalVideoMuted,
    toggleAudio,
    toggleVideo,
    setIsConnected,
    isConnected,
    participants,
    addParticipant,
    removeParticipant,
    updateParticipant,
    selectedDevices,
    isAdmin,
    roomIsPublic,
    pendingRequests,
    activeSpeakerId,
    raisedHands,
    setIsAdmin,
    setRoomIsPublic,
    setPendingRequests,
    addPendingRequest,
    setActiveSpeaker,
    setRaiseHand,
    resetCallState,
    screenShares,
    pinnedScreenShareUserId,
    isScreenSharing,
    addScreenShare,
    removeScreenShare,
    setPinnedScreenShare,
    setIsScreenSharing,
    permissionErrors,
    setPermissionError,
    clearPermissionErrors,
    chat,
    ingestChatMessage,
    setChatActiveConversation,
    updateNetworkQuality,
    clearNetworkQuality,
  } = useCallStore();
  
  const navigate = useNavigate();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [screenShareStreams, setScreenShareStreams] = useState<Map<string, MediaStream>>(new Map()); // Separate streams for screen shares
  const hasConnectedRef = useRef(false); // Prevent duplicate connections in React StrictMode
  const consumingProducersRef = useRef<Set<string>>(new Set()); // Track which producers we're consuming
  const screenShareProducersRef = useRef<Map<string, string>>(new Map()); // userId -> producerId for screen shares
  const producerMetadataRef = useRef<Map<string, { source?: string; userId?: string; kind?: 'audio' | 'video' }>>(new Map());
  const activeScreenShareProducersRef = useRef<Set<string>>(new Set());
  const isStoppingScreenShareRef = useRef(false);
  const networkMonitorRef = useRef<NetworkMonitor | null>(null);
  const pendingParticipantEventsRef = useRef<Map<string, Array<() => void>>>(new Map());
  const activeSpeakerVideoRef = useRef<HTMLVideoElement>(null);
  const [showPendingRequests, setShowPendingRequests] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const isLeavingRef = useRef(false); // Prevent double cleanup
  const isLoadingPendingRequestsRef = useRef(false); // Track API call in progress
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [permissionBannerDismissed, setPermissionBannerDismissed] = useState(false);
  const showChatPanelRef = useRef(showChatPanel);

  const hasPermissionIssue = permissionErrors.audio || permissionErrors.video;

  const chatUnreadCount = useMemo(() => {
    let total = 0;
    chat.conversations.forEach(conversation => {
      if (conversation.id !== chat.activeConversationId) {
        total += conversation.unreadCount;
      }
    });
    return total;
  }, [chat]);

  useEffect(() => {
    showChatPanelRef.current = showChatPanel;
  }, [showChatPanel]);

  const resolveProducerMeta = useCallback((producerId: string) => {
    const metadata = producerMetadataRef.current.get(producerId);
    if (!metadata) {
      return undefined;
    }

    const source = metadata.source;
    let kind: 'audio' | 'video' | 'screen';
    if (source === 'screen') {
      kind = 'screen';
    } else if (source === 'microphone') {
      kind = 'audio';
    } else if (source === 'camera') {
      kind = 'video';
    } else {
      kind = metadata.kind ?? 'video';
    }

    return {
      userId: metadata.userId,
      kind,
    };
  }, []);

  const handleNetworkSamples = useCallback((samples: Parameters<typeof updateNetworkQuality>[0]) => {
    updateNetworkQuality(samples);
  }, [updateNetworkQuality]);

  useEffect(() => {
    if (!isConnected || !user?.id) {
      if (networkMonitorRef.current) {
        networkMonitorRef.current.stop();
        networkMonitorRef.current = null;
      }
      clearNetworkQuality();
      return;
    }

    if (!networkMonitorRef.current) {
      networkMonitorRef.current = new NetworkMonitor({
        localUserId: user.id,
        intervalMs: 4000,
        resolveProducerMeta,
        onSamples: handleNetworkSamples,
      });
    }

    networkMonitorRef.current.start();

    return () => {
      networkMonitorRef.current?.stop();
      networkMonitorRef.current = null;
    };
  }, [isConnected, user?.id, resolveProducerMeta, handleNetworkSamples, clearNetworkQuality]);

  useEffect(() => {
    if (hasPermissionIssue) {
      setPermissionBannerDismissed(false);
      toast.error('Microphone or camera permission blocked. You joined in listen-only mode.', {
        id: 'permission-warning',
        duration: 4000,
      });
    } else {
      toast.dismiss('permission-warning');
    }
  }, [hasPermissionIssue]);

  const runOrQueueParticipantUpdate = (targetUserId: string | undefined, action: () => void) => {
    if (!targetUserId) {
      return;
    }

    const { participants } = useCallStore.getState();
    const participantExists = participants.some(p => p.userId === targetUserId);

    if (participantExists) {
      action();
      return;
    }

    const queue = pendingParticipantEventsRef.current.get(targetUserId) ?? [];
    queue.push(action);
    pendingParticipantEventsRef.current.set(targetUserId, queue);
  };

  const flushPendingParticipantEvents = (targetUserId: string | undefined) => {
    if (!targetUserId) {
      return;
    }

    const queue = pendingParticipantEventsRef.current.get(targetUserId);
    if (!queue?.length) {
      pendingParticipantEventsRef.current.delete(targetUserId);
      return;
    }

    pendingParticipantEventsRef.current.delete(targetUserId);

    queue.forEach((fn) => {
      try {
        fn();
      } catch (error) {
        console.error('Error executing pending participant update', { userId: targetUserId, error });
      }
    });
  };
  const cleanupScreenShare = (userId?: string, producerId?: string) => {
    console.log('cleanupScreenShare called:', { userId, producerId, localUserId: user?.id });

    if (!userId) {
      if (producerId) {
        const metadata = producerMetadataRef.current.get(producerId);
        if (metadata?.userId) {
          cleanupScreenShare(metadata.userId, producerId);
        } else {
          producerMetadataRef.current.delete(producerId);
          activeScreenShareProducersRef.current.delete(producerId);
        }
      }
      return;
    }

    const currentActiveId = screenShareProducersRef.current.get(userId);
    const targetProducerId = producerId ?? null;

    console.log('cleanupScreenShare - current state:', {
      currentActiveId,
      targetProducerId,
      isLocalUser: user?.id === userId,
      currentIsScreenSharing: isScreenSharing
    });

    // If a different screen share is currently active for this user, only clear metadata for the old producer
    if (currentActiveId && targetProducerId && currentActiveId !== targetProducerId) {
      console.log('Stale producer event detected, ignoring cleanup for active share');
      activeScreenShareProducersRef.current.delete(targetProducerId);
      producerMetadataRef.current.delete(targetProducerId);
      return;
    }

    const producerIds = new Set<string>();
    if (producerId) {
      producerIds.add(producerId);
    }

    const mappedId = screenShareProducersRef.current.get(userId);
    if (mappedId) {
      producerIds.add(mappedId);
    }

    producerMetadataRef.current.forEach((meta, id) => {
      if (meta.userId === userId && (meta.source === 'screen' || !meta.source)) {
        producerIds.add(id);
      }
    });

    console.log('Cleaning up producer IDs:', Array.from(producerIds));

    setScreenShareStreams(prev => {
      const next = new Map(prev);
      const stream = next.get(userId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        next.delete(userId);
      }
      return next;
    });

    screenShareProducersRef.current.delete(userId);

    producerIds.forEach(id => {
      webrtcManager.closeConsumerByProducerId(id);
      activeScreenShareProducersRef.current.delete(id);
      producerMetadataRef.current.delete(id);
    });

    removeScreenShare(userId);

    const { pinnedScreenShareUserId: currentPinned, screenShares: updatedShares } = useCallStore.getState();
    if (currentPinned === userId) {
      const nextShare = Array.from(updatedShares.values()).find(share => share.userId !== userId);
      setPinnedScreenShare(nextShare?.userId || null);
    }

    // If cleaning up local user's screen share, update state
    if (user?.id === userId) {
      console.log('Setting isScreenSharing to false for local user');
      setIsScreenSharing(false);
    }

    console.log('cleanupScreenShare complete');
  };

  const waitForScreenShareTeardown = async (context: string) => {
    const timeoutMs = 5000;
    const intervalMs = 100;
    const startTime = Date.now();
    let attempts = 0;

    while (isStoppingScreenShareRef.current || webrtcManager.getScreenShareProducer()) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn('Timeout waiting for screen share teardown', {
          context,
          isStopping: isStoppingScreenShareRef.current,
          hasProducer: !!webrtcManager.getScreenShareProducer(),
        });
        break;
      }

      if (attempts % 10 === 0) {
        console.log('Waiting for screen share teardown...', {
          context,
          attempt: attempts,
          isStopping: isStoppingScreenShareRef.current,
          hasProducer: !!webrtcManager.getScreenShareProducer(),
        });
      }

      attempts += 1;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    console.log('Screen share teardown wait complete', {
      context,
      elapsed: Date.now() - startTime,
      isStopping: isStoppingScreenShareRef.current,
      hasProducer: !!webrtcManager.getScreenShareProducer(),
    });
  };

  useEffect(() => {
    // Wait for auth check to complete
    if (!hasCheckedAuth) {
      return; // Wait for auth check
    }

    // Get token from store or localStorage (fallback)
    const currentToken = token || storage.getToken();
    const currentUser = user;

    if (!currentUser || !currentToken) {
      // Only redirect if we've checked auth and still no user/token
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
      // Only cleanup if not already leaving (prevent double cleanup)
      if (isLeavingRef.current) {
        console.log('Already leaving, skipping useEffect cleanup');
        return;
      }
      
      hasConnectedRef.current = false;
      consumingProducersRef.current.clear();
      screenShareProducersRef.current.clear();
      pendingParticipantEventsRef.current.clear();
      // Clean up event listeners
      Object.entries(eventListenersRef.current).forEach(([event, handler]) => {
        if (handler) {
          socketManager.off(event, handler);
        }
      });
      eventListenersRef.current = {};
      
      // Only call leaveRoom if user is actually leaving (not on initial mount issues)
      // Check if we're actually connected before calling leaveRoom
      const socket = (socketManager as any).socket;
      if (socket && socket.connected) {
        leaveRoom().catch(err => {
          console.warn('Error in useEffect cleanup leaveRoom:', err);
        });
      }
    };
  }, [roomCode, user, token, hasCheckedAuth]);

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

  // Handle browser tab/window close - cleanup on beforeunload
  useEffect(() => {
    const handleBeforeUnload = (_event: BeforeUnloadEvent) => {
      // Attempt cleanup before page unloads
      // Note: Modern browsers limit what can be done in beforeunload
      console.log('Page unloading, attempting cleanup...');
      
      // Force synchronous cleanup operations
      try {
        webrtcManager.cleanup();
        mediaManager.stopLocalMedia();
        mediaManager.stopScreenShare();
        consumingProducersRef.current.clear();
        screenShareProducersRef.current.clear();
        pendingParticipantEventsRef.current.clear();
        
        // Clear all remote streams
        remoteStreams.forEach((stream) => {
          stream.getTracks().forEach(track => track.stop());
        });
        
        // Clear all screen share streams
        screenShareStreams.forEach((stream) => {
          stream.getTracks().forEach(track => track.stop());
        });
        
        // Clear video refs
        remoteVideoRefs.current.forEach((videoEl) => {
          if (videoEl) videoEl.srcObject = null;
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        
        // Try to leave room via socket (may not complete due to browser limits)
        socketManager.leaveRoom().catch(() => {});
        socketManager.disconnect();
      } catch (err) {
        console.warn('Error during beforeunload cleanup:', err);
      }
    };
    
    // Use pagehide as well for better browser support
    const handlePageHide = () => {
      console.log('Page hiding, cleaning up...');
      try {
        webrtcManager.cleanup();
        mediaManager.stopLocalMedia();
        mediaManager.stopScreenShare();
        consumingProducersRef.current.clear();
        screenShareProducersRef.current.clear();
        pendingParticipantEventsRef.current.clear();
        socketManager.disconnect();
      } catch (err) {
        console.warn('Error during pagehide cleanup:', err);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [remoteStreams, screenShareStreams]); // Include streams in deps to capture current state

  // Handle socket disconnect event
  useEffect(() => {
    const handleDisconnect = () => {
      console.log('Socket disconnected, cleaning up frontend resources...');
      try {
        // Clean up WebRTC resources
        webrtcManager.cleanup();
        
        // Stop local media
        mediaManager.stopLocalMedia();
        mediaManager.stopScreenShare();
        
        // Clear all remote streams
        remoteStreams.forEach((stream) => {
          stream.getTracks().forEach(track => track.stop());
        });
        setRemoteStreams(new Map());
        
        // Clear all screen share streams
        screenShareStreams.forEach((stream) => {
          stream.getTracks().forEach(track => track.stop());
        });
        setScreenShareStreams(new Map());
        
        // Clear video refs
        remoteVideoRefs.current.forEach((videoEl) => {
          if (videoEl) videoEl.srcObject = null;
        });
        remoteVideoRefs.current.clear();
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        
        // Reset state
        resetCallState();
        
        // Clear consuming producers
        consumingProducersRef.current.clear();
        screenShareProducersRef.current.clear();
        pendingParticipantEventsRef.current.clear();
        
        // Show notification
        toast.error('Connection lost. Returning to home.');
        
        // Navigate to home after a short delay
        setTimeout(() => {
          navigate('/');
        }, 1000);
      } catch (error) {
        console.error('Error during disconnect cleanup:', error);
        // Still navigate on error
        navigate('/');
      }
    };
    
    socketManager.on('disconnect', handleDisconnect);
    
    return () => {
      socketManager.off('disconnect', handleDisconnect);
    };
  }, [remoteStreams, navigate, resetCallState]);

  const connectToRoom = async () => {
    if (!roomCode || !user) return;
    
    let effectiveAudioMuted = isAudioMuted;
    let effectiveVideoMuted = isVideoMuted;
    let rosterEntries: ServerParticipant[] = [];

    // Get token from store or localStorage (fallback for page refresh)
    const currentToken = token || storage.getToken();
    if (!currentToken) {
      toast.error('Authentication token not found');
      navigate('/login');
      return;
    }
    
    setIsConnecting(true);
    setError(null);
    
    // Clear existing participants and streams when connecting to new room
    participants.forEach(p => removeParticipant(p.userId));
    pendingParticipantEventsRef.current.clear();
    setRemoteStreams(new Map());

    try {
      // Connect Socket.io with token (from store or localStorage)
      socketManager.connect(currentToken);

      // Join room via Socket.io
      const response = await socketManager.joinRoom({
        roomCode,
        name: user.name,
        email: user.email,
        picture: user.picture,
      });

      console.log('Joined room:', response);

      // Handle private room cases
      if (!response || !response.success) {
        // Check if this is a private room that requires approval
        if (response?.waitingApproval) {
          // User already has a pending request, show waiting room
          setShowWaitingRoom(true);
          setIsConnecting(false);
          toast.success('Waiting for admin approval...');
          return; // Exit early, don't proceed with connection
        }
        
        if (response?.requiresRequest) {
          // This should rarely happen now since backend auto-creates requests
          // But handle it just in case
          try {
            // Try via socket first
            await socketManager.requestRoomJoin(roomCode);
            // If successful, show waiting room
            setShowWaitingRoom(true);
            setIsConnecting(false);
            toast.success('Join request sent. Waiting for admin approval...');
            return; // Exit early
          } catch (requestError: any) {
            // Check if it's just "already pending" - if so, show waiting room anyway
            if (requestError.message?.includes('already pending') || requestError.message?.includes('already exists')) {
              setShowWaitingRoom(true);
              setIsConnecting(false);
              toast.success('Join request already pending. Waiting for admin approval...');
              return;
            }
            
            // If socket fails, try API
            try {
              const result = await requestRoomJoin(roomCode);
              if (result.success) {
                setShowWaitingRoom(true);
                setIsConnecting(false);
                toast.success('Join request sent. Waiting for admin approval...');
                return; // Exit early
              }
            } catch (apiError: any) {
              // Check if API also says "already pending"
              if (apiError.response?.data?.message?.includes('already pending') || 
                  apiError.response?.data?.message?.includes('already exists') ||
                  apiError.message?.includes('already pending')) {
                setShowWaitingRoom(true);
                setIsConnecting(false);
                toast.success('Join request already pending. Waiting for admin approval...');
                return;
              }
              // Both failed with real error, show error
              throw new Error(requestError?.message || apiError?.message || 'Failed to request room access');
            }
          }
        }
        
        // If we get here, it's a real error
        throw new Error(response?.error || 'Failed to join room');
      }

    rosterEntries = Array.isArray(response.participants) ? response.participants : [];
    const selfRosterEntry = rosterEntries.find((participant) => participant?.userId === user.id);

    if (selfRosterEntry) {
      if (typeof selfRosterEntry.isAudioMuted === 'boolean') {
        effectiveAudioMuted = selfRosterEntry.isAudioMuted;
        setLocalAudioMuted(selfRosterEntry.isAudioMuted);
      }
      if (typeof selfRosterEntry.isVideoMuted === 'boolean') {
        effectiveVideoMuted = selfRosterEntry.isVideoMuted;
        setLocalVideoMuted(selfRosterEntry.isVideoMuted);
      }
    }

      // Initialize Mediasoup device
      await webrtcManager.initialize(response.rtpCapabilities);

      // Stop any existing media from PreJoin page (may have stopped tracks)
      mediaManager.stopLocalMedia();
      
      // Get fresh local media - always get new tracks (don't reuse stopped tracks from PreJoin)
      clearPermissionErrors();
      let stream: MediaStream | null = null;
      if (settings.joinWithAudio || settings.joinWithVideo) {
        try {
          stream = await mediaManager.getLocalMedia(
            settings.joinWithAudio,
            settings.joinWithVideo,
            selectedDevices.audioInput,
            selectedDevices.videoInput
          );

          if (settings.joinWithAudio) {
            setPermissionError('audio', false);
          }
          if (settings.joinWithVideo) {
            setPermissionError('video', false);
          }

          // Set initial enabled state based on muted settings
          if (stream) {
            stream.getAudioTracks().forEach(track => {
              track.enabled = settings.joinWithAudio && !effectiveAudioMuted;
            });
            stream.getVideoTracks().forEach(track => {
              track.enabled = settings.joinWithVideo && !effectiveVideoMuted;
            });
          }

          setLocalStream(stream);
        } catch (mediaError: any) {
          const permissionDenied =
            mediaError?.name === 'NotAllowedError' ||
            mediaError?.name === 'NotFoundError';

          if (permissionDenied) {
            if (settings.joinWithAudio) {
              setPermissionError('audio', true);
            }
            if (settings.joinWithVideo) {
              setPermissionError('video', true);
            }
            console.warn('Media permissions denied, continuing without local media', mediaError);
            stream = null;
            setLocalStream(null);
          } else {
            throw mediaError;
          }
        }
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
      
      const seenRosterUserIds = new Set<string>();

      rosterEntries.forEach((participantInfo) => {
        if (!participantInfo?.userId || participantInfo.userId === user.id) {
          return;
        }

        seenRosterUserIds.add(participantInfo.userId);
        addParticipant({
          userId: participantInfo.userId,
          name: participantInfo.name,
          email: participantInfo.email,
          picture: participantInfo.picture ?? undefined,
          isAdmin: participantInfo.isAdmin,
          isAudioMuted: participantInfo.isAudioMuted,
          isVideoMuted: participantInfo.isVideoMuted,
          isSpeaking: participantInfo.isSpeaking,
          hasRaisedHand: participantInfo.hasRaisedHand,
        });
        flushPendingParticipantEvents(participantInfo.userId);
      });

      // Backwards compatibility: ensure existingParticipants (from legacy payload) still adds anyone missing
      if (response.existingParticipants && Array.isArray(response.existingParticipants)) {
        for (const participantInfo of response.existingParticipants) {
          if (!participantInfo?.userId || participantInfo.userId === user.id) {
            continue;
          }

          if (seenRosterUserIds.has(participantInfo.userId)) {
            continue;
          }

          addParticipant({
            userId: participantInfo.userId,
            name: participantInfo.name,
            email: participantInfo.email,
            picture: participantInfo.picture,
            isAdmin: participantInfo.isAdmin ?? false,
            isAudioMuted: true,
            isVideoMuted: true,
            isSpeaking: false,
            hasRaisedHand: participantInfo.hasRaisedHand ?? false,
          });
          flushPendingParticipantEvents(participantInfo.userId);
        }
      }
      
      // Consume existing producers from other participants
      // Note: Screen share producers are NOT included in otherProducers (backend emits screen-share-started separately)
      if (response.otherProducers && response.otherProducers.length > 0) {
        for (const producerInfo of response.otherProducers) {
          const producerId = typeof producerInfo === 'string' ? producerInfo : producerInfo.producerId;
          const userIdFromInfo = typeof producerInfo === 'object' ? producerInfo.userId : undefined;
          const kindFromInfo = typeof producerInfo === 'object' ? producerInfo.kind : undefined;
          const sourceFromInfo =
            typeof producerInfo === 'object'
              ? producerInfo.source || (producerInfo.kind === 'audio' ? 'microphone' : 'camera')
              : undefined;

          producerMetadataRef.current.set(producerId, {
            userId: userIdFromInfo,
            kind: kindFromInfo,
            source: sourceFromInfo,
          });

          if (sourceFromInfo === 'screen' && userIdFromInfo) {
            screenShareProducersRef.current.set(userIdFromInfo, producerId);
            await consumeScreenShareProducer(producerId, userIdFromInfo);

            // Ensure screen share metadata is reflected in state for existing participants
            const shareName = producerInfo.name || participants.find(p => p.userId === userIdFromInfo)?.name;
            if (!screenShares.has(userIdFromInfo)) {
              addScreenShare({
                userId: userIdFromInfo,
                producerId,
                name: shareName || 'Screen Share',
              });

              if (!pinnedScreenShareUserId) {
                setPinnedScreenShare(userIdFromInfo);
              }
            }

            continue;
          }

          await consumeProducer(producerId, userIdFromInfo, kindFromInfo);
        }
      }

      // Check if user is admin (by checking if they created the room)
      // We need to determine this from the room data or API
      // For now, check if user is in the admin field of existing participants
      // or make an API call to get room info
      // TODO: Backend should return admin status in joinRoom response
      
      // Try to determine admin status - check response first, then API
      // Backend now includes isAdmin and isPublic in the response
      let userIsAdmin = false;
      if (response?.isAdmin !== undefined) {
        userIsAdmin = response.isAdmin;
        setIsAdmin(response.isAdmin);
        if (response?.isPublic !== undefined) {
          setRoomIsPublic(response.isPublic);
        }
      } else {
        // Fallback: check via API if response doesn't include admin status
        try {
          const roomInfoResponse = await api.get(`/api/rooms/${roomCode}`);
          if (roomInfoResponse.data.success && roomInfoResponse.data.data) {
            const room = roomInfoResponse.data.data;
            userIsAdmin = room.admin?.id === user.id || room.adminId === user.id;
            setIsAdmin(userIsAdmin);
            setRoomIsPublic(room.isPublic ?? true);
          }
        } catch (apiError) {
          console.error('Failed to fetch room info:', apiError);
          // Continue anyway, just won't have admin status
        }
      }
      
      // Set up event listeners BEFORE loading pending requests
      // This ensures we can receive socket events immediately
      setupEventListeners();
      
      // HYBRID APPROACH: If admin, load pending requests via API (reliable)
      // AND listen for socket events (real-time updates)
      if (userIsAdmin) {
        // Load pending requests via API (primary method - reliable)
        await loadPendingRequests();
        // Socket event will also be received via setupEventListeners for verification/updates
        console.log('Admin joined - loaded pending requests via API and listening for socket updates');
      }

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
  const eventListenersRef = useRef<Partial<Record<SocketEventKey, (data: any) => void>>>({});

  const setupEventListeners = () => {
    // Clean up old listeners first
    Object.entries(eventListenersRef.current).forEach(([event, handler]) => {
      if (handler) {
        socketManager.off(event, handler);
      }
    });
    eventListenersRef.current = {};

    // User joined
    const handleUserJoined = (participant: ServerParticipant) => {
      console.log('User joined:', participant);
      if (!participant?.userId || participant.userId === user?.id) {
        return;
      }

      addParticipant({
        userId: participant.userId,
        name: participant.name,
        email: participant.email,
        picture: participant.picture ?? undefined,
        isAdmin: participant.isAdmin,
        isAudioMuted: participant.isAudioMuted,
        isVideoMuted: participant.isVideoMuted,
        isSpeaking: participant.isSpeaking,
        hasRaisedHand: participant.hasRaisedHand,
      });
      flushPendingParticipantEvents(participant.userId);
    };
    socketManager.on('user-joined', handleUserJoined);
    eventListenersRef.current['user-joined'] = handleUserJoined;

    // User left
    const handleUserLeft = (data: any) => {
      console.log('User left:', data);
      if (data?.userId) {
        pendingParticipantEventsRef.current.delete(data.userId);
      }
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
      cleanupScreenShare(data.userId);
    };
    socketManager.on('user-left', handleUserLeft);
    eventListenersRef.current['user-left'] = handleUserLeft;

    // New producer (someone started sharing audio/video)
    const handleNewProducer = async (data: any) => {
      console.log('New producer:', data);
      if (!data?.producerId) {
        return;
      }

      const source = data.appData?.source || (data.kind === 'audio' ? 'microphone' : 'camera');
      producerMetadataRef.current.set(data.producerId, {
        userId: data.userId,
        kind: data.kind,
        source,
      });

      if (source === 'screen') {
        if (data.userId) {
          screenShareProducersRef.current.set(data.userId, data.producerId);
        }

        await consumeScreenShareProducer(data.producerId, data.userId);
        return;
      }

      await consumeProducer(data.producerId, data.userId, data.kind);
    };
    socketManager.on('new-producer', handleNewProducer);
    eventListenersRef.current['new-producer'] = handleNewProducer;

    // Producer closed
    const handleProducerClosed = (data: any) => {
      console.log('Producer closed:', data);
      const metadata = producerMetadataRef.current.get(data.producerId);
      if (metadata?.source === 'screen') {
        cleanupScreenShare(metadata.userId, data.producerId);
      } else {
        producerMetadataRef.current.delete(data.producerId);
        webrtcManager.closeConsumerByProducerId(data.producerId);
      }

      const userIdForProducer = metadata?.userId || data.userId;
      const kindForProducer = metadata?.kind || data.kind;

      if (userIdForProducer && (kindForProducer === 'audio' || kindForProducer === 'video')) {
        runOrQueueParticipantUpdate(userIdForProducer, () => {
          if (kindForProducer === 'audio') {
            updateParticipant(userIdForProducer, { isAudioMuted: true });
          }
          if (kindForProducer === 'video') {
            updateParticipant(userIdForProducer, { isVideoMuted: true });
          }
        });

        setRemoteStreams(prev => {
          const next = new Map(prev);
          const stream = next.get(userIdForProducer);
          if (!stream) {
            return prev;
          }

          const tracksToRemove = stream.getTracks().filter(track => track.kind === kindForProducer);
          if (!tracksToRemove.length) {
            return prev;
          }

          tracksToRemove.forEach(track => {
            try {
              track.stop();
            } catch (error) {
              console.warn('Error stopping track after producer closed', { userId: userIdForProducer, producerId: data.producerId, error });
            }
            stream.removeTrack(track);
          });

          if (stream.getTracks().length === 0) {
            next.delete(userIdForProducer);
          } else {
            next.set(userIdForProducer, new MediaStream(stream.getTracks()));
          }

          return next;
        });
      }
    };
    socketManager.on('producer-closed', handleProducerClosed);
    eventListenersRef.current['producer-closed'] = handleProducerClosed;

    const mapToChatMessage = (data: any): ChatMessage => ({
      id: data.id ?? data.messageId ?? '',
      roomId: data.roomId ?? roomCode ?? '',
      senderId: data.senderId ?? data.userId ?? '',
      recipientId: data.recipientId ?? null,
      content: data.content ?? data.message ?? '',
      messageType: data.messageType ?? (data.recipientId ? 'DIRECT' : 'BROADCAST'),
      createdAt: data.createdAt ?? data.timestamp ?? new Date().toISOString(),
      updatedAt: data.updatedAt ?? data.createdAt ?? new Date().toISOString(),
      sender: data.sender ?? (data.userId
        ? {
            id: data.userId,
            name: data.name ?? data.senderName ?? 'Guest',
            email: data.email ?? '',
            picture: data.picture ?? null,
          }
        : null),
      recipient: data.recipient ?? null,
      clientMessageId: data.clientMessageId,
      status: 'sent',
    });

    const handleChatMessage = (data: any) => {
      try {
        const message = mapToChatMessage(data);
        ingestChatMessage(message, {
          currentUserId: user?.id,
          markAsRead: showChatPanelRef.current,
        });
      } catch (error) {
        console.warn('Failed to ingest chat message', error, data);
      }
    };
    socketManager.on('chat:message', handleChatMessage);
    eventListenersRef.current['chat:message'] = handleChatMessage;

    // Legacy fallback
    const handleLegacyChat = (data: any) => {
      handleChatMessage({
        ...data,
        senderId: data.userId ?? data.senderId,
        content: data.message ?? data.content,
      });
    };
    socketManager.on('chat', handleLegacyChat);
    eventListenersRef.current['chat'] = handleLegacyChat;

    // Audio mute event
    const handleAudioMute = (data: { userId: string; isAudioMuted: boolean }) => {
      runOrQueueParticipantUpdate(data.userId, () => {
        updateParticipant(data.userId, { isAudioMuted: data.isAudioMuted });
      });
    };
    socketManager.on('audio-mute', handleAudioMute);
    eventListenersRef.current['audio-mute'] = handleAudioMute;

    // Video mute event
    const handleVideoMute = (data: { userId: string; isVideoMuted: boolean }) => {
      runOrQueueParticipantUpdate(data.userId, () => {
        updateParticipant(data.userId, { isVideoMuted: data.isVideoMuted });
      });
    };
    socketManager.on('video-mute', handleVideoMute);
    eventListenersRef.current['video-mute'] = handleVideoMute;

    // Active speaker event
    const handleActiveSpeaker = (data: { userId: string; isActiveSpeaker: boolean }) => {
      if (data.isActiveSpeaker) {
        setActiveSpeaker(data.userId);
        runOrQueueParticipantUpdate(data.userId, () => {
          updateParticipant(data.userId, { isSpeaking: true });
        });
      } else {
        // Clear active speaker if this user stopped speaking
        const { activeSpeakerId: currentActiveSpeaker } = useCallStore.getState();
        if (currentActiveSpeaker === data.userId) {
          setActiveSpeaker(null);
        }
        runOrQueueParticipantUpdate(data.userId, () => {
          updateParticipant(data.userId, { isSpeaking: false });
        });
      }
    };
    socketManager.on('active-speaker', handleActiveSpeaker);
    eventListenersRef.current['active-speaker'] = handleActiveSpeaker;

    // Raised hand event
    const handleRaisedHand = (data: { userId: string; isRaised: boolean }) => {
      runOrQueueParticipantUpdate(data.userId, () => {
        setRaiseHand(data.userId, data.isRaised);
      });
    };
    socketManager.on('raised-hand', handleRaisedHand);
    eventListenersRef.current['raised-hand'] = handleRaisedHand;

    // Join request event (admin only)
    const handleJoinRequest = (data: {
      requestId: string;
      userId: string;
      name: string;
      email: string;
      picture?: string;
      requestedAt: string;
    }) => {
      console.log('Received join-request event:', data);
      
      // Check if request already exists (avoid duplicates)
      const { pendingRequests: currentPendingRequests } = useCallStore.getState();
      const existingRequest = currentPendingRequests.find(r => r.id === data.requestId);
      if (!existingRequest) {
        addPendingRequest({
          id: data.requestId,
          userId: data.userId,
          name: data.name,
          email: data.email,
          picture: data.picture,
          requestedAt: data.requestedAt,
          status: 'pending',
        });
        toast.success(`Join request from ${data.name}`, { duration: 5000 });
      } else {
        console.log('Join request already exists, skipping:', data.requestId);
      }
      
      // Show notification badge
      if (!showPendingRequests) {
        // Could trigger a notification here
      }
    };
    socketManager.on('join-request', handleJoinRequest);
    eventListenersRef.current['join-request'] = handleJoinRequest;

    // Pending requests loaded event (verification/real-time updates from socket)
    // This is a backup to the API call - provides real-time updates when new requests come in
    const handlePendingRequestsLoaded = (data: {
      requests: Array<{
        id: string;
        userId: string;
        name: string;
        email: string;
        picture?: string;
        requestedAt: string;
      }>;
    }) => {
      console.log('Received pending-requests-loaded socket event (verification):', data);
      
      // If API call is in progress, don't process socket event yet (avoid race condition)
      // The API call will set the correct state, and if socket has new requests, they'll be caught later
      if (isLoadingPendingRequestsRef.current) {
        console.log('API call in progress, deferring socket event processing');
        // Store the socket data temporarily and process after API completes
        // For now, just log - the API will handle the initial load
        return;
      }
      
      // Verify: Compare with current state and update if needed
      // This ensures we have the latest data even if API call missed something
      const socketRequestIds = new Set(data.requests.map(r => r.id));
      const { pendingRequests: currentPendingRequests } = useCallStore.getState();
      
      // Check if socket has requests we don't have (shouldn't happen, but verify)
      let addedCount = 0;
      let updatedCount = 0;
      
      data.requests.forEach(req => {
        const existingRequest = currentPendingRequests.find(r => r.id === req.id);
        if (!existingRequest) {
          // New request from socket (real-time update after API has loaded)
          addPendingRequest({
            id: req.id,
            userId: req.userId,
            name: req.name,
            email: req.email,
            picture: req.picture,
            requestedAt: req.requestedAt,
            status: 'pending',
          });
          addedCount++;
          console.log('Added pending request from socket event:', req.id);
        } else {
          updatedCount++;
        }
      });
      
      // Check if we have requests that socket doesn't (stale data) - refresh from API
      const staleRequests = currentPendingRequests.filter(r => !socketRequestIds.has(r.id));
      if (staleRequests.length > 0) {
        console.log(`Found ${staleRequests.length} stale requests, refreshing from API...`);
        // Refresh from API to get latest state (only if not already loading)
        if (!isLoadingPendingRequestsRef.current) {
          loadPendingRequests().catch(err => {
            console.error('Failed to refresh pending requests:', err);
          });
        }
      }
      
      // Only show notification for newly added requests (not verification updates)
      // Don't show if we just loaded via API (to avoid duplicate toasts)
      if (addedCount > 0 && !isLoadingPendingRequestsRef.current) {
        toast.success(`New join request${addedCount > 1 ? 's' : ''} received`, {
          duration: 4000,
        });
      } else if (data.requests.length > 0 && updatedCount === data.requests.length) {
        // All requests match - verification successful
        console.log(`Verified ${data.requests.length} pending requests via socket event`);
      }
    };
    socketManager.on('pending-requests-loaded', handlePendingRequestsLoaded);
    eventListenersRef.current['pending-requests-loaded'] = handlePendingRequestsLoaded;

    // Screen share started event
    const handleScreenShareStarted = async (data: {
      userId: string;
      producerId: string;
      name: string;
    }) => {
      console.log('Screen share started:', data);

      producerMetadataRef.current.set(data.producerId, {
        userId: data.userId,
        source: 'screen',
        kind: 'video',
      });

      screenShareProducersRef.current.set(data.userId, data.producerId);

      const alreadyActive = activeScreenShareProducersRef.current.has(data.producerId);

      if (!alreadyActive) {
        await consumeScreenShareProducer(data.producerId, data.userId);
      }

      // Add to screen shares (don't add if it's our own)
      if (data.userId !== user?.id && !alreadyActive) {
        addScreenShare({
          userId: data.userId,
          producerId: data.producerId,
          name: data.name,
        });

        // Auto-pin if none pinned (only for other users' screen shares)
        if (!pinnedScreenShareUserId) {
          setPinnedScreenShare(data.userId);
        }

        toast.success(`${data.name} started sharing screen`);
      }
    };
    socketManager.on('screen-share-started', handleScreenShareStarted);
    eventListenersRef.current['screen-share-started'] = handleScreenShareStarted;

    // Screen share stopped event
    const handleScreenShareStopped = (data: { userId: string; producerId: string }) => {
      console.log('Screen share stopped:', data);
      cleanupScreenShare(data.userId, data.producerId);

      if (data.userId !== user?.id) {
        toast('Screen sharing stopped');
      }
    };
    socketManager.on('screen-share-stopped', handleScreenShareStopped);
    eventListenersRef.current['screen-share-stopped'] = handleScreenShareStopped;
  };

  // Consume screen share producer separately
  const consumeScreenShareProducer = async (producerId: string, userId?: string) => {
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
  };

  const consumeProducer = async (producerId: string, userId?: string, kind?: 'audio' | 'video') => {
    try {
      // Prevent duplicate consumption of the same producer
      if (consumingProducersRef.current.has(producerId)) {
        console.log('Already processing producer:', producerId, '- skipping duplicate consumption');
        return;
      }
      
      // Skip if this is a screen share producer (screen shares are handled separately)
      const metadata = producerMetadataRef.current.get(producerId);
      if (metadata?.source === 'screen') {
        console.log('Skipping screen share producer in consumeProducer:', producerId);
        return;
      }
      
      consumingProducersRef.current.add(producerId);
      
      const resolvedUserId = userId ?? metadata?.userId;

      console.log('Starting to consume producer:', { producerId, userId: resolvedUserId, kind });
      
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

        const handleTrackUnmuted = () => {
          runOrQueueParticipantUpdate(resolvedUserId, () => {
            if (track.kind === 'audio') {
              updateParticipant(resolvedUserId, { isAudioMuted: false });
            }
            if (track.kind === 'video') {
              updateParticipant(resolvedUserId, { isVideoMuted: false });
            }
          });
        };

        track.onended = handleTrackMuted;
        track.onmute = handleTrackMuted;
        track.onunmute = handleTrackUnmuted;
      }
    } catch (error) {
      consumingProducersRef.current.delete(producerId);
      console.error('Error consuming producer:', { producerId, userId, kind, error });
    }
  };

  const leaveRoom = async () => {
    // Prevent double execution
    if (isLeavingRef.current) {
      console.log('Leave already in progress, ignoring duplicate call');
      return;
    }
    
    isLeavingRef.current = true;
    setIsLeaving(true);
    if (networkMonitorRef.current) {
      networkMonitorRef.current.stop();
      networkMonitorRef.current = null;
    }
    clearNetworkQuality();
    setShowChatPanel(false);
    
    try {
      console.log('Leaving room, starting cleanup...');
      toast.loading('Leaving room...', { id: 'leaving' });
      
      // Step 1: Stop all local media tracks immediately (user experience)
      mediaManager.stopLocalMedia();
      
      // Step 2: Clear local video ref
      if (localVideoRef.current) {
        try {
          localVideoRef.current.srcObject = null;
          localVideoRef.current.pause();
        } catch (err) {
          console.warn('Error clearing local video ref:', err);
        }
      }
      
      // Step 3: Close all WebRTC resources (producers, consumers, transports)
      try {
        webrtcManager.cleanup();
      } catch (err) {
        console.warn('Error cleaning up WebRTC:', err);
      }
      
      // Step 4: Clear all remote streams and stop their tracks
      try {
        remoteStreams.forEach((stream, userId) => {
          try {
            stream.getTracks().forEach(mediaTrack => {
              mediaTrack.stop();
              stream.removeTrack(mediaTrack);
            });
          } catch (err) {
            console.warn(`Error stopping tracks for user ${userId}:`, err);
          }
        });
        setRemoteStreams(new Map());
      } catch (err) {
        console.warn('Error clearing remote streams:', err);
      }

      // Step 4b: Clear all screen share streams and stop their tracks
      try {
        screenShareStreams.forEach((stream, userId) => {
          try {
            stream.getTracks().forEach(mediaTrack => {
              mediaTrack.stop();
              stream.removeTrack(mediaTrack);
            });
          } catch (err) {
            console.warn(`Error stopping screen share tracks for user ${userId}:`, err);
          }
        });
        setScreenShareStreams(new Map());
        
        // Clear screen share producers ref
        screenShareProducersRef.current.clear();
        producerMetadataRef.current.clear();
        activeScreenShareProducersRef.current.clear();
        producerMetadataRef.current.clear();
        activeScreenShareProducersRef.current.clear();
        
        // Stop local screen share if active
        if (isScreenSharing) {
          mediaManager.stopScreenShare();
          const producer = webrtcManager.getScreenShareProducer();
          if (producer) {
            try {
              await webrtcManager.closeScreenShareProducer();
            } catch (err) {
              console.warn('Error closing screen share producer during cleanup:', err);
            }
          }
        }
      } catch (err) {
        console.warn('Error clearing screen share streams:', err);
      }
      
      // Step 5: Clear all remote video refs
      try {
        remoteVideoRefs.current.forEach((videoEl, userId) => {
          if (videoEl) {
            try {
              videoEl.srcObject = null;
              videoEl.pause();
            } catch (err) {
              console.warn(`Error clearing video ref for user ${userId}:`, err);
            }
          }
        });
        remoteVideoRefs.current.clear();
      } catch (err) {
        console.warn('Error clearing remote video refs:', err);
      }
      
      // Step 6: Notify backend via socket (with timeout handling)
      try {
        const leaveResult = await socketManager.leaveRoom();
        if (leaveResult.timeout) {
          console.log('LeaveRoom call timed out, but continuing cleanup');
        } else if (leaveResult.skipped) {
          console.log('LeaveRoom skipped (socket not connected), backend will cleanup on disconnect');
        } else {
          console.log('Successfully notified backend of room leave');
        }
      } catch (err: any) {
        // If socket is already disconnected or error, that's okay - backend will cleanup on disconnect
        console.warn('Error calling leaveRoom on socket:', err);
        // Continue with cleanup even if socket call fails
      }
      
      // Step 7: Disconnect socket (this triggers backend cleanup)
      try {
        socketManager.disconnect();
      } catch (err) {
        console.warn('Error disconnecting socket:', err);
      }
      
      // Step 8: Clear consuming producers ref
      consumingProducersRef.current.clear();
      pendingParticipantEventsRef.current.clear();
      
      // Step 9: Reset all state in store
      resetCallState();
      
      // Step 10: Show success and navigate
      toast.success('Left room successfully', { id: 'leaving' });
      
      // Small delay to ensure toast is visible before navigation
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Navigate to home with replace to prevent back navigation
      navigate('/', { replace: true });
      
    } catch (error) {
      console.error('Error leaving room:', error);
      toast.error('Error leaving room', { id: 'leaving' });
      
      // Even on error, try to reset state and navigate
      try {
        // Force cleanup
        webrtcManager.cleanup();
        mediaManager.stopLocalMedia();
        resetCallState();
        
        // Navigate anyway after a short delay
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 1000);
      } catch (navError) {
        console.error('Error during error cleanup:', navError);
        // Last resort: force reload
        window.location.href = '/';
      }
    } finally {
      // Reset leaving state (though we're navigating away)
      setIsLeaving(false);
    }
  };

  const loadPendingRequests = async () => {
    if (!roomCode) {
      console.warn('loadPendingRequests: roomCode not available');
      return;
    }
    
    // Prevent concurrent API calls
    if (isLoadingPendingRequestsRef.current) {
      console.log('Pending requests API call already in progress, skipping duplicate call');
      return;
    }
    
    // Don't check isAdmin here - allow loading even if admin status not yet set
    // The API will verify admin status server-side
    
    isLoadingPendingRequestsRef.current = true;
    try {
      console.log('Loading pending requests via API for room:', roomCode);
      const result = await getPendingRequests(roomCode);
      if (result.success && result.data) {
        const requests = result.data.map((req: any) => ({
          id: req.id,
          userId: req.user.id,
          name: req.user.name,
          email: req.user.email,
          picture: req.user.picture,
          requestedAt: req.requestedAt,
          status: req.status,
        }));
        setPendingRequests(requests);
        console.log(`Loaded ${requests.length} pending requests via API`);
        
        // Show notification if there are pending requests
        if (requests.length > 0) {
          toast.success(`${requests.length} pending join request${requests.length > 1 ? 's' : ''}`, {
            duration: 5000,
          });
        }
      } else {
        console.warn('getPendingRequests returned no data or unsuccessful:', result);
        // Set empty array to clear any stale data
        setPendingRequests([]);
      }
    } catch (error: any) {
      console.error('Failed to load pending requests via API:', error);
      // If error is "not admin", that's okay - just means user isn't admin
      if (error.response?.status === 403) {
        console.log('User is not admin, skipping pending requests load');
      } else {
        // Other errors might be network issues, but don't block UI
        toast.error('Failed to load pending requests', { duration: 3000 });
      }
    } finally {
      isLoadingPendingRequestsRef.current = false;
    }
  };

  const handleToggleAudio = async () => {
    if (permissionErrors.audio) {
      try {
        const newAudioTrack = await mediaManager.getSingleTrack('audio', selectedDevices.audioInput);

        // Remove any existing audio tracks
        if (localStream) {
          localStream.getAudioTracks().forEach(track => {
            track.stop();
            localStream.removeTrack(track);
          });
          localStream.addTrack(newAudioTrack);
          setLocalStream(new MediaStream(localStream));
        } else {
          const newStream = new MediaStream([newAudioTrack]);
          setLocalStream(newStream);
        }

        newAudioTrack.enabled = !isAudioMuted;

        const existingProducer = webrtcManager.getProducer('audio');
        if (existingProducer) {
          await webrtcManager.replaceAudioTrack(newAudioTrack);
        } else {
          await webrtcManager.produceAudio(newAudioTrack);
        }

        if (isAudioMuted) {
          newAudioTrack.enabled = false;
          try {
            await webrtcManager.pauseProducer('audio');
          } catch (pauseError) {
            console.warn('Failed to pause audio producer after replacing track:', pauseError);
          }
        } else {
          try {
            await webrtcManager.resumeProducer('audio');
          } catch (resumeError) {
            console.warn('Failed to resume audio producer after replacing track:', resumeError);
          }
        }

        setPermissionError('audio', false);
        toast.success('Microphone ready');
      } catch (error: any) {
        console.error('Failed to enable microphone after permission retry:', error);
        setPermissionError('audio', true);

        if (error.name === 'NotAllowedError') {
          toast.error('Microphone permission denied');
        } else if (error.name === 'NotFoundError') {
          toast.error('No microphone found');
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          toast.error('Microphone is busy or unavailable');
        } else {
          toast.error('Failed to start microphone');
        }
      }
      return;
    }

    const wasMuted = isAudioMuted; // Store BEFORE toggle
    const newMuted = !isAudioMuted;
    toggleAudio();
    
    // Emit mute event to other participants
    const socket = (socketManager as any).socket;
    if (socket && roomCode) {
      socket.emit('audio-mute', {
        isAudioMuted: newMuted,
        uid: user?.id || '',
      });
    }
    
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

  const handleToggleRaiseHand = () => {
    if (!user?.id) return;
    
    const userId = user.id;
    const isCurrentlyRaised = raisedHands.has(userId);
    const newRaisedState = !isCurrentlyRaised;
    
    // Emit socket event to notify others
    socketManager.raiseHand(newRaisedState, userId);
    
    // Update local state immediately for better UX
    setRaiseHand(userId, newRaisedState);
    
    // Show toast notification
    if (newRaisedState) {
      toast.success('Hand raised');
    } else {
      toast('Hand lowered');
    }
  };

  const handleToggleVideo = async () => {
    if (permissionErrors.video) {
      try {
        const newVideoTrack = await mediaManager.getSingleTrack('video', selectedDevices.videoInput);

        if (localStream) {
          localStream.getVideoTracks().forEach(track => {
            track.stop();
            localStream.removeTrack(track);
          });
          localStream.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(localStream));
        } else {
          const newStream = new MediaStream([newVideoTrack]);
          setLocalStream(newStream);
        }

        newVideoTrack.enabled = !isVideoMuted;

        const existingProducer = webrtcManager.getProducer('video');
        if (existingProducer) {
          await webrtcManager.replaceVideoTrack(newVideoTrack);
        } else {
          await webrtcManager.produceVideo(newVideoTrack);
        }

        if (isVideoMuted) {
          newVideoTrack.enabled = false;
          try {
            await webrtcManager.pauseProducer('video');
          } catch (pauseError) {
            console.warn('Failed to pause video producer after replacing track:', pauseError);
          }
        } else {
          try {
            await webrtcManager.resumeProducer('video');
          } catch (resumeError) {
            console.warn('Failed to resume video producer after replacing track:', resumeError);
          }
        }

        setPermissionError('video', false);
        toast.success('Camera ready');
      } catch (error: any) {
        console.error('Failed to enable camera after permission retry:', error);
        setPermissionError('video', true);

        if (error.name === 'NotAllowedError') {
          toast.error('Camera permission denied');
        } else if (error.name === 'NotFoundError') {
          toast.error('No camera found');
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          toast.error('Camera is busy or unavailable');
        } else {
          toast.error('Failed to start camera');
        }
      }
      return;
    }

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
        
        // Emit video mute event
        const socket = (socketManager as any).socket;
        if (socket && roomCode) {
          socket.emit('video-mute', {
            isVideoMuted: true,
            uid: user?.id || '',
          });
        }
      }
    } else {
      // Turning ON - Get new video track and replace in producer
      try {
        const newVideoTrack = await mediaManager.getSingleTrack('video', selectedDevices.videoInput);
        newVideoTrack.enabled = true;

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

        // Remove any stale/ended tracks from local stream before adding the new one
        if (localStream) {
          const existingVideoTracks = localStream.getVideoTracks();
          existingVideoTracks.forEach(track => {
            if (track !== newVideoTrack) {
              track.stop();
              localStream.removeTrack(track);
            }
          });

          if (!localStream.getVideoTracks().includes(newVideoTrack)) {
            localStream.addTrack(newVideoTrack);
          }
          setLocalStream(new MediaStream(localStream));
        } else {
          const newStream = new MediaStream([newVideoTrack]);
          setLocalStream(newStream);
        }

        console.log('Camera restarted');

        // Emit video mute event
        const socket = (socketManager as any).socket;
        if (socket && roomCode) {
          socket.emit('video-mute', {
            isVideoMuted: false,
            uid: user?.id || '',
          });
        }
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

  const handleStartScreenShare = async () => {
    console.log('handleStartScreenShare called, current state:', {
      isScreenSharing,
      userId: user?.id,
      hasExistingProducer: !!webrtcManager.getScreenShareProducer(),
      isStopping: isStoppingScreenShareRef.current,
    });

    if (isStoppingScreenShareRef.current) {
      await waitForScreenShareTeardown('pre-start');
    }

    if (isScreenSharing) {
      console.log('Screen share already active, stopping first...');
      await handleStopScreenShare();
      await waitForScreenShareTeardown('after-handleStop');
    }

    const lingeringProducer = webrtcManager.getScreenShareProducer();
    if (lingeringProducer) {
      console.log('Lingering screen share producer detected before starting new share, forcing cleanup', {
        producerId: lingeringProducer.id,
      });
      const { producerId: forcedClosedId } = await webrtcManager.closeScreenShareProducer();
      if (forcedClosedId && user?.id) {
        cleanupScreenShare(user.id, forcedClosedId);
      }
      await waitForScreenShareTeardown('after-forced-close');
    }

    try {
      console.log('Starting screen share...');

      // 1. Get screen stream
      const screenStream = await mediaManager.startScreenShare();
      const screenTrack = screenStream.getVideoTracks()[0];

      if (!screenTrack) {
        throw new Error('Failed to get screen share track');
      }

      console.log('Screen share stream obtained, track:', {
        id: screenTrack.id,
        kind: screenTrack.kind,
        enabled: screenTrack.enabled,
        readyState: screenTrack.readyState
      });

      if (!user?.id) {
        throw new Error('User not found');
      }

      // 2. Create producer
      console.log('Creating screen share producer...');
      const producer = await webrtcManager.produceScreenShare(screenTrack);

      console.log('Screen share producer created:', producer.id);

      // 3. Notify backend
      console.log('Notifying backend of screen share start...');
      await socketManager.startScreenShare(producer.id);
      console.log('Backend notified');

      // 4. Update state
      setIsScreenSharing(true);
      console.log('Set isScreenSharing to true');
      
      // Store producer mapping FIRST (so consumeProducer can skip it)
      screenShareProducersRef.current.set(user.id, producer.id);
      producerMetadataRef.current.set(producer.id, {
        userId: user.id,
        source: 'screen',
        kind: 'video',
      });
      activeScreenShareProducersRef.current.add(producer.id);
      
      console.log('Producer metadata stored:', {
        userId: user.id,
        producerId: producer.id,
        totalActiveProducers: activeScreenShareProducersRef.current.size
      });
      
      // Add to screen shares (will be filtered out in UI for current user)
      addScreenShare({
        userId: user.id,
        producerId: producer.id,
        name: user.name,
        stream: screenStream,
      });

      console.log('Screen share state updated, isScreenSharing:', true);

      // Note: We don't auto-pin our own screen share (user won't see it anyway)

      toast.success('Screen sharing started');

      // 6. Handle track end (user stops via browser)
      screenTrack.onended = async () => {
        console.log('Screen track ended via browser');
        await handleStopScreenShare();
      };
    } catch (error: any) {
      console.error('Error starting screen share:', error);
      setIsScreenSharing(false);
      if (error.name === 'NotAllowedError') {
        toast.error('Screen sharing permission denied');
      } else if (error.name === 'NotReadableError') {
        toast.error('Screen is not available');
      } else {
        toast.error('Failed to start screen sharing');
      }
    }
  };

  const handleStopScreenShare = async () => {
    if (!user?.id) {
      return;
    }

    console.log('handleStopScreenShare called, current isScreenSharing:', isScreenSharing, 'isStopping:', isStoppingScreenShareRef.current);

    // Prevent double-calls (e.g., from track.onended + user click)
    if (isStoppingScreenShareRef.current) {
      console.log('Already stopping screen share, ignoring duplicate call');
      return;
    }

    const producer = webrtcManager.getScreenShareProducer();
    const fallbackProducerId = screenShareProducersRef.current.get(user.id);
    const producerId = producer?.id ?? fallbackProducerId ?? null;

    console.log('Stop screen share - producerId:', producerId, 'hasProducer:', !!producer);

    // If no producer and no state, already stopped
    if (!producer && !producerId && !isScreenSharing) {
      console.log('Already stopped, nothing to do');
      return;
    }

    // Set stopping flag to prevent duplicate calls
    isStoppingScreenShareRef.current = true;
    console.log('Set isStoppingScreenShareRef to true');

    try {
      // Set UI state immediately to prevent UI actions
      setIsScreenSharing(false);
      console.log('Set isScreenSharing to false immediately');

      // 1. Close producer if still active
      if (producer) {
        const { producerId: closedId } = await webrtcManager.closeScreenShareProducer();
        console.log('Closed producer:', closedId);
        if (closedId) {
          cleanupScreenShare(user.id, closedId);
          toast.success('Screen sharing stopped');
          return;
        }
      }

      // 2. Stop media
      mediaManager.stopScreenShare();

      // 3. Notify backend (best-effort)
      if (producerId) {
        try {
          await socketManager.stopScreenShare(producerId);
          console.log('Notified backend - screen share stopped');
        } catch (socketError) {
          console.warn('stopScreenShare emit failed, attempting closeProducer fallback', socketError);
          try {
            await socketManager.closeProducer(producerId);
          } catch (closeError) {
            console.warn('closeProducer fallback failed', closeError);
          }
        }
      }

      // 4. Update state
      cleanupScreenShare(user.id, producerId ?? undefined);

      console.log('Screen share stop complete, isScreenSharing should be false');
      toast.success('Screen sharing stopped');
    } catch (error) {
      console.error('Error stopping screen share:', error);
      setIsScreenSharing(false);
      toast.error('Failed to stop screen sharing');
    } finally {
      isStoppingScreenShareRef.current = false;
      console.log('Reset isStoppingScreenShareRef to false (finally)');
    }
  };

  const handlePinScreenShare = (userId: string) => {
    if (pinnedScreenShareUserId === userId) {
      // Unpin
      setPinnedScreenShare(null);
    } else {
      // Pin this share
      setPinnedScreenShare(userId);
    }
  };

  const remoteParticipantTiles: ParticipantTile[] = participants
    .filter(participant => participant.userId !== user?.id)
    .map(participant => ({
      userId: participant.userId,
      name: participant.name,
      email: participant.email,
      picture: participant.picture,
      isLocal: false,
      isHost: participant.isAdmin ?? false,
      stream: remoteStreams.get(participant.userId) ?? null,
      isAudioMuted: participant.isAudioMuted ?? true,
      isVideoMuted: participant.isVideoMuted ?? true,
      isSpeaking: participant.isSpeaking ?? false,
      hasRaisedHand: participant.hasRaisedHand ?? false,
    }));

  const localTile: ParticipantTile = {
    userId: user?.id ?? 'local-user',
    name: user?.name ?? 'You',
    email: user?.email ?? '',
    picture: user?.picture ?? null,
    isLocal: true,
    isHost: isAdmin,
    stream: localStream ?? null,
    isAudioMuted,
    isVideoMuted,
    isSpeaking: activeSpeakerId === user?.id,
    hasRaisedHand: user?.id ? raisedHands.has(user.id) : false,
  };

  let allParticipantTiles: ParticipantTile[] = [localTile, ...remoteParticipantTiles];
// this is for the demo mode
  if (import.meta.env.MODE !== 'production') {
    const targetDemoCount =0
    if (allParticipantTiles.length < targetDemoCount) {
      const demoNeeded = targetDemoCount - allParticipantTiles.length;
      const existingCount = allParticipantTiles.length;
      const demoTiles = Array.from({ length: demoNeeded }, (_, index) => {
        const demoNumber = existingCount + index;
        return {
          userId: `__demo_${demoNumber}`,
          name: `Guest ${demoNumber}`,
          email: '',
          picture: null,
          isLocal: false,
          isHost: false,
          stream: null,
          isAudioMuted: true,
          isVideoMuted: true,
          isSpeaking: false,
          hasRaisedHand: false,
        } satisfies ParticipantTile;
      });
      allParticipantTiles = [...allParticipantTiles, ...demoTiles];
    }
  }

  const totalParticipants = allParticipantTiles.length;
  const hasScreenShareStage = screenShares.size > 0;
  const hasPinnedScreenShare = hasScreenShareStage && Boolean(pinnedScreenShareUserId);
  const showSplitLayout = hasPinnedScreenShare;
  const maxVisibleTiles = showSplitLayout ? 9 : 4;
  const defaultVisibleTiles = allParticipantTiles.slice(0, maxVisibleTiles);
  const participantTilesForDisplay = showSplitLayout ? allParticipantTiles : defaultVisibleTiles;
  const overflowCount = showSplitLayout ? 0 : Math.max(allParticipantTiles.length - defaultVisibleTiles.length, 0);
  const isSoloLayout = !showSplitLayout && participantTilesForDisplay.length === 1;
  const nonSplitLayoutConfig = useMemo(() => {
    if (showSplitLayout) {
      return null;
    }
    return getNonSplitLayoutConfig(participantTilesForDisplay.length);
  }, [showSplitLayout, participantTilesForDisplay.length]);
  const splitGridClasses = showSplitLayout ? getGridTemplateClasses(participantTilesForDisplay.length) : '';
  const splitGridAutoRowsClass =
    showSplitLayout && participantTilesForDisplay.length >= 7
      ? 'auto-rows-[minmax(200px,1fr)]'
      : showSplitLayout
      ? 'auto-rows-[minmax(180px,1fr)]'
      : '';
  const bottomControlsOffset = showSplitLayout ? 120 : 140;
  const splitLayoutContainerStyle = useMemo(() => {
    if (!showSplitLayout) {
      return undefined;
    }
    return {
      maxHeight: `calc(100vh - (${bottomControlsOffset}px + env(safe-area-inset-bottom)) + 8px)`,
      paddingBottom: '4px',
      marginBottom: '-4px',
    };
  }, [showSplitLayout, bottomControlsOffset]);
  const sharePaneBaseClasses =
    'flex-1 min-h-0 min-w-0 overflow-hidden rounded-[32px] border border-slate-200 bg-white/90 shadow-[0_30px_60px_-35px_rgba(14,165,233,0.35)] backdrop-blur';
  const sharePaneClassName = showSplitLayout
    ? `${sharePaneBaseClasses} ${isSidebarCollapsed ? 'lg:basis-full xl:basis-full' : 'lg:basis-[78%] xl:basis-[82%]'}`
    : sharePaneBaseClasses;
  const activeSpeakerTile = showSplitLayout
    ? allParticipantTiles.find(tile => tile.userId === activeSpeakerId)
    : undefined;
  const activeSpeakerStream = activeSpeakerTile?.stream ?? null;
  const activeSpeakerHasLiveVideo = Boolean(
    activeSpeakerStream &&
    activeSpeakerStream.getVideoTracks().some(track => track.readyState === 'live' && track.enabled) &&
    !activeSpeakerTile?.isVideoMuted
  );
  const shouldShowActiveSpeakerOverlay = Boolean(
    showSplitLayout && activeSpeakerTile && activeSpeakerTile.userId !== pinnedScreenShareUserId
  );
  const mainLayoutSpacingClass = isSidebarCollapsed ? 'gap-2 pt-0' : 'gap-4 pt-4';

  useEffect(() => {
    if (!showSplitLayout && isSidebarCollapsed) {
      setIsSidebarCollapsed(false);
    }
  }, [showSplitLayout, isSidebarCollapsed]);

  useEffect(() => {
    const videoElement = activeSpeakerVideoRef.current;
    const stream = shouldShowActiveSpeakerOverlay && activeSpeakerHasLiveVideo ? activeSpeakerStream : null;

    if (!videoElement) {
      return;
    }

    if (!stream) {
      if (videoElement.srcObject) {
        videoElement.srcObject = null;
      }
      return;
    }

    if (videoElement.srcObject !== stream) {
      videoElement.srcObject = stream;
    }

    videoElement.play().catch(error => {
      console.warn('Error playing active speaker overlay video:', error);
    });
  }, [activeSpeakerHasLiveVideo, activeSpeakerStream, shouldShowActiveSpeakerOverlay]);

  function getNonSplitLayoutConfig(count: number) {
    const baseGrid = 'grid h-full w-full gap-4 grid-cols-1 sm:grid-cols-2';

    if (count <= 0) {
      return {
        gridClasses: `${baseGrid} content-center justify-items-center`,
        autoRowsClass: '',
        tileBaseClass: '',
      };
    }

    if (count === 1) {
      return {
        gridClasses: 'grid h-full w-full gap-4 grid-cols-1',
        autoRowsClass: 'auto-rows-[minmax(100%,1fr)]',
        tileBaseClass: 'min-h-full h-full max-h-full',
      };
    }

    if (count === 2) {
      return {
        gridClasses: `${baseGrid} items-stretch`,
        autoRowsClass: 'auto-rows-[minmax(260px,1fr)] sm:auto-rows-[minmax(340px,1fr)]',
        tileBaseClass: 'min-h-[260px] sm:min-h-[340px] max-h-full sm:max-h-[560px]',
      };
    }

    if (count === 3) {
      return {
        gridClasses: `${baseGrid} items-stretch`,
        autoRowsClass: 'auto-rows-[minmax(260px,1fr)] sm:auto-rows-[minmax(320px,1fr)]',
        tileBaseClass: 'min-h-[260px] sm:min-h-[320px] max-h-full sm:max-h-[520px]',
        tileClassForIndex: (index: number) =>
          index === 2 ? 'sm:col-span-2 sm:justify-self-center sm:w-full sm:max-w-[600px]' : '',
      };
    }

    return {
      gridClasses: `${baseGrid} items-stretch`,
      autoRowsClass: 'auto-rows-[minmax(220px,1fr)] sm:auto-rows-[minmax(280px,1fr)]',
      tileBaseClass: 'min-h-[220px] sm:min-h-[280px] max-h-full sm:max-h-[480px]',
    };
  }

  function getGridTemplateClasses(count: number) {
    if (count <= 1) {
      return 'grid-cols-1';
    }
    if (count === 2) {
      return 'grid-cols-1 md:grid-cols-2';
    }
    if (count === 3) {
      return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    }
    if (count >= 4 && count <= 6) {
      return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    }
    return 'grid-cols-1 sm:grid-cols-2';
  }

  const setRemoteVideoRef = (tile: ParticipantTile) => (element: HTMLVideoElement | null) => {
    if (!tile.stream) {
      remoteVideoRefs.current.delete(tile.userId);
      return;
    }

    if (!element) {
      remoteVideoRefs.current.delete(tile.userId);
      return;
    }

    remoteVideoRefs.current.set(tile.userId, element);

    if (element.srcObject !== tile.stream) {
      element.srcObject = tile.stream;
    }

    if (element.paused) {
      element.play().catch(() => {
        /* ignore autoplay errors */
      });
    }
  };

  const renderParticipantTile = (tile: ParticipantTile, index: number) => {
    const tileStream = tile.stream ?? null;
    const videoTracks = tileStream?.getVideoTracks() ?? [];
    const hasLiveVideo = videoTracks.some(track => track.readyState === 'live');
    const shouldShowVideo = Boolean(tileStream && !tile.isVideoMuted && hasLiveVideo);
    const layoutTileBaseClass = !showSplitLayout ? nonSplitLayoutConfig?.tileBaseClass ?? '' : '';
    const layoutTileIndexClass =
      !showSplitLayout && nonSplitLayoutConfig?.tileClassForIndex
        ? nonSplitLayoutConfig.tileClassForIndex(index)
        : '';

    const tileClasses = [
      'relative overflow-hidden rounded-3xl border border-slate-200 bg-white/90 shadow-[0_24px_60px_-35px_rgba(14,165,233,0.35)] transition-all',
      'w-full',
      tile.isSpeaking ? 'ring-2 ring-cyan-400 shadow-[0_0_0_4px_rgba(14,165,233,0.15)]' : '',
      tile.isLocal ? 'ring-1 ring-cyan-200/60' : '',
      showSplitLayout ? 'aspect-[4/3]' : isSoloLayout ? 'h-full' : '',
      layoutTileBaseClass,
      layoutTileIndexClass,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div key={`${tile.userId}-${tile.isLocal ? 'local' : 'remote'}`} className={tileClasses}>
        <video
          ref={tile.isLocal ? localVideoRef : setRemoteVideoRef(tile)}
          autoPlay
          playsInline
          muted={tile.isLocal}
          className="h-full w-full bg-slate-950/90 object-cover"
          style={{ visibility: shouldShowVideo ? 'visible' : 'hidden' }}
        />

        {!shouldShowVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-900/80 text-white/70">
            {tile.picture ? (
              <img
                src={tile.picture}
                alt={tile.name}
                className="h-16 w-16 rounded-full border border-white/40 object-cover"
              />
            ) : (
              <svg className="h-16 w-16 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            )}
            <span className="text-sm font-medium">{tile.name}</span>
          </div>
        )}

        {tile.isAudioMuted && (
          <div className="absolute left-4 top-4 rounded-full bg-rose-500 p-2 text-white shadow">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          </div>
        )}

        {tile.hasRaisedHand && (
          <div className="absolute right-4 top-4 rounded-full bg-amber-300 p-2 text-amber-900 shadow">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 0a1.5 1.5 0 00-3 0v2.5m6 0V11m0-5.5v-1a1.5 1.5 0 00-3 0v1m0 0V11m3-5.5a1.5 1.5 0 00-3 0v3m6 0V11" />
            </svg>
          </div>
        )}

        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white backdrop-blur">
          <span className="normal-case tracking-normal">
            {tile.name}
            {tile.isLocal ? ' (You)' : ''}
          </span>
          {tile.isHost && (
            <span className="rounded-full bg-cyan-200/80 px-2 py-0.5 text-[10px] font-semibold uppercase text-cyan-900">
              Host
            </span>
          )}
        </div>
      </div>
    );
  };

   // Show waiting room if user is waiting for approval
   if (showWaitingRoom && roomCode) {
     return (
       <WaitingRoom
         roomCode={roomCode}
         onCancel={() => {
           setShowWaitingRoom(false);
           navigate('/', { replace: true });
         }}
         onApproved={() => {
           // Hide waiting room and retry connection
           setShowWaitingRoom(false);
           setIsConnecting(true);
           // Reset connection flag to allow retry
           hasConnectedRef.current = false;
           connectToRoom();
         }}
       />
     );
   }

   // Show leaving state
   if (isLeaving) {
     return (
      <div className="min-h-screen flex items-center justify-center bg-[#f7f9fc] text-slate-600">
        <div className="text-center space-y-3">
          <div className="mx-auto h-12 w-12 rounded-full border-2 border-slate-200 border-t-cyan-400 animate-spin"></div>
          <p className="text-slate-800 font-medium">Leaving room...</p>
          <p className="text-sm text-slate-500">Please wait while we reset your session.</p>
         </div>
       </div>
     );
   }

  if (isConnecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc] text-slate-600">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 rounded-full border-2 border-slate-200 border-t-cyan-400 animate-spin" />
          <p className="mt-4 font-medium text-slate-800">Connecting to room...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc]">
        <div className="max-w-md rounded-[24px] border border-rose-100 bg-white/90 px-8 py-10 text-center text-rose-500 shadow-[0_28px_70px_-40px_rgba(244,63,94,0.35)]">
          <div className="mb-4 text-5xl">⚠️</div>
          <h1 className="mb-2 text-2xl font-semibold text-slate-900">Connection error</h1>
          <p className="mb-6 text-slate-500">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-3 font-semibold text-white shadow-[0_18px_45px_-28px_rgba(14,165,233,0.55)] transition hover:from-cyan-500 hover:via-sky-600 hover:to-indigo-600"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#f7f9fc] text-slate-900">
      {hasPermissionIssue && !permissionBannerDismissed && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-3 rounded-[24px] border border-amber-200 bg-white/95 p-4 shadow-[0_18px_55px_-28px_rgba(251,191,36,0.55)] backdrop-blur">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L4.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-amber-800">You’re in listen-only mode</p>
                  <p className="mt-1 text-sm text-amber-700">
                    Your browser blocked access to {permissionErrors.audio && permissionErrors.video ? 'the microphone and camera' : permissionErrors.audio ? 'the microphone' : 'the camera'}. Use the controls below to grant permission and re-enable them.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermissionBannerDismissed(true)}
                className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-transparent text-amber-600 transition hover:border-amber-200 hover:bg-amber-50"
                aria-label="Dismiss permission warning"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {permissionErrors.audio && (
                <button
                  type="button"
                  onClick={() => handleToggleAudio()}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-slate-700"
                >
                  Retry microphone
                </button>
              )}
              {permissionErrors.video && (
                <button
                  type="button"
                  onClick={() => handleToggleVideo()}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 transition hover:bg-slate-900 hover:text-white"
                >
                  Retry camera
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-36 -top-24 h-[520px] w-[520px] rounded-full bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 opacity-70 blur-[170px]" />
        <div className="absolute right-[-160px] bottom-[-180px] h-[520px] w-[520px] rounded-full bg-gradient-to-tl from-white via-cyan-100 to-indigo-100 opacity-60 blur-[180px]" />
      </div>

      <div className="relative z-10 flex h-full flex-col">
        {false && (
          <header className="flex h-14 shrink-0 items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.45em] text-slate-400">CYNAYD CONNECT</p>
                <p className="text-sm font-semibold text-slate-700">Room {roomCode}</p>
              </div>
              <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 shadow-sm sm:inline-flex">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7a3 3 0 11-6 0 3 3 0 016 0zM4 15.5a4 4 0 014-4h4a4 4 0 014 4v.5H4v-.5z" />
                </svg>
                {totalParticipants} participant{totalParticipants === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-500">
                Live
              </span>
              <button
                onClick={() => setShowParticipantList(true)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-600 shadow-sm transition hover:border-cyan-200 hover:text-cyan-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7a3 3 0 11-6 0 3 3 0 016 0zM4 15.5a4 4 0 014-4h4a4 4 0 014 4v.5H4v-.5zM17 6v4m2-2h-4" />
                </svg>
                View list
              </button>
            </div>
          </header>
        )}

        {isScreenSharing && (
          <div className="flex items-center justify-between border-b border-amber-200 bg-amber-100/90 px-6 py-3 text-amber-700 backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-medium">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span>You are sharing your screen</span>
            </div>
            <button
              onClick={handleStopScreenShare}
              className="text-sm font-semibold underline transition hover:text-amber-900"
            >
              Stop sharing
            </button>
          </div>
        )}

        <main
          className={`relative flex min-h-0 flex-1 flex-col px-4 ${mainLayoutSpacingClass}`}
          style={{ paddingBottom: `calc(${bottomControlsOffset}px + env(safe-area-inset-bottom))` }}
        >
          {showSplitLayout ? (
            <div
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:items-stretch lg:gap-6"
              style={splitLayoutContainerStyle}
            >
              <div className={`${sharePaneClassName} relative`} style={{ maxHeight: 'calc(100vh - 140px)' }}>
                <ScreenShareSection
                  screenShares={screenShares}
                  pinnedUserId={pinnedScreenShareUserId}
                  onPin={handlePinScreenShare}
                  remoteStreams={screenShareStreams}
                  currentUserId={user?.id}
                />

                <button
                  type="button"
                  onClick={() => setIsSidebarCollapsed(prev => !prev)}
                  title={isSidebarCollapsed ? 'Show participants sidebar' : 'Hide participants sidebar'}
                  aria-label={isSidebarCollapsed ? 'Show participants sidebar' : 'Hide participants sidebar'}
                  aria-expanded={!isSidebarCollapsed}
                  className="pointer-events-auto absolute right-6 top-6 hidden items-center gap-2 rounded-full border border-white/60 bg-white/85 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm transition hover:border-cyan-200 hover:text-cyan-600 lg:inline-flex"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                    {isSidebarCollapsed ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 6l8 4-8 4V6z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 6l-8 4 8 4V6z" />
                    )}
                  </svg>
                  {isSidebarCollapsed ? 'Show participants' : 'Hide participants'}
                </button>

                {shouldShowActiveSpeakerOverlay && activeSpeakerTile && (
                  <div className="pointer-events-auto absolute bottom-6 right-6 flex w-[min(240px,35%)] flex-col gap-2 rounded-3xl border border-white/40 bg-white/90 p-3 shadow-[0_22px_45px_-28px_rgba(15,23,42,0.45)] backdrop-blur">
                    <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900/85">
                      {activeSpeakerHasLiveVideo ? (
                        <video
                          ref={activeSpeakerVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-slate-900/80 text-white/70">
                          {activeSpeakerTile.picture ? (
                            <img
                              src={activeSpeakerTile.picture}
                              alt={activeSpeakerTile.name}
                              className="h-12 w-12 rounded-full border border-white/40 object-cover"
                            />
                          ) : (
                            <svg className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          )}
                        </div>
                      )}
                      <div className="absolute left-3 top-3 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-white">
                        Speaker
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-600">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-slate-700">
                          {activeSpeakerTile.name}
                          {activeSpeakerTile.isLocal ? ' (You)' : ''}
                        </span>
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full ${
                            activeSpeakerTile.isAudioMuted
                              ? 'bg-rose-100 text-rose-500'
                              : 'bg-cyan-100 text-cyan-600'
                          }`}
                        >
                          {activeSpeakerTile.isAudioMuted ? (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10v2a3 3 0 01-6 0V7m9 5a7 7 0 01-7 7m0 0a7 7 0 01-7-7v-2m7 7v4" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                            </svg>
                          ) : (
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5a3 3 0 016 0v6a3 3 0 11-6 0V5z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10v2a7 7 0 0014 0v-2" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17v4" />
                            </svg>
                          )}
                        </span>
                      </div>
                      {activeSpeakerTile.isHost && (
                        <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-cyan-700">
                          Host
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {isSidebarCollapsed ? (
                <div className="hidden lg:flex lg:flex-col lg:items-end">
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-cyan-200 hover:text-cyan-600"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 6l8 4-8 4V6z" />
                    </svg>
                    Show participants
                  </button>
                </div>
              ) : (
                <aside
                  className="flex w-full min-h-0 flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white/80 backdrop-blur lg:basis-[22%] lg:max-w-[300px] xl:basis-[18%]"
                  style={{ maxHeight: 'calc(100vh - 140px)' }}
                >
                  <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                    <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Participants</p>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        {totalParticipants}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsSidebarCollapsed(true)}
                        className="hidden rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500 transition hover:border-cyan-200 hover:text-cyan-600 lg:inline-flex"
                      >
                        Hide
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 pr-5 min-h-0">
                    {participantTilesForDisplay.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">
                        Waiting for participants…
                      </div>
                    ) : (
                      participantTilesForDisplay.map((tile, index) => renderParticipantTile(tile, index))
                    )}
                  </div>
                </aside>
              )}
            </div>
          ) : (
            <>
              {hasScreenShareStage && (
                <div className="flex-none overflow-hidden rounded-[32px] border border-slate-200 bg-white/90 shadow-[0_30px_60px_-35px_rgba(14,165,233,0.35)]">
                  <ScreenShareSection
                    screenShares={screenShares}
                    pinnedUserId={pinnedScreenShareUserId}
                    onPin={handlePinScreenShare}
                    remoteStreams={screenShareStreams}
                    currentUserId={user?.id}
                  />
                </div>
              )}

              <div className="relative flex flex-1 overflow-hidden">
                <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white/80 backdrop-blur">
                  <div
                    className={`relative h-full w-full p-4 ${
                      showSplitLayout ? 'overflow-y-auto pr-3 sm:pr-4' : 'overflow-hidden'
                    }`}
                    style={{ maxHeight: 'calc(100vh - 140px)' }}
                  >
                    {participantTilesForDisplay.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">
                        Waiting for participants…
                      </div>
                    ) : (
                      <div
                        className={
                          showSplitLayout
                            ? `grid h-full w-full gap-4 ${splitGridClasses} ${splitGridAutoRowsClass}`
                            : `${nonSplitLayoutConfig?.gridClasses ?? 'grid h-full w-full gap-4 grid-cols-1 sm:grid-cols-2'} ${
                                nonSplitLayoutConfig?.autoRowsClass ?? ''
                              }`
                        }
                      >
                        {participantTilesForDisplay.map((tile, index) => renderParticipantTile(tile, index))}
                      </div>
                    )}

                    {!showSplitLayout && overflowCount > 0 && (
                      <button
                        onClick={() => setShowParticipantList(true)}
                        className="absolute right-6 top-6 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow transition hover:border-cyan-200 hover:text-cyan-600"
                      >
                        +{overflowCount} more participants
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>

        <div className="pointer-events-none absolute bottom-0 left-1/2 z-30 -translate-x-1/2 px-4 lg:max-w-4xl">
          <div
            className="pointer-events-auto flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/60 bg-white/90 px-6 py-4 shadow-[0_22px_45px_-28px_rgba(14,165,233,0.45)]"
            style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}
          >
            <button
              onClick={handleToggleAudio}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition ${
                isAudioMuted
                  ? 'bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 shadow-[0_15px_35px_-20px_rgba(244,63,94,0.65)] hover:from-rose-600 hover:via-rose-700 hover:to-rose-800'
                  : 'bg-slate-800 hover:bg-slate-900'
              }`}
              title={isAudioMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isAudioMuted ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>

            <button
              onClick={handleToggleVideo}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition ${
                isVideoMuted
                  ? 'bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 shadow-[0_15px_35px_-20px_rgba(244,63,94,0.65)] hover:from-rose-600 hover:via-rose-700 hover:to-rose-800'
                  : 'bg-slate-800 hover:bg-slate-900'
              }`}
              title={isVideoMuted ? 'Turn camera on' : 'Turn camera off'}
            >
              {isVideoMuted ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            <button
              onClick={handleToggleRaiseHand}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition ${
                user?.id && raisedHands.has(user.id)
                  ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 shadow-[0_15px_35px_-20px_rgba(251,191,36,0.65)] hover:from-amber-500 hover:via-amber-600 hover:to-amber-700'
                  : 'bg-slate-800 hover:bg-slate-900'
              }`}
              title={user?.id && raisedHands.has(user.id) ? 'Lower hand' : 'Raise hand'}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 0a1.5 1.5 0 00-3 0v2.5m6 0V11m0-5.5v-1a1.5 1.5 0 00-3 0v1m0 0V11m3-5.5a1.5 1.5 0 00-3 0v3m6 0V11" />
              </svg>
            </button>

            <button
              onClick={isScreenSharing ? handleStopScreenShare : handleStartScreenShare}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition ${
                isScreenSharing
                  ? 'bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 shadow-[0_15px_35px_-20px_rgba(244,63,94,0.65)] hover:from-rose-600 hover:via-rose-700 hover:to-rose-800'
                  : 'bg-slate-800 hover:bg-slate-900'
              }`}
              title={isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
            >
              {isScreenSharing ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              )}
            </button>

            <button
              onClick={() => {
                setShowChatPanel(true);
                setChatActiveConversation(EVERYONE_CONVERSATION_ID);
              }}
              className="relative flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-cyan-200 hover:text-cyan-600"
              title="Open chat"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 8h10M7 12h6m7 0a9 9 0 11-4.219-7.516L21 4v8z"
                />
              </svg>
              {chatUnreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                  {chatUnreadCount > 9 ? '9+' : chatUnreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowParticipantList(true)}
              className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-cyan-200 hover:text-cyan-600"
              title="Show participants"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setShowRoomSettings(true)}
                  className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-cyan-200 hover:text-cyan-600"
                  title="Room settings"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>

                <button
                  onClick={() => setShowPendingRequests(!showPendingRequests)}
                  className="relative flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-cyan-200 hover:text-cyan-600"
                  title="Join requests"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  {pendingRequests.length > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-semibold text-white">
                      {pendingRequests.length}
                    </span>
                  )}
                </button>
              </>
            )}

            <button
              onClick={leaveRoom}
              disabled={isLeaving}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(244,63,94,0.65)] transition hover:from-rose-600 hover:via-rose-700 hover:to-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
              title={isLeaving ? 'Leaving room...' : 'Leave room'}
            >
              {isLeaving ? (
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="hidden sm:inline">Leave</span>
            </button>
          </div>
        </div>
      </div>

      <ParticipantList isOpen={showParticipantList} onClose={() => setShowParticipantList(false)} />
      {roomCode && (
        <>
          <PendingRequestsPanel
            isOpen={showPendingRequests}
            onClose={() => setShowPendingRequests(false)}
            roomCode={roomCode}
          />
          <RoomSettings
            isOpen={showRoomSettings}
            onClose={() => setShowRoomSettings(false)}
            roomCode={roomCode}
            currentIsPublic={roomIsPublic}
            participantCount={participants.length + 1}
          />
        </>
      )}
      {showChatPanel &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex justify-end">
            <button
              type="button"
              onClick={() => setShowChatPanel(false)}
              className="absolute inset-0 z-0 bg-slate-900/30 backdrop-blur-sm transition"
              aria-label="Close chat panel"
            />
            <div className="relative z-10 h-full w-full max-w-[28rem]">
              <ChatPanel
                currentUser={{
                  id: user?.id ?? 'local-user',
                  name: user?.name ?? 'You',
                  email: user?.email ?? '',
                  picture: user?.picture ?? null,
                }}
                onClose={() => setShowChatPanel(false)}
                className="h-full"
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
