import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import {
  useCallStore,
  EVERYONE_CONVERSATION_ID,
  type ChatMessage,
  type ParticipantRole,
} from '../store/callStore';
import { socketManager } from '../lib/socket';
import { mediaManager } from '../lib/media';
import { webrtcManager } from '../lib/webrtc';
import { NetworkMonitor } from '../lib/networkMonitor';
import { ActiveSpeakerDetector } from '../lib/activeSpeaker';
import { config } from '../config';
import ParticipantList from '../components/call/ParticipantList';
import PendingRequestsPanel from '../components/call/PendingRequestsPanel';
import RoomSettings from '../components/call/RoomSettings';
import KeyboardShortcuts from '../components/call/KeyboardShortcuts';
import WaitingRoom from '../components/call/WaitingRoom';
import ScreenShareSection from '../components/call/ScreenShareSection';
import PermissionBanner from '../components/call/PermissionBanner';
import RecordingIndicator from '../components/call/RecordingIndicator';
import BackgroundGradients from '../components/call/BackgroundGradients';
import ScreenShareBanner from '../components/call/ScreenShareBanner';
import SidebarToggleButton from '../components/call/SidebarToggleButton';
import ActiveSpeakerOverlay from '../components/call/ActiveSpeakerOverlay';
import CollapsedSidebarButton from '../components/call/CollapsedSidebarButton';
import ParticipantsSidebar from '../components/call/ParticipantsSidebar';
import OverflowParticipantsButton from '../components/call/OverflowParticipantsButton';
import LoadingState from '../components/call/LoadingState';
import ErrorState from '../components/call/ErrorState';
import BottomControlsBar from '../components/call/BottomControlsBar';
import ChatPanelPortal from '../components/call/ChatPanelPortal';
import { getPendingRequests, requestRoomJoin } from '../lib/api';
import api from '../lib/api';
import { storage } from '../lib/storage';
import DevicePermissionDialog from '../components/call/DevicePermissionDialog';
import { getAudioDeviceStatus, getVideoDeviceStatus, setupPermissionListener, setupDeviceChangeListener } from '../lib/deviceStatus';
import type {
  RecordingStateEventPayload,
  RecordingErrorEventPayload,
  SocketEventKey,
  ServerParticipant,
  ParticipantTile,
} from '../types/call';
import CallParticipantTile from '../components/call/CallParticipantTile';
import { useCallMedia } from '../hooks/call/useCallMedia';
import { useCallScreenShare } from '../hooks/call/useCallScreenShare';
import { useCallHostControls } from '../hooks/call/useCallHostControls';
import { useCallState } from '../hooks/call/useCallState';
import { useCallStreams } from '../hooks/call/useCallStreams';
import { useCallDevices } from '../hooks/call/useCallDevices';
import { useCallLayout } from '../hooks/call/useCallLayout';
import { useCallProducerConsumption } from '../hooks/call/useCallProducerConsumption';
import { reconnectionManager } from '../lib/reconnectionManager';
import ReconnectionOverlay from '../components/call/ReconnectionOverlay';
import {
  normalizeRecordingState,
  resolveProducerMeta,
  runOrQueueParticipantUpdate,
  flushPendingParticipantEvents,
} from '../utils/callHelpers';

const END_MEETING_TOAST_ID = 'ending-meeting';
const END_MEETING_REQUEST_TIMEOUT_MS = 5000;
const END_MEETING_FALLBACK_TIMEOUT_MS = 5000;

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
    participantRole,
    isHost,
    roomIsPublic,
    pendingRequests,
    activeSpeakerId,
    preJoinCompleted,
    raisedHands,
    setIsAdmin,
    setParticipantRole,
    setIsHost,
    setRoomIsPublic,
    setPendingRequests,
    addPendingRequest,
    setActiveSpeaker,
    setRaiseHand,
    resetCallState,
    setReconnectionState,
    preserveState,
    restoreState,
    clearPreservedState,
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
    deviceStatus,
    setDeviceStatus,
    chat,
    ingestChatMessage,
    setChatActiveConversation,
    updateNetworkQuality,
    clearNetworkQuality,
    hostControls,
    setHostControls,
    applyParticipantForceState,
    recording,
    setRecordingState,
    resetRecordingState,
  } = useCallStore();

  const navigate = useNavigate();

  // Initialize state hooks
  const callState = useCallState({ hostControls, recording });
  const callStreams = useCallStreams();
  const callDevices = useCallDevices();

  // Destructure state for easier access
  const {
    showPendingRequests,
    setShowPendingRequests,
    showRoomSettings,
    setShowRoomSettings,
    showShortcuts,
    setShowShortcuts,
    showWaitingRoom,
    setShowWaitingRoom,
    isLeaving,
    setIsLeaving,
    isEndingMeeting,
    setIsEndingMeeting,
    isSidebarCollapsed,
    setIsSidebarCollapsed,
    showParticipantList,
    setShowParticipantList,
    showChatPanel,
    setShowChatPanel,
    permissionBannerDismissed,
    setPermissionBannerDismissed,
    showDeviceDialog,
    setShowDeviceDialog,
    deviceDialogType,
    setDeviceDialogType,
    showAudioDropdown,
    setShowAudioDropdown,
    showVideoDropdown,
    setShowVideoDropdown,
    localIsSpeaking,
    setLocalIsSpeaking,
    localForceState,
    setLocalForceState,
    isConnecting,
    setIsConnecting,
    error,
    setError,
    recordingElapsedSeconds,
    setRecordingElapsedSeconds,
    windowSize,
    hasConnectedRef,
    isLeavingRef,
    isEndingMeetingRef,
    isLoadingPendingRequestsRef,
    endMeetingFallbackTimerRef,
    hasHandledRoomEndedRef,
    previousHostControlsRef,
    previousRecordingStatusRef,
    showChatPanelRef,
    audioAutoMutedRef,
    videoAutoMutedRef,
    isReconnectingRef,
    isDisconnectHandledRef,
    preservedLocalStreamRef,
  } = callState;

  const {
    remoteStreams,
    setRemoteStreams,
    screenShareStreams,
    setScreenShareStreams,
    localVideoRef,
    localVideoElement,
    setLocalVideoRef,
    remoteVideoRefs,
    getRemoteVideoRef,
    remoteAudioRefs,
    hasEnabledAudioPlayback,
    getRemoteAudioRef,
    consumingProducersRef,
    screenShareProducersRef,
    producerMetadataRef,
    activeScreenShareProducersRef,
    isStoppingScreenShareRef,
    networkMonitorRef,
    activeSpeakerDetectorRef,
    pendingParticipantEventsRef,
  } = callStreams;

  const { availableDevices } = callDevices;

  // Wrapper functions for utility helpers
  const runOrQueueParticipantUpdateWrapper = useCallback(
    (targetUserId: string | undefined, action: () => void) => {
      runOrQueueParticipantUpdate(targetUserId, action, useCallStore.getState, pendingParticipantEventsRef);
    },
    []
  );

  const flushPendingParticipantEventsWrapper = useCallback(
    (targetUserId: string | undefined) => {
      flushPendingParticipantEvents(targetUserId, pendingParticipantEventsRef);
    },
    []
  );

  // Initialize producer consumption hook
  const { consumeProducer, consumeScreenShareProducer } = useCallProducerConsumption({
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
    runOrQueueParticipantUpdate: runOrQueueParticipantUpdateWrapper,
  });


  useEffect(() => {
    return () => {
      if (endMeetingFallbackTimerRef.current) {
        clearTimeout(endMeetingFallbackTimerRef.current);
        endMeetingFallbackTimerRef.current = null;
      }
    };
  }, []);

  // Monitor device status for audio and video
  useEffect(() => {
    const updateDeviceStatus = async () => {
      const audioTrack = localStream?.getAudioTracks()[0];
      const videoTrack = localStream?.getVideoTracks()[0];

      const [audioStatus, videoStatus] = await Promise.all([
        getAudioDeviceStatus(audioTrack),
        getVideoDeviceStatus(videoTrack),
      ]);

      setDeviceStatus('audio', audioStatus);
      setDeviceStatus('video', videoStatus);

      // Handle audio: Force mute when issues exist, auto-unmute when resolved
      if (audioStatus.issueType !== 'none') {
        if (!isAudioMuted) {
          setLocalAudioMuted(true);
          audioAutoMutedRef.current = true;
        }
      } else if (audioAutoMutedRef.current && isAudioMuted) {
        // Issue resolved and we had auto-muted it - unmute it
        setLocalAudioMuted(false);
        audioAutoMutedRef.current = false;
      }

      // Handle video: Force mute when issues exist, auto-unmute when resolved
      if (videoStatus.issueType !== 'none') {
        if (!isVideoMuted) {
          setLocalVideoMuted(true);
          videoAutoMutedRef.current = true;
        }
      } else if (videoAutoMutedRef.current && isVideoMuted) {
        // Issue resolved and we had auto-muted it - unmute it
        setLocalVideoMuted(false);
        videoAutoMutedRef.current = false;
      }
    };

    updateDeviceStatus();

    // Setup permission listeners
    const cleanupAudioPermission = setupPermissionListener('microphone', async () => {
      const audioTrack = localStream?.getAudioTracks()[0];
      const status = await getAudioDeviceStatus(audioTrack);
      setDeviceStatus('audio', status);

      // Handle audio: Force mute when issues exist, auto-unmute when resolved
      if (status.issueType !== 'none') {
        if (!isAudioMuted) {
          setLocalAudioMuted(true);
          audioAutoMutedRef.current = true;
        }
      } else if (audioAutoMutedRef.current && isAudioMuted) {
        setLocalAudioMuted(false);
        audioAutoMutedRef.current = false;
      }
    });

    const cleanupVideoPermission = setupPermissionListener('camera', async () => {
      const videoTrack = localStream?.getVideoTracks()[0];
      const status = await getVideoDeviceStatus(videoTrack);
      setDeviceStatus('video', status);

      // Handle video: Force mute when issues exist, auto-unmute when resolved
      if (status.issueType !== 'none') {
        if (!isVideoMuted) {
          setLocalVideoMuted(true);
          videoAutoMutedRef.current = true;
        }
      } else if (videoAutoMutedRef.current && isVideoMuted) {
        setLocalVideoMuted(false);
        videoAutoMutedRef.current = false;
      }
    });

    // Setup device change listener
    const cleanupDeviceChange = setupDeviceChangeListener(updateDeviceStatus);

    return () => {
      cleanupAudioPermission?.();
      cleanupVideoPermission?.();
      cleanupDeviceChange();
    };
  }, [localStream, setDeviceStatus, isAudioMuted, isVideoMuted, setLocalAudioMuted, setLocalVideoMuted]);

  // Sync audio processing preferences to MediaManager when they change
  useEffect(() => {
    if (settings.audioProcessing) {
      mediaManager.setAudioProcessingPreferences(settings.audioProcessing);
    } else {
      // Clear preferences if not set (use config defaults)
      mediaManager.setAudioProcessingPreferences(null);
    }
  }, [settings.audioProcessing]);

  // Monitor track mute state changes
  useEffect(() => {
    const audioTrack = localStream?.getAudioTracks()[0];
    const videoTrack = localStream?.getVideoTracks()[0];

    const handleTrackMuteChange = async () => {
      const [audioStatus, videoStatus] = await Promise.all([
        getAudioDeviceStatus(audioTrack),
        getVideoDeviceStatus(videoTrack),
      ]);

      setDeviceStatus('audio', audioStatus);
      setDeviceStatus('video', videoStatus);

      // Handle audio: Force mute when issues exist, auto-unmute when resolved
      if (audioStatus.issueType !== 'none') {
        if (!isAudioMuted) {
          setLocalAudioMuted(true);
          audioAutoMutedRef.current = true;
        }
      } else if (audioAutoMutedRef.current && isAudioMuted) {
        setLocalAudioMuted(false);
        audioAutoMutedRef.current = false;
      }

      // Handle video: Force mute when issues exist, auto-unmute when resolved
      if (videoStatus.issueType !== 'none') {
        if (!isVideoMuted) {
          setLocalVideoMuted(true);
          videoAutoMutedRef.current = true;
        }
      } else if (videoAutoMutedRef.current && isVideoMuted) {
        setLocalVideoMuted(false);
        videoAutoMutedRef.current = false;
      }
    };

    if (audioTrack) {
      audioTrack.addEventListener('mute', handleTrackMuteChange);
      audioTrack.addEventListener('unmute', handleTrackMuteChange);
    }

    if (videoTrack) {
      videoTrack.addEventListener('mute', handleTrackMuteChange);
      videoTrack.addEventListener('unmute', handleTrackMuteChange);
    }

    return () => {
      if (audioTrack) {
        audioTrack.removeEventListener('mute', handleTrackMuteChange);
        audioTrack.removeEventListener('unmute', handleTrackMuteChange);
      }
      if (videoTrack) {
        videoTrack.removeEventListener('mute', handleTrackMuteChange);
        videoTrack.removeEventListener('unmute', handleTrackMuteChange);
      }
    };
  }, [localStream, setDeviceStatus, isAudioMuted, isVideoMuted, setLocalAudioMuted, setLocalVideoMuted]);

  useEffect(() => {
    if (!hasCheckedAuth || isLeaving || isLeavingRef.current) {
      return;
    }

    if (!preJoinCompleted && roomCode) {
      navigate(`/pre-join/${roomCode}`, { replace: true });
    }
  }, [preJoinCompleted, roomCode, navigate, hasCheckedAuth, isLeaving]);


  useEffect(() => {
    previousHostControlsRef.current = hostControls;
  }, [hostControls]);

  useEffect(() => {
    const previous = previousRecordingStatusRef.current;
    const currentStatus = recording.status ?? null;
    if (previous !== currentStatus) {
      if (currentStatus === 'STARTING') {
        toast('Preparing recording…');
      } else if (currentStatus === 'RECORDING') {
        toast.success('Recording started');
      } else if (currentStatus === 'UPLOADING') {
        toast('Finalising recording…');
      } else if (currentStatus === 'COMPLETED') {
        toast.success('Recording saved');
      } else if (currentStatus === 'FAILED') {
        toast.error(recording.failureReason ?? 'Recording failed');
      }
      previousRecordingStatusRef.current = currentStatus;
    }
  }, [recording.status, recording.failureReason]);

  useEffect(() => {
    let intervalId: number | null = null;
    if (recording.active && recording.startedAt) {
      const startTime = new Date(recording.startedAt).getTime();
      if (!Number.isNaN(startTime)) {
        const updateElapsed = () => {
          setRecordingElapsedSeconds(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
        };
        updateElapsed();
        intervalId = window.setInterval(updateElapsed, 1000);
      }
    } else {
      setRecordingElapsedSeconds(0);
    }

    return () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [recording.active, recording.startedAt]);

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

  const audioForceActive =
    (!isAdmin && hostControls.audioForceAll) || localForceState.audio;
  const videoForceActive =
    (!isAdmin && hostControls.videoForceAll) || localForceState.video;

  const {
    handleToggleAudio,
    handleToggleVideo,
    handleToggleRaiseHand,
    handleDeviceSelect,
    handleShowAudioDialog,
    handleShowVideoDialog,
  } = useCallMedia({
    localStream,
    localVideoElement,
    localVideoRef,
    isAudioMuted,
    isVideoMuted,
    selectedDevices,
    deviceStatus,
    permissionErrors,
    audioForceActive,
    videoForceActive,
    setLocalStream,
    setLocalVideoMuted,
    setPermissionError,
    toggleAudio,
    toggleVideo,
    setShowDeviceDialog,
    setDeviceDialogType,
    setRaiseHand,
  });

  const recordingStatusValue = recording.status ?? null;
  const recordingIsRecording =
    recording.active && recordingStatusValue === 'RECORDING';
  const recordingIsStarting = recordingStatusValue === 'STARTING';
  const recordingIsUploading = recordingStatusValue === 'UPLOADING';
  const recordingPending = recordingIsStarting || recordingIsUploading;
  const recordingIndicatorVisible = recordingIsRecording || recordingPending;
  const recordingStatusText = recordingIsRecording
    ? 'Recording'
    : recordingIsUploading
      ? 'Finalising recording'
      : recordingIsStarting
        ? 'Preparing recording'
        : '';

  // Enforce force mute by actually disabling tracks and pausing producers
  useEffect(() => {
    const audioTrack = localStream?.getAudioTracks()[0];
    const audioProducer = webrtcManager.getProducer('audio');

    if (!audioTrack) return;

    if (audioForceActive) {
      // Host has force-muted - actually disable the track and pause producer
      if (audioTrack.enabled) {
        console.log('Enforcing host force mute: disabling audio track');
        audioTrack.enabled = false;
        if (audioProducer) {
          webrtcManager.pauseProducer('audio').catch(err => {
            console.error('Error pausing audio producer on force mute:', err);
          });
        }
        // Update state to reflect muted state if not already muted
        if (!isAudioMuted) {
          setLocalAudioMuted(true);
        }
      }
    } else if (!audioForceActive && !localForceState.audio && isAudioMuted && !audioTrack.enabled) {
      // Force mute released - if user wants audio on, re-enable track and resume producer
      // Note: We don't auto-unmute here, user must manually unmute
      // But if they do unmute, the track should be ready
    }
  }, [audioForceActive, localStream, isAudioMuted, localForceState.audio, setLocalAudioMuted]);

  // Similar for video force mute
  useEffect(() => {
    const videoTrack = localStream?.getVideoTracks()[0];
    const videoProducer = webrtcManager.getProducer('video');

    if (!videoTrack) return;

    if (videoForceActive) {
      // Host has force-muted video - actually disable the track and pause producer
      if (videoTrack.enabled) {
        console.log('Enforcing host force mute: disabling video track');
        videoTrack.enabled = false;
        if (videoProducer) {
          webrtcManager.pauseProducer('video').catch(err => {
            console.error('Error pausing video producer on force mute:', err);
          });
        }
        // Update state to reflect muted state if not already muted
        if (!isVideoMuted) {
          setLocalVideoMuted(true);
        }
      }
    }
  }, [videoForceActive, localStream, isVideoMuted, setLocalVideoMuted]);

  useEffect(() => {
    showChatPanelRef.current = showChatPanel;
  }, [showChatPanel]);


  const handleNetworkSamples = useCallback((samples: Parameters<typeof updateNetworkQuality>[0]) => {
    updateNetworkQuality(samples);
  }, [updateNetworkQuality]);

  const resolveProducerMetaForNetwork = useCallback(
    (producerId: string) => {
      return resolveProducerMeta(producerId, producerMetadataRef);
    },
    []
  );

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
          resolveProducerMeta: resolveProducerMetaForNetwork,
          onSamples: handleNetworkSamples,
        });
      }

    networkMonitorRef.current.start();

    return () => {
      networkMonitorRef.current?.stop();
      networkMonitorRef.current = null;
    };
  }, [isConnected, user?.id, resolveProducerMetaForNetwork, handleNetworkSamples, clearNetworkQuality]);

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

  const {
    handleStartScreenShare,
    handleStopScreenShare,
    handlePinScreenShare,
    cleanupScreenShare,
  } = useCallScreenShare({
    isScreenSharing,
    setScreenShareStreams,
    setIsScreenSharing,
    addScreenShare,
    removeScreenShare,
    setPinnedScreenShare,
    pinnedScreenShareUserId,
    screenShareProducersRef,
    producerMetadataRef,
    activeScreenShareProducersRef,
    isStoppingScreenShareRef,
  });

  useEffect(() => {
    // Wait for auth check to complete
    if (!hasCheckedAuth) {
      return; // Wait for auth check
    }

    if (!preJoinCompleted) {
      return;
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

      // Cleanup active speaker detector
      if (activeSpeakerDetectorRef.current) {
        activeSpeakerDetectorRef.current.cleanup();
        activeSpeakerDetectorRef.current = null;
      }

      // Reset local speaking state on unmount
      setLocalIsSpeaking(false);

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
  }, [roomCode, user, token, hasCheckedAuth, preJoinCompleted]);

  useEffect(() => {
    const videoEl = localVideoElement;

    if (!videoEl) {
      return;
    }

    if (!localStream) {
      if (videoEl.srcObject) {
        videoEl.srcObject = null;
      }
      return;
    }

    if (videoEl.srcObject !== localStream) {
      videoEl.srcObject = localStream;
    }

    const attemptPlay = () => {
      videoEl
        .play()
        .catch(error => {
          console.warn('Unable to autoplay local preview video:', error);
        });
    };

    if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      attemptPlay();
    } else {
      videoEl.addEventListener('loadeddata', attemptPlay, { once: true });
    }

    return () => {
      videoEl.removeEventListener('loadeddata', attemptPlay);
    };
  }, [localStream, localVideoElement]);

  useEffect(() => {
    // Update remote video AND audio elements when streams are added or changed
    remoteStreams.forEach((stream, userId) => {
      // Handle VIDEO element
      const videoEl = remoteVideoRefs.current.get(userId);
      if (videoEl) {
        // Only update if stream changed OR if current srcObject has ended tracks
        const currentSrcObject = videoEl.srcObject as MediaStream | null;
        const shouldUpdate =
          !currentSrcObject ||
          currentSrcObject !== stream ||
          (currentSrcObject.getVideoTracks().length > 0 &&
            currentSrcObject.getVideoTracks()[0]?.readyState === 'ended');

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

      // Handle AUDIO element (CRITICAL for audio playback)
      const audioEl = remoteAudioRefs.current.get(userId);
      if (audioEl) {
        const currentAudioSrc = audioEl.srcObject as MediaStream | null;
        const shouldUpdateAudio =
          !currentAudioSrc ||
          currentAudioSrc !== stream ||
          (currentAudioSrc.getAudioTracks().length > 0 &&
            currentAudioSrc.getAudioTracks()[0]?.readyState === 'ended');

        if (shouldUpdateAudio) {
          console.log('🔊 Updating audio element for user:', userId, {
            hasAudio: stream.getAudioTracks().length > 0,
            audioState: stream.getAudioTracks()[0]?.readyState,
            audioEnabled: stream.getAudioTracks()[0]?.enabled,
            audioMuted: stream.getAudioTracks()[0]?.muted,
          });

          audioEl.srcObject = stream;
          audioEl.volume = 1.0; // Ensure volume is at maximum

          // Try to play audio
          if (audioEl.paused) {
            audioEl.play().catch(err => {
              // Autoplay might be blocked by browser policy
              if (err.name === 'NotAllowedError') {
                console.warn('⚠️ Audio autoplay blocked for user:', userId, '- waiting for user interaction');
                // Will be retried after user interaction (see separate handler)
              } else {
                console.error('Error playing audio for user:', userId, err);
              }
            });
          }
        }
      }
    });
  }, [remoteStreams]);

  // Handle browser autoplay policy - retry audio playback after user interaction
  useEffect(() => {
    const handleUserInteraction = () => {
      if (hasEnabledAudioPlayback.current) {
        return; // Already handled
      }

      console.log('🎵 User interaction detected - enabling audio playback');
      hasEnabledAudioPlayback.current = true;

      // Try to play all paused audio elements
      remoteAudioRefs.current.forEach((audioEl, userId) => {
        if (audioEl.paused && audioEl.srcObject) {
          audioEl.play()
            .then(() => {
              console.log('✅ Audio playback enabled for user:', userId);
            })
            .catch(err => {
              console.error('Failed to enable audio for user:', userId, err);
            });
        }
      });
    };

    // Listen for user interactions (click, keypress, touchstart)
    window.addEventListener('click', handleUserInteraction, { once: true });
    window.addEventListener('keypress', handleUserInteraction, { once: true });
    window.addEventListener('touchstart', handleUserInteraction, { once: true });

    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keypress', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };
  }, []);

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

        // Clear audio refs
        remoteAudioRefs.current.forEach((audioEl) => {
          if (audioEl) audioEl.srcObject = null;
        });
        remoteAudioRefs.current.clear();

        // Try to leave room via socket (may not complete due to browser limits)
        socketManager.leaveRoom().catch(() => { });
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

  // Handle permanent disconnect - cleanup and navigate home
  const handlePermanentDisconnect = useCallback((reason: string) => {
    console.log('Permanent disconnect, cleaning up frontend resources...', reason);
    
    // Reset all reconnection guards
    isReconnectingRef.current = false;
    isDisconnectHandledRef.current = false;
    preservedLocalStreamRef.current = null;
    
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

      // Clear audio refs
      remoteAudioRefs.current.forEach((audioEl) => {
        if (audioEl) audioEl.srcObject = null;
      });
      remoteAudioRefs.current.clear();

      // Reset state
      resetCallState();
      clearPreservedState();
      setLocalIsSpeaking(false);

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
  }, [remoteStreams, screenShareStreams, resetCallState, clearPreservedState, navigate]);

  // Handle reconnection state changes
  useEffect(() => {
    const unsubscribe = reconnectionManager.onStateChange((state) => {
      setReconnectionState(state);
    });

    return unsubscribe;
  }, [setReconnectionState]);

  // Handle socket disconnect event - attempt reconnection instead of immediate cleanup
  useEffect(() => {
    const handleDisconnect = (reason?: string) => {
      console.log('Socket disconnected, attempting reconnection...', reason);
      
      // Guard against multiple disconnect events (race condition prevention)
      if (isDisconnectHandledRef.current) {
        console.log('Disconnect already being handled, skipping duplicate event');
        return;
      }
      
      // Mark as handled to prevent race conditions
      isDisconnectHandledRef.current = true;
      
      // Preserve localStream reference (MediaStream can't be serialized in state)
      if (localStream) {
        preservedLocalStreamRef.current = localStream;
      }
      
      // Preserve state before attempting reconnection
      // Only preserve if not already preserved (prevents overwriting)
      const currentState = useCallStore.getState();
      if (!currentState.preservedState) {
        preserveState();
      }
      
      // ReconnectionManager will handle the reconnection logic
      // We just need to wait for it to either succeed or fail
      
      // Reset disconnect guard after grace period or on reconnect
      // This allows handling new disconnects after recovery
      setTimeout(() => {
        if (!isReconnectingRef.current) {
          isDisconnectHandledRef.current = false;
        }
      }, 5000); // Reset after 5 seconds if not reconnecting
    };

    const handleReconnected = async () => {
      console.log('Socket reconnected, restoring call state...');
      
      // Guard against concurrent reconnection attempts (race condition prevention)
      if (isReconnectingRef.current) {
        console.warn('Reconnection already in progress, skipping duplicate reconnection');
        return;
      }
      
      isReconnectingRef.current = true;
      isDisconnectHandledRef.current = false; // Reset disconnect guard
      
      try {
        // Restore preserved state (merges with current state, doesn't overwrite)
        restoreState();
        
        // Restore localStream from ref if available
        if (preservedLocalStreamRef.current && !localStream) {
          setLocalStream(preservedLocalStreamRef.current);
        }
        
        // Rejoin the room if we have a roomCode
        if (roomCode && user) {
          const currentToken = token || storage.getToken();
          if (currentToken) {
            // Rejoin room
            const response = await socketManager.joinRoom({
              roomCode,
              name: user.name,
              email: user.email,
              picture: user.picture ?? undefined,
            });

            if (response && response.success) {
              // Check if room was ended during reconnection
              if (response.roomEnded) {
                handlePermanentDisconnect('Room ended during reconnection');
                return;
              }

              // CRITICAL FIX: Initialize device with rtpCapabilities BEFORE consuming producers
              if (response.rtpCapabilities) {
                await webrtcManager.initialize(response.rtpCapabilities);
                console.log('Device initialized with rtpCapabilities after reconnection');
              } else {
                console.warn('No rtpCapabilities in joinRoom response, device may not be initialized');
              }

              // Restore WebRTC transports if needed
              try {
                const needsRecovery = webrtcManager.needsRecovery();
                if (needsRecovery) {
                  console.log('Recovering WebRTC transports...');
                  await webrtcManager.recoverTransports();
                  console.log('WebRTC transports recovered');
                } else {
                  console.log('WebRTC transports do not need recovery');
                }

                // Re-establish producers if we have local tracks
                if (localStream) {
                  const audioTrack = localStream.getAudioTracks()[0];
                  const videoTrack = localStream.getVideoTracks()[0];

                  if (audioTrack && audioTrack.readyState === 'live') {
                    try {
                      await webrtcManager.produceAudio(audioTrack);
                      console.log('Restored audio producer after reconnection');
                    } catch (error) {
                      console.error('Error restoring audio producer:', error);
                    }
                  }

                  if (videoTrack && videoTrack.readyState === 'live') {
                    try {
                      await webrtcManager.produceVideo(videoTrack);
                      console.log('Restored video producer after reconnection');
                    } catch (error) {
                      console.error('Error restoring video producer:', error);
                    }
                  }
                }

                // Restore screen share producer if user was screen sharing
                if (isScreenSharing) {
                  try {
                    const screenShareStream = mediaManager.getScreenShareStream();
                    if (screenShareStream) {
                      const screenTrack = screenShareStream.getVideoTracks()[0];
                      if (screenTrack && screenTrack.readyState === 'live') {
                        const producer = await webrtcManager.produceScreenShare(screenTrack);
                        if (producer && user?.id) {
                          // Notify backend of screen share restoration
                          await socketManager.startScreenShare(producer.id);
                          console.log('Restored screen share producer after reconnection');
                        }
                      } else {
                        console.warn('Screen share track not available or ended, clearing screen share state');
                        setIsScreenSharing(false);
                      }
                    } else {
                      console.warn('Screen share stream not available after reconnection, clearing screen share state');
                      setIsScreenSharing(false);
                    }
                  } catch (error) {
                    console.error('Error restoring screen share producer:', error);
                    // Clear screen share state on error
                    setIsScreenSharing(false);
                  }
                }

                // Re-consume remote producers from the response
                if (response.otherProducers && Array.isArray(response.otherProducers)) {
                  for (const producerInfo of response.otherProducers) {
                    try {
                      const producerId = typeof producerInfo === 'string' ? producerInfo : producerInfo.producerId;
                      const userIdFromInfo = typeof producerInfo === 'object' ? producerInfo.userId : undefined;
                      const kindFromInfo = typeof producerInfo === 'object' ? producerInfo.kind : undefined;
                      const sourceFromInfo = typeof producerInfo === 'object' 
                        ? producerInfo.source || (producerInfo.kind === 'audio' ? 'microphone' : 'camera')
                        : undefined;

                      // Store metadata
                      producerMetadataRef.current.set(producerId, {
                        userId: userIdFromInfo,
                        kind: kindFromInfo,
                        source: sourceFromInfo,
                      });

                      // Handle screen share producers separately
                      if (sourceFromInfo === 'screen' && userIdFromInfo) {
                        screenShareProducersRef.current.set(userIdFromInfo, producerId);
                        await consumeScreenShareProducer(producerId, userIdFromInfo);
                        
                        // Ensure screen share metadata is reflected in state
                        const shareName = typeof producerInfo === 'object' 
                          ? producerInfo.name 
                          : participants.find(p => p.userId === userIdFromInfo)?.name;
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

                      // Handle regular audio/video producers
                      const track = await webrtcManager.consumeProducer(producerId);
                      if (track) {
                        // Add to remote streams (this will be handled by existing consumer logic)
                        console.log(`Restored consumer for producer ${producerId}`);
                      }
                    } catch (error) {
                      console.error(`Error consuming producer ${producerInfo}:`, error);
                    }
                  }
                }
              } catch (error) {
                console.error('Error during WebRTC recovery:', error);
                // WebRTC recovery is critical - if it fails, we need to reinitialize
                // Try to continue with existing transports, but log the error
                const errorMessage = error instanceof Error ? error.message : String(error);
                if (errorMessage.includes('transport') || errorMessage.includes('connection')) {
                  console.warn('WebRTC transport recovery failed, attempting full reconnection...');
                  // Don't throw - let it continue and see if existing transports work
                  // If they don't, the next operation will fail and trigger permanent disconnect
                }
              }

              console.log('Successfully rejoined room after reconnection');
              setIsConnected(true);
              
              // Clear preserved stream ref after successful reconnection
              preservedLocalStreamRef.current = null;
            } else {
              // Room join failed, treat as permanent disconnect
              handlePermanentDisconnect('Failed to rejoin room after reconnection');
            }
          } else {
            handlePermanentDisconnect('Authentication token not available');
          }
        }
      } catch (error) {
        console.error('Error during reconnection recovery:', error);
        handlePermanentDisconnect('Failed to restore connection');
      } finally {
        // Always reset reconnection guard
        isReconnectingRef.current = false;
        isDisconnectHandledRef.current = false;
      }
    };

    const handleReconnectFailed = () => {
      console.log('Reconnection failed, cleaning up...');
      // Reset guards
      isReconnectingRef.current = false;
      isDisconnectHandledRef.current = false;
      preservedLocalStreamRef.current = null;
      handlePermanentDisconnect('Connection lost');
    };

    socketManager.on('disconnect', handleDisconnect);
    const unsubscribeReconnected = socketManager.onReconnected(handleReconnected);
    const unsubscribeReconnectFailed = socketManager.onReconnectFailed(handleReconnectFailed);

    return () => {
      socketManager.off('disconnect', handleDisconnect);
      unsubscribeReconnected();
      unsubscribeReconnectFailed();
    };
  }, [roomCode, user, token, localStream, preserveState, restoreState, setIsConnected, handlePermanentDisconnect]);

  const connectToRoom = async () => {
    if (!roomCode || !user || !preJoinCompleted) return;

    hasHandledRoomEndedRef.current = false;
    isEndingMeetingRef.current = false;
    setIsEndingMeeting(false);

    resetRecordingState();

    let effectiveAudioMuted = isAudioMuted;
    let effectiveVideoMuted = isVideoMuted;
    let selfAudioForceMuted = false;
    let selfVideoForceMuted = false;
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
        picture: user.picture ?? undefined,
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
      setRecordingState(normalizeRecordingState(response.recording as RecordingStateEventPayload | null));
      const selfRosterEntry = rosterEntries.find((participant) => participant?.userId === user.id);

      if (selfRosterEntry) {
        selfAudioForceMuted = selfRosterEntry.isAudioForceMuted ?? false;
        selfVideoForceMuted = selfRosterEntry.isVideoForceMuted ?? false;
        if (typeof selfRosterEntry.isAudioMuted === 'boolean') {
          effectiveAudioMuted = selfRosterEntry.isAudioMuted;
          setLocalAudioMuted(selfRosterEntry.isAudioMuted);
        }
        if (typeof selfRosterEntry.isVideoMuted === 'boolean') {
          effectiveVideoMuted = selfRosterEntry.isVideoMuted;
          setLocalVideoMuted(selfRosterEntry.isVideoMuted);
        }
        setLocalForceState(prev => ({
          audio: selfRosterEntry.isAudioForceMuted ?? prev.audio,
          video: selfRosterEntry.isVideoForceMuted ?? prev.video,
          audioReason: selfRosterEntry.isAudioForceMuted
            ? selfRosterEntry.forceMuteReason ?? null
            : null,
          videoReason: selfRosterEntry.isVideoForceMuted
            ? selfRosterEntry.forceMuteReason ?? null
            : null,
        }));
      }

      // Initialize Mediasoup device
      await webrtcManager.initialize(response.rtpCapabilities);

      // Sync audio processing preferences to MediaManager
      if (settings.audioProcessing) {
        mediaManager.setAudioProcessingPreferences(settings.audioProcessing);
      }

      // Stop any existing media from PreJoin page (may have stopped tracks)
      mediaManager.stopLocalMedia();

      // Get fresh local media - always get new tracks (don't reuse stopped tracks from PreJoin)
      clearPermissionErrors();
      const audioPreferenceEnabled = settings.joinWithAudio && !selfAudioForceMuted;
      const videoPreferenceEnabled = settings.joinWithVideo && !selfVideoForceMuted;
      const pendingMuteUpdates: { audio?: boolean; video?: boolean } = {};
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

          if (stream) {
            const activeStream = stream;
            // Sync audio mute state based on user's preference and server state
            const desiredAudioMuted = !audioPreferenceEnabled;
            if (effectiveAudioMuted !== desiredAudioMuted) {
              effectiveAudioMuted = desiredAudioMuted;
              pendingMuteUpdates.audio = desiredAudioMuted;
              setLocalAudioMuted(desiredAudioMuted);
            }

            // Sync video mute state based on user's preference and server state
            const desiredVideoMuted = !videoPreferenceEnabled;
            if (effectiveVideoMuted !== desiredVideoMuted) {
              effectiveVideoMuted = desiredVideoMuted;
              pendingMuteUpdates.video = desiredVideoMuted;
              setLocalVideoMuted(desiredVideoMuted);
            }

            const shouldEnableAudioTrack = audioPreferenceEnabled && !effectiveAudioMuted;
            const existingAudioTracks = [...activeStream.getAudioTracks()];
            existingAudioTracks.forEach(track => {
              track.enabled = shouldEnableAudioTrack;
              if (!shouldEnableAudioTrack) {
                track.stop();
                activeStream.removeTrack(track);
              }
            });

            if (shouldEnableAudioTrack) {
              const activeAudioTracks = activeStream
                .getAudioTracks()
                .filter(track => track.readyState === 'live');
              if (activeAudioTracks.length === 0) {
                try {
                  const newAudioTrack = await mediaManager.getSingleTrack('audio', selectedDevices.audioInput);
                  if (newAudioTrack) {
                    newAudioTrack.enabled = true;
                    activeStream.addTrack(newAudioTrack);
                  }
                } catch (trackError) {
                  console.error('Failed to acquire audio track during join:', trackError);
                }
              }
            }

            const shouldEnableVideoTrack = videoPreferenceEnabled && !effectiveVideoMuted;
            const existingVideoTracks = [...activeStream.getVideoTracks()];
            existingVideoTracks.forEach(track => {
              track.enabled = shouldEnableVideoTrack;
              if (!shouldEnableVideoTrack) {
                track.stop();
                activeStream.removeTrack(track);
              }
            });

            if (shouldEnableVideoTrack) {
              const activeVideoTracks = activeStream
                .getVideoTracks()
                .filter(track => track.readyState === 'live');
              if (activeVideoTracks.length === 0) {
                try {
                  const newVideoTrack = await mediaManager.getSingleTrack('video', selectedDevices.videoInput);
                  if (newVideoTrack) {
                    newVideoTrack.enabled = true;
                    activeStream.addTrack(newVideoTrack);
                  }
                } catch (trackError) {
                  console.error('Failed to acquire video track during join:', trackError);
                }
              }
            }
          }

          setLocalStream(stream ? new MediaStream(stream.getTracks()) : null);
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
            // Initialize detector if not already initialized
            if (!activeSpeakerDetectorRef.current) {
              activeSpeakerDetectorRef.current = new ActiveSpeakerDetector(config.features.voiceIndicator);
            }

            const audioProducer = await webrtcManager.produceAudio(audioTrack);

            // Start monitoring local audio for active speaker detection
            if (audioProducer && user?.id && activeSpeakerDetectorRef.current) {
              activeSpeakerDetectorRef.current.startMonitoringLocal(
                audioTrack,
                user.id,
                (isActive) => {
                  // Update LOCAL speaking state immediately and independently
                  setLocalIsSpeaking(isActive);

                  // Emit to other participants
                  socketManager.emitActiveSpeaker(isActive);

                  // Update global activeSpeaker for others to see (but don't rely on it for local UI)
                  if (isActive) {
                    setActiveSpeaker(user.id);
                  } else {
                    const { activeSpeakerId } = useCallStore.getState();
                    if (activeSpeakerId === user.id) {
                      setActiveSpeaker(null);
                    }
                  }
                },
                audioProducer
              );
            }
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
                      setLocalStream(new MediaStream(stream.getTracks()));
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

      if (pendingMuteUpdates.audio !== undefined || pendingMuteUpdates.video !== undefined) {
        const socket = (socketManager as any).socket;
        const localUserId = user?.id || '';
        if (socket && localUserId) {
          if (pendingMuteUpdates.audio !== undefined) {
            socket.emit('audio-mute', {
              isAudioMuted: pendingMuteUpdates.audio,
              uid: localUserId,
            });
          }
          if (pendingMuteUpdates.video !== undefined) {
            socket.emit('video-mute', {
              isVideoMuted: pendingMuteUpdates.video,
              uid: localUserId,
            });
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
          role: (participantInfo.role as ParticipantRole) ?? 'PARTICIPANT',
          isAdmin: participantInfo.isAdmin ?? undefined,
          isAudioMuted: participantInfo.isAudioMuted ?? undefined,
          isVideoMuted: participantInfo.isVideoMuted ?? undefined,
          isAudioForceMuted: participantInfo.isAudioForceMuted ?? undefined,
          isVideoForceMuted: participantInfo.isVideoForceMuted ?? undefined,
          audioForceMutedAt: participantInfo.audioForceMutedAt ?? undefined,
          videoForceMutedAt: participantInfo.videoForceMutedAt ?? undefined,
          audioForceMutedBy: participantInfo.audioForceMutedBy ?? undefined,
          videoForceMutedBy: participantInfo.videoForceMutedBy ?? undefined,
          forceMuteReason: participantInfo.forceMuteReason ?? undefined,
          isSpeaking: participantInfo.isSpeaking ?? undefined,
          hasRaisedHand: participantInfo.hasRaisedHand ?? undefined,
        });
        flushPendingParticipantEventsWrapper(participantInfo.userId);
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
            role: (participantInfo.role as ParticipantRole) ?? 'PARTICIPANT',
            isAdmin: participantInfo.isAdmin ?? false,
            isAudioMuted: true,
            isVideoMuted: true,
            isAudioForceMuted: (participantInfo as any).isAudioForceMuted ?? false,
            isVideoForceMuted: (participantInfo as any).isVideoForceMuted ?? false,
            audioForceMutedAt: (participantInfo as any).audioForceMutedAt ?? null,
            videoForceMutedAt: (participantInfo as any).videoForceMutedAt ?? null,
            audioForceMutedBy: (participantInfo as any).audioForceMutedBy ?? null,
            videoForceMutedBy: (participantInfo as any).videoForceMutedBy ?? null,
            forceMuteReason: (participantInfo as any).forceMuteReason ?? null,
            isSpeaking: false,
            hasRaisedHand: participantInfo.hasRaisedHand ?? false,
          });
          flushPendingParticipantEventsWrapper(participantInfo.userId);
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
      let userRole: ParticipantRole = 'PARTICIPANT';
      let userIsHost = false;
      if (response?.isAdmin !== undefined) {
        userIsAdmin = response.isAdmin;
        userIsHost = response.isHost ?? (typeof response.role === 'string' && response.role === 'HOST');
        if (typeof response.role === 'string') {
          const normalizedRole = response.role.toUpperCase() as ParticipantRole;
          if (normalizedRole === 'HOST' || normalizedRole === 'COHOST' || normalizedRole === 'PARTICIPANT') {
            userRole = normalizedRole;
          }
        }
        if (userRole === 'PARTICIPANT' && userIsHost) {
          userRole = 'HOST';
        } else if (userRole === 'PARTICIPANT' && userIsAdmin) {
          userRole = 'COHOST';
        }
        setIsAdmin(userIsAdmin);
        setIsHost(userIsHost);
        setParticipantRole(userRole);
        if (response?.isPublic !== undefined) {
          setRoomIsPublic(response.isPublic);
        }
        if (response?.hostControls) {
          setHostControls({
            locked: response.hostControls.locked ?? false,
            lockedBy: response.hostControls.lockedBy ?? null,
            lockedReason: response.hostControls.lockedReason ?? null,
            audioForceAll: response.hostControls.audioForceAll ?? false,
            audioForcedBy: response.hostControls.audioForcedBy ?? null,
            audioForceReason: response.hostControls.audioForceReason ?? null,
            videoForceAll: response.hostControls.videoForceAll ?? false,
            videoForcedBy: response.hostControls.videoForcedBy ?? null,
            videoForceReason: response.hostControls.videoForceReason ?? null,
            updatedAt: response.hostControls.updatedAt ?? new Date().toISOString(),
          });
        }
      } else {
        // Fallback: check via API if response doesn't include admin status
        try {
          const roomInfoResponse = await api.get(`/api/rooms/${roomCode}`);
          if (roomInfoResponse.data.success && roomInfoResponse.data.data) {
            const room = roomInfoResponse.data.data;
            userIsAdmin = room.admin?.id === user.id || room.adminId === user.id;
            userIsHost = userIsAdmin;
            userRole = userIsAdmin ? 'HOST' : 'PARTICIPANT';
            setIsAdmin(userIsAdmin);
            setIsHost(userIsHost);
            setParticipantRole(userRole);
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
      resetRecordingState();
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
        role: (participant.role as ParticipantRole) ?? 'PARTICIPANT',
        isAdmin: participant.isAdmin ?? undefined,
        isAudioMuted: participant.isAudioMuted ?? undefined,
        isVideoMuted: participant.isVideoMuted ?? undefined,
        isAudioForceMuted: participant.isAudioForceMuted ?? undefined,
        isVideoForceMuted: participant.isVideoForceMuted ?? undefined,
        audioForceMutedAt: participant.audioForceMutedAt ?? undefined,
        videoForceMutedAt: participant.videoForceMutedAt ?? undefined,
        audioForceMutedBy: participant.audioForceMutedBy ?? undefined,
        videoForceMutedBy: participant.videoForceMutedBy ?? undefined,
        forceMuteReason: participant.forceMuteReason ?? undefined,
        isSpeaking: participant.isSpeaking ?? undefined,
        hasRaisedHand: participant.hasRaisedHand ?? undefined,
      });
      flushPendingParticipantEventsWrapper(participant.userId);
    };
    socketManager.on('user-joined', handleUserJoined);
    eventListenersRef.current['user-joined'] = handleUserJoined;

    // User left
    const handleUserLeft = (data: any) => {
      console.log('User left:', data);
      if (data?.userId) {
        pendingParticipantEventsRef.current.delete(data.userId);
      }

      // Stop active speaker detection for this user
      if (activeSpeakerDetectorRef.current && data?.userId) {
        activeSpeakerDetectorRef.current.stopMonitoring(data.userId);
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
        return; // Screen share cleanup handles its own stream removal
      }

      const userIdForProducer = metadata?.userId || data.userId;
      const kindForProducer = metadata?.kind || data.kind;

      // IMPORTANT FIX: Don't remove camera video if user has active screen share
      // Camera video and screen share should coexist
      if (kindForProducer === 'video' && userIdForProducer) {
        const hasActiveScreenShare = screenShareProducersRef.current.has(userIdForProducer);
        if (hasActiveScreenShare) {
          // Don't remove camera video track when screen sharing is active
          // Just clean up the metadata but keep the stream
          producerMetadataRef.current.delete(data.producerId);
          webrtcManager.closeConsumerByProducerId(data.producerId);
          return;
        }
      }

      producerMetadataRef.current.delete(data.producerId);
      webrtcManager.closeConsumerByProducerId(data.producerId);

      if (userIdForProducer && (kindForProducer === 'audio' || kindForProducer === 'video')) {
        runOrQueueParticipantUpdateWrapper(userIdForProducer, () => {
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
          currentUserId: user?.id ?? undefined,
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
    const handleAudioMute = (data: {
      userId: string;
      isAudioMuted: boolean;
      forced?: boolean;
      forcedBy?: string | null;
      reason?: string | null;
      timestamp?: number;
    }) => {
      runOrQueueParticipantUpdateWrapper(data.userId, () => {
        const timestampIso =
          typeof data.timestamp === 'number'
            ? new Date(data.timestamp).toISOString()
            : new Date().toISOString();
        updateParticipant(data.userId, {
          isAudioMuted: data.isAudioMuted,
          isAudioForceMuted: Boolean(data.forced),
          audioForceMutedBy: data.forced ? data.forcedBy ?? null : null,
          audioForceMutedAt: data.forced ? timestampIso : null,
          forceMuteReason: data.forced ? data.reason ?? null : null,
        });
      });
    };
    socketManager.on('audio-mute', handleAudioMute);
    eventListenersRef.current['audio-mute'] = handleAudioMute;

    // Video mute event
    const handleVideoMute = (data: {
      userId: string;
      isVideoMuted: boolean;
      forced?: boolean;
      forcedBy?: string | null;
      reason?: string | null;
      timestamp?: number;
    }) => {
      runOrQueueParticipantUpdateWrapper(data.userId, () => {
        const timestampIso =
          typeof data.timestamp === 'number'
            ? new Date(data.timestamp).toISOString()
            : new Date().toISOString();
        updateParticipant(data.userId, {
          isVideoMuted: data.isVideoMuted,
          isVideoForceMuted: Boolean(data.forced),
          videoForceMutedBy: data.forced ? data.forcedBy ?? null : null,
          videoForceMutedAt: data.forced ? timestampIso : null,
          forceMuteReason: data.forced ? data.reason ?? null : null,
        });
      });
    };
    socketManager.on('video-mute', handleVideoMute);
    eventListenersRef.current['video-mute'] = handleVideoMute;

    const handleHostParticipantState = (payload: {
      userId: string;
      audio?: {
        muted?: boolean;
        forced: boolean;
        reason?: string | null;
        forcedBy?: string | null;
        timestamp?: number | string | null;
      };
      video?: {
        muted?: boolean;
        forced: boolean;
        reason?: string | null;
        forcedBy?: string | null;
        timestamp?: number | string | null;
      };
      reason?: string | null;
      actorUserId?: string | null;
      timestamp?: number | string | null;
    }) => {
      const isoTimestamp =
        typeof payload.timestamp === 'number'
          ? new Date(payload.timestamp).toISOString()
          : typeof payload.timestamp === 'string'
            ? payload.timestamp
            : new Date().toISOString();

      applyParticipantForceState(payload.userId, {
        audio: payload.audio
          ? {
            muted: payload.audio.muted ?? undefined,
            forced: payload.audio.forced,
            reason: payload.audio.forced
              ? payload.audio.reason ?? payload.reason ?? undefined
              : undefined,
            forcedBy: payload.audio.forced
              ? payload.audio.forcedBy ?? payload.actorUserId ?? undefined
              : undefined,
            timestamp:
              payload.audio.timestamp !== undefined && payload.audio.timestamp !== null
                ? typeof payload.audio.timestamp === 'number'
                  ? new Date(payload.audio.timestamp).toISOString()
                  : payload.audio.timestamp
                : isoTimestamp,
          }
          : undefined,
        video: payload.video
          ? {
            muted: payload.video.muted ?? undefined,
            forced: payload.video.forced,
            reason: payload.video.forced
              ? payload.video.reason ?? payload.reason ?? undefined
              : undefined,
            forcedBy: payload.video.forced
              ? payload.video.forcedBy ?? payload.actorUserId ?? undefined
              : undefined,
            timestamp:
              payload.video.timestamp !== undefined && payload.video.timestamp !== null
                ? typeof payload.video.timestamp === 'number'
                  ? new Date(payload.video.timestamp).toISOString()
                  : payload.video.timestamp
                : isoTimestamp,
          }
          : undefined,
      });

      if (payload.userId === user?.id) {
        if (payload.audio && typeof payload.audio.muted === 'boolean') {
          setLocalAudioMuted(payload.audio.muted);
        }
        if (payload.video && typeof payload.video.muted === 'boolean') {
          setLocalVideoMuted(payload.video.muted);
        }
        setLocalForceState(prev => ({
          audio:
            payload.audio?.forced !== undefined ? payload.audio.forced : prev.audio,
          video:
            payload.video?.forced !== undefined ? payload.video.forced : prev.video,
          audioReason:
            payload.audio?.forced !== undefined
              ? payload.audio.forced
                ? payload.audio.reason ?? payload.reason ?? null
                : null
              : prev.audioReason,
          videoReason:
            payload.video?.forced !== undefined
              ? payload.video.forced
                ? payload.video.reason ?? payload.reason ?? null
                : null
              : prev.videoReason,
        }));
        if (payload.audio?.forced) {
          toast.error('The host muted your microphone.');
        } else if (payload.audio && !payload.audio.forced && payload.audio.muted === false) {
          toast.success('The host unmuted your microphone.');
        }

        if (payload.video?.forced) {
          toast.error('The host disabled your camera.');
        } else if (payload.video && !payload.video.forced && payload.video.muted === false) {
          toast.success('The host enabled your camera.');
        }
      }
    };
    socketManager.on('host-control:participant-state', handleHostParticipantState);
    eventListenersRef.current['host-control:participant-state'] = handleHostParticipantState;

    const handleHostRoomState = (payload: {
      locked?: boolean;
      lockedBy?: string | null;
      lockedReason?: string | null;
      audioForceAll?: boolean;
      audioForcedBy?: string | null;
      audioForceReason?: string | null;
      videoForceAll?: boolean;
      videoForcedBy?: string | null;
      videoForceReason?: string | null;
      chatForceAll?: boolean;
      chatForcedBy?: string | null;
      chatForceReason?: string | null;
      updatedAt?: string;
    }) => {
      const previous = previousHostControlsRef.current;
      const nextChatForceAll = payload.chatForceAll ?? previous.chatForceAll ?? false;
      setHostControls({
        locked: payload.locked ?? previous.locked ?? false,
        lockedBy: payload.lockedBy ?? null,
        lockedReason: payload.lockedReason ?? null,
        audioForceAll: payload.audioForceAll ?? previous.audioForceAll ?? false,
        audioForcedBy: payload.audioForcedBy ?? null,
        audioForceReason: payload.audioForceReason ?? null,
        videoForceAll: payload.videoForceAll ?? previous.videoForceAll ?? false,
        videoForcedBy: payload.videoForcedBy ?? null,
        videoForceReason: payload.videoForceReason ?? null,
        chatForceAll: nextChatForceAll,
        chatForcedBy: payload.chatForcedBy ?? (nextChatForceAll ? previous.chatForcedBy ?? null : null),
        chatForceReason: nextChatForceAll
          ? payload.chatForceReason ?? previous.chatForceReason ?? null
          : null,
        updatedAt: payload.updatedAt ?? new Date().toISOString(),
      });

      if (!previous.locked && payload.locked) {
        toast.error('The host locked the room.');
      } else if (previous.locked && payload.locked === false) {
        toast.success('The host unlocked the room.');
      }

      if (!previous.audioForceAll && payload.audioForceAll) {
        toast.error('The host muted everyone\'s microphones.');
      } else if (previous.audioForceAll && payload.audioForceAll === false) {
        toast.success('The host unmuted microphones.');
      }

      if (!previous.videoForceAll && payload.videoForceAll) {
        toast.error('The host disabled all cameras.');
      } else if (previous.videoForceAll && payload.videoForceAll === false) {
        toast.success('The host enabled cameras.');
      }
    };
    socketManager.on('host-control:room-state', handleHostRoomState);
    eventListenersRef.current['host-control:room-state'] = handleHostRoomState;

    const handleHostChatState = (payload: {
      chatForceAll: boolean;
      chatForcedBy?: string | null;
      chatForceReason?: string | null;
      actorUserId?: string | null;
      timestamp?: number;
    }) => {
      const previous = previousHostControlsRef.current;
      const nextForced = Boolean(payload.chatForceAll);
      const timestampIso =
        typeof payload.timestamp === 'number'
          ? new Date(payload.timestamp).toISOString()
          : new Date().toISOString();

      setHostControls({
        chatForceAll: nextForced,
        chatForcedBy: nextForced
          ? payload.chatForcedBy ?? payload.actorUserId ?? null
          : null,
        chatForceReason: nextForced ? payload.chatForceReason ?? null : null,
        updatedAt: timestampIso,
      });

      if (!previous.chatForceAll && nextForced) {
        toast.error(
          payload.chatForceReason && payload.chatForceReason.length > 0
            ? `The host disabled chat: ${payload.chatForceReason}`
            : 'The host disabled chat.'
        );
      } else if (previous.chatForceAll && !nextForced) {
        toast.success('The host re-enabled chat.');
      }
    };
    socketManager.on('host-control:chat-state', handleHostChatState);
    eventListenersRef.current['host-control:chat-state'] = handleHostChatState;

    const handleHostParticipantRemoved = async (payload: {
      userId: string;
      reason?: string | null;
      actorUserId?: string | null;
    }) => {
      if (payload.userId === user?.id) {
        toast.error(payload.reason ?? 'The host removed you from the room.');
        try {
          await leaveRoom({ skipSuccessToast: true });
        } catch (error) {
          console.error('Error during forced leave:', error);
        }
      } else {
        runOrQueueParticipantUpdateWrapper(payload.userId, () => {
          removeParticipant(payload.userId);
        });
        toast(payload.reason ?? 'A participant was removed by the host.', {
          icon: '⚠️',
        });
      }
    };
    socketManager.on('host-control:participant-removed', handleHostParticipantRemoved);
    eventListenersRef.current['host-control:participant-removed'] = handleHostParticipantRemoved;

    const handleRoomEndedEvent = (payload: {
      actorUserId?: string | null;
      reason?: string | null;
      endedAt?: string;
    }) => {
      if (hasHandledRoomEndedRef.current) {
        return;
      }

      hasHandledRoomEndedRef.current = true;
      if (endMeetingFallbackTimerRef.current) {
        clearTimeout(endMeetingFallbackTimerRef.current);
        endMeetingFallbackTimerRef.current = null;
      }
      const endedBySelf = Boolean(payload?.actorUserId && payload.actorUserId === user?.id);
      const triggeredLocally = isEndingMeetingRef.current || endedBySelf;

      if (triggeredLocally) {
        toast.success('Meeting ended for everyone.', { id: END_MEETING_TOAST_ID });
      } else {
        const message =
          payload?.reason && payload.reason.length > 0
            ? payload.reason
            : 'The host ended the meeting for everyone.';
        toast.error(message, { duration: 5000 });
      }

      isEndingMeetingRef.current = false;
      setIsEndingMeeting(false);

      void leaveRoom({
        skipSuccessToast: true,
        skipLoadingToast: triggeredLocally,
      }).catch(error => {
        console.error('Error during room:end cleanup:', error);
      });
    };
    socketManager.on('room:ended', handleRoomEndedEvent);
    eventListenersRef.current['room:ended'] = handleRoomEndedEvent;

    const handleHostRoleUpdated = (payload: {
      userId?: string;
      role?: string;
      isModerator?: boolean;
      updatedBy?: string;
      updatedAt?: string;
    }) => {
      if (!payload?.userId || typeof payload.role !== 'string') {
        return;
      }

      const normalizedRole = payload.role.toUpperCase() as ParticipantRole;
      if (!['HOST', 'COHOST', 'PARTICIPANT'].includes(normalizedRole)) {
        return;
      }

      const isModerator = payload.isModerator ?? normalizedRole !== 'PARTICIPANT';

      runOrQueueParticipantUpdateWrapper(payload.userId, () => {
        updateParticipant(payload.userId!, {
          role: normalizedRole,
          isAdmin: isModerator,
        });
      });

      if (payload.userId === user?.id) {
        setParticipantRole(normalizedRole);
        setIsHost(normalizedRole === 'HOST');
        setIsAdmin(isModerator);

        if (normalizedRole === 'COHOST') {
          toast.success('You are now a co-host.');
        } else if (normalizedRole === 'PARTICIPANT') {
          toast.success('Co-host privileges removed.');
        }
      }
    };
    socketManager.on('host-control:role-updated', handleHostRoleUpdated);
    eventListenersRef.current['host-control:role-updated'] = handleHostRoleUpdated;

    const handleRecordingStateEvent = (payload: RecordingStateEventPayload) => {
      setRecordingState(normalizeRecordingState(payload));
    };
    socketManager.on('recording:state', handleRecordingStateEvent);
    eventListenersRef.current['recording:state'] = handleRecordingStateEvent;

    const handleRecordingErrorEvent = (payload: RecordingErrorEventPayload) => {
      const message =
        typeof payload?.message === 'string' && payload.message.length > 0
          ? payload.message
          : 'Recording encountered an error.';
      toast.error(message);
      setRecordingState({
        active: false,
        status: 'FAILED',
        failureReason: message,
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    };
    socketManager.on('recording:error', handleRecordingErrorEvent);
    eventListenersRef.current['recording:error'] = handleRecordingErrorEvent;

    // Active speaker event
    const handleActiveSpeaker = (data: { userId: string; isActiveSpeaker: boolean }) => {
      if (data.isActiveSpeaker) {
        setActiveSpeaker(data.userId);
        runOrQueueParticipantUpdateWrapper(data.userId, () => {
          updateParticipant(data.userId, { isSpeaking: true });
        });
      } else {
        // Clear active speaker if this user stopped speaking
        const { activeSpeakerId: currentActiveSpeaker } = useCallStore.getState();
        if (currentActiveSpeaker === data.userId) {
          setActiveSpeaker(null);
        }
        runOrQueueParticipantUpdateWrapper(data.userId, () => {
          updateParticipant(data.userId, { isSpeaking: false });
        });
      }
    };
    socketManager.on('active-speaker', handleActiveSpeaker);
    eventListenersRef.current['active-speaker'] = handleActiveSpeaker;

    // Raised hand event
    const handleRaisedHand = (data: { userId: string; isRaised: boolean }) => {
      runOrQueueParticipantUpdateWrapper(data.userId, () => {
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
          picture: data.picture ?? undefined,
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
            picture: req.picture ?? undefined,
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

  // Producer consumption functions are now provided by useCallProducerConsumption hook

  const leaveRoom = async (options?: { skipSuccessToast?: boolean; skipLoadingToast?: boolean }) => {
    // Prevent double execution
    if (isLeavingRef.current) {
      console.log('Leave already in progress, ignoring duplicate call');
      return;
    }
    
    // If reconnecting, cancel reconnection first
    if (isReconnectingRef.current) {
      console.log('Leaving room during reconnection, canceling reconnection...');
      reconnectionManager.cancelReconnection();
      isReconnectingRef.current = false;
      isDisconnectHandledRef.current = false;
      preservedLocalStreamRef.current = null;
    }

    hasHandledRoomEndedRef.current = true;
    isLeavingRef.current = true;
    setIsLeaving(true);

    // Cleanup active speaker detector
    if (activeSpeakerDetectorRef.current) {
      activeSpeakerDetectorRef.current.cleanup();
      activeSpeakerDetectorRef.current = null;
    }

    // Reset local speaking state
    setLocalIsSpeaking(false);

    if (networkMonitorRef.current) {
      networkMonitorRef.current.stop();
      networkMonitorRef.current = null;
    }
    clearNetworkQuality();
    setShowChatPanel(false);
    setLocalForceState({
      audio: false,
      video: false,
      audioReason: null,
      videoReason: null,
    });

    try {
      console.log('Leaving room, starting cleanup...');
      if (!options?.skipLoadingToast) {
        toast.loading('Leaving room...', { id: 'leaving' });
      }

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
      if (options?.skipSuccessToast) {
        toast.dismiss('leaving');
      } else {
        toast.success('Left room successfully', { id: 'leaving' });
      }

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
      // Do not reset isLeaving here to avoid re-triggering pre-join redirects before unmount
    }
  };

  const {
    handleHostMuteAllAudio,
    handleHostUnmuteAllAudio,
    handleHostMuteAllVideo,
    handleHostUnmuteAllVideo,
    handleHostToggleChat,
    handleHostToggleLock,
    handleHostStartRecording: _handleHostStartRecording,
    handleHostStopRecording: _handleHostStopRecording,
    handleHostControlParticipant,
    handleHostRemoveParticipant,
    handlePromoteToCoHost,
    handleDemoteFromCoHost,
    handleHostEndMeeting,
  } = useCallHostControls({ hostControls });

  // Keyboard shortcuts for individual controls (only on Call page, not PreJoin)
  // Ctrl+D: Toggle self microphone mute/unmute
  // Ctrl+F: Toggle self camera mute/unmute
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Only handle shortcuts if not typing in an input field
      if (isInputField) {
        return;
      }

      // Check if Ctrl (Windows/Linux) or Cmd (Mac) is pressed WITHOUT Shift
      const isModifierPressed = (event.ctrlKey || event.metaKey) && !event.shiftKey;

      if (isModifierPressed) {
        switch (event.key.toLowerCase()) {
          case 'd':
            // Ctrl+D: Toggle self microphone mute/unmute
            event.preventDefault();
            event.stopPropagation();
            handleToggleAudio();
            break;
          case 'f':
            // Ctrl+F: Toggle self camera mute/unmute
            event.preventDefault();
            event.stopPropagation();
            handleToggleVideo();
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [handleToggleAudio, handleToggleVideo]);

  // Keyboard shortcuts for host controls (only on Call page, not PreJoin)
  // Ctrl+Shift+D: Mute/unmute all microphones (host only)
  // Ctrl+Shift+F: Disable/enable all cameras (host only)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only allow shortcuts if user is host or admin
      if (!isHost && !isAdmin) {
        return;
      }

      // Check if user is typing in an input field
      const target = event.target as HTMLElement;
      const isInputField =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      // Only handle shortcuts if not typing in an input field
      if (isInputField) {
        return;
      }

      // Check if Ctrl+Shift (Windows/Linux) or Cmd+Shift (Mac) is pressed
      const isModifierPressed = (event.ctrlKey || event.metaKey) && event.shiftKey;

      if (isModifierPressed) {
        switch (event.key.toLowerCase()) {
          case 'd':
            // Ctrl+Shift+D: Toggle mute all microphones
            event.preventDefault();
            event.stopPropagation();
            if (hostControls.audioForceAll) {
              handleHostUnmuteAllAudio();
            } else {
              handleHostMuteAllAudio();
            }
            break;
          case 'f':
            // Ctrl+Shift+F: Toggle disable all cameras
            event.preventDefault();
            event.stopPropagation();
            if (hostControls.videoForceAll) {
              handleHostUnmuteAllVideo();
            } else {
              handleHostMuteAllVideo();
            }
            break;
          default:
            break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isHost, isAdmin, hostControls.audioForceAll, hostControls.videoForceAll, handleHostMuteAllAudio, handleHostUnmuteAllAudio, handleHostMuteAllVideo, handleHostUnmuteAllVideo]);

  const handleEndMeetingForAll = useCallback(async () => {
    if (isEndingMeetingRef.current) {
      return;
    }

    isEndingMeetingRef.current = true;
    setIsEndingMeeting(true);
    toast.loading('Ending meeting for everyone...', { id: END_MEETING_TOAST_ID });

    try {
      await Promise.race([
        handleHostEndMeeting(),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error('Timed out while ending the meeting. Please check your connection and try again.'));
          }, END_MEETING_REQUEST_TIMEOUT_MS);
        }),
      ]);

      if (endMeetingFallbackTimerRef.current) {
        clearTimeout(endMeetingFallbackTimerRef.current);
      }
      endMeetingFallbackTimerRef.current = window.setTimeout(() => {
        endMeetingFallbackTimerRef.current = null;
        if (hasHandledRoomEndedRef.current) {
          return;
        }
        toast.error('Did not receive confirmation that the meeting ended. Cleaning up locally.');
        isEndingMeetingRef.current = false;
        setIsEndingMeeting(false);
        void leaveRoom({ skipSuccessToast: true, skipLoadingToast: true });
      }, END_MEETING_FALLBACK_TIMEOUT_MS);
    } catch (error: any) {
      const message = error?.message ?? 'Failed to end the meeting for everyone.';
      toast.error(message, { id: END_MEETING_TOAST_ID });
      isEndingMeetingRef.current = false;
      setIsEndingMeeting(false);
    }
  }, [handleHostEndMeeting, leaveRoom]);

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


  const remoteParticipantTiles: ParticipantTile[] = participants
    .filter(participant => participant.userId !== user?.id)
    .map(participant => ({
      userId: participant.userId,
      name: participant.name,
      email: participant.email,
      picture: participant.picture ?? null,
      isLocal: false,
      isHost: participant.role === 'HOST',
      isModerator: participant.isAdmin ?? false,
      role: participant.role ?? 'PARTICIPANT',
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
    isHost,
    isModerator: isAdmin,
    role: participantRole,
    stream: localStream ?? null,
    isAudioMuted,
    isVideoMuted,
    // Use independent localIsSpeaking state instead of activeSpeakerId check
    // This prevents remote users from overwriting local speaking state
    isSpeaking: localIsSpeaking,
    hasRaisedHand: user?.id ? raisedHands.has(user.id) : false,
  };

  const canEndMeeting = isHost || participantRole === 'COHOST';

  let allParticipantTiles: ParticipantTile[] = [localTile, ...remoteParticipantTiles];
  // this is for the demo mode
  if (import.meta.env.MODE !== 'production') {
    const targetDemoCount = 0
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
          isModerator: false,
          role: 'PARTICIPANT',
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

  // Use layout hook - calculate maxVisibleTiles first, then slice
  const layout = useCallLayout({
    windowSize,
    isScreenSharing,
    showSplitLayout,
    isSidebarCollapsed,
    participantTilesForDisplay: allParticipantTiles, // Pass all tiles, hook will calculate max
    allParticipantTiles,
    activeSpeakerId,
    pinnedScreenShareUserId,
    setIsSidebarCollapsed,
  });

  // Limit tiles to grid capacity - stop adding after container is filled
  const participantTilesForDisplay = allParticipantTiles.slice(0, layout.maxVisibleTiles);
  const overflowCount = Math.max(0, totalParticipants - layout.maxVisibleTiles);

  // Destructure layout values
  const {
    isSoloLayout,
    nonSplitLayoutConfig,
    splitGridClasses,
    splitGridAutoRowsClass,
    bottomControlsOffset,
    topOffset,
    splitLayoutContainerStyle,
    sharePaneClassName,
    activeSpeakerTile,
    activeSpeakerStream,
    activeSpeakerTileFacingMode,
    activeSpeakerIsProbableScreenShare,
    activeSpeakerHasLiveVideo,
    shouldShowActiveSpeakerOverlay,
    mainLayoutSpacingClass,
  } = layout;

  const renderParticipantTile = (tile: ParticipantTile, index: number) => {
    return (
      <CallParticipantTile
        key={`${tile.userId}-${tile.isLocal ? 'local' : 'remote'}`}
        tile={tile}
        index={index}
        showSplitLayout={showSplitLayout}
        isSoloLayout={isSoloLayout}
        nonSplitLayoutConfig={nonSplitLayoutConfig}
        setLocalVideoRef={setLocalVideoRef}
        getRemoteVideoRef={getRemoteVideoRef}
      />
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

  if (!preJoinCompleted) {
    return <LoadingState message="Preparing room…" />;
  }

  // Show leaving state
  if (isLeaving) {
    return <LoadingState message="Leaving room..." subtitle="Please wait while we reset your session." />;
  }

  if (isConnecting) {
    return <LoadingState message="Connecting to room..." />;
  }

  if (error) {
    return <ErrorState error={error} onGoHome={() => navigate('/')} />;
  }

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-black text-white">
      {/* Hidden audio elements for remote participants - CRITICAL for audio playback */}
      {participants.map(participant => (
        <audio
          key={`audio-${participant.userId}`}
          ref={getRemoteAudioRef(participant.userId)}
          autoPlay
          playsInline
          data-participant={participant.userId}
          style={{ display: 'none' }}
        />
      ))}

      <PermissionBanner
        hasPermissionIssue={hasPermissionIssue}
        permissionBannerDismissed={permissionBannerDismissed}
        permissionErrors={permissionErrors}
        onDismiss={() => setPermissionBannerDismissed(true)}
        onRetryAudio={handleToggleAudio}
        onRetryVideo={handleToggleVideo}
      />

      <RecordingIndicator
        isVisible={recordingIndicatorVisible}
        isRecording={recordingIsRecording}
        isPending={recordingPending}
        statusText={recordingStatusText}
        elapsedSeconds={recordingElapsedSeconds}
      />


      <BackgroundGradients />

      <div className="relative z-10 flex h-full flex-col">
        {false && (
          <header className="flex h-14 shrink-0 items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.45em] text-slate-400">CYNAYD CONNECT</p>
                <p className="text-sm font-semibold text-gray-200">Room {roomCode}</p>
              </div>
              <span className="hidden items-center gap-2 rounded-full border border-gray-700 bg-gray-800/80 px-3 py-1 text-xs font-medium text-gray-300 shadow-sm sm:inline-flex">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7a3 3 0 11-6 0 3 3 0 016 0zM4 15.5a4 4 0 014-4h4a4 4 0 014 4v.5H4v-.5z" />
                </svg>
                {totalParticipants} participant{totalParticipants === 1 ? '' : 's'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span className="rounded-full border border-gray-700 bg-gray-800/80 px-3 py-1 font-medium text-gray-300">
                Live
              </span>
              <button
                onClick={() => setShowParticipantList(true)}
                className="inline-flex items-center gap-2 rounded-full border border-gray-700 bg-gray-800/80 px-3 py-1 font-semibold text-gray-300 shadow-sm transition hover:border-cyan-500 hover:text-cyan-400"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7a3 3 0 11-6 0 3 3 0 016 0zM4 15.5a4 4 0 014-4h4a4 4 0 014 4v.5H4v-.5zM17 6v4m2-2h-4" />
                </svg>
                View list
              </button>
            </div>
          </header>
        )}

        <ScreenShareBanner
          isScreenSharing={isScreenSharing}
          onStopScreenShare={handleStopScreenShare}
        />

        <main
          className={`relative flex min-h-0 flex-1 flex-col ${mainLayoutSpacingClass}`}
          style={{
            paddingTop: topOffset > 0 ? `${topOffset}px` : 0,
            paddingBottom: `calc(${bottomControlsOffset}px + env(safe-area-inset-bottom))`,
            marginBottom: 0
          }}
        >
          {showSplitLayout ? (
            <div
              className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden lg:flex-row lg:items-stretch lg:gap-0"
              style={splitLayoutContainerStyle}
            >
              <div className={`${sharePaneClassName} relative`} style={{ maxHeight: `calc(100vh - ${topOffset}px - ${bottomControlsOffset}px - env(safe-area-inset-bottom))` }}>
                <ScreenShareSection
                  screenShares={screenShares}
                  pinnedUserId={pinnedScreenShareUserId}
                  onPin={handlePinScreenShare}
                  remoteStreams={screenShareStreams}
                  currentUserId={user?.id ?? ''}
                />

                <SidebarToggleButton
                  isCollapsed={isSidebarCollapsed}
                  onToggle={() => setIsSidebarCollapsed(prev => !prev)}
                />

                {shouldShowActiveSpeakerOverlay && activeSpeakerTile && (
                  <ActiveSpeakerOverlay
                    tile={activeSpeakerTile}
                    hasLiveVideo={activeSpeakerHasLiveVideo}
                    stream={activeSpeakerStream}
                    facingMode={activeSpeakerTileFacingMode}
                    isProbableScreenShare={activeSpeakerIsProbableScreenShare}
                  />
                )}
              </div>

              {isSidebarCollapsed ? (
                <CollapsedSidebarButton onExpand={() => setIsSidebarCollapsed(false)} />
              ) : (
                <ParticipantsSidebar
                  totalParticipants={totalParticipants}
                  participantTiles={participantTilesForDisplay}
                  renderParticipantTile={renderParticipantTile}
                  onCollapse={() => setIsSidebarCollapsed(true)}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col" style={{ marginBottom: 0, paddingBottom: 0, gap: 0 }}>
              {hasScreenShareStage && (
                <div className="flex-none overflow-hidden rounded-[32px] border border-gray-700/50 bg-gray-900/40 shadow-[0_30px_60px_-35px_rgba(0,0,0,0.5)]" style={{ marginBottom: 0 }}>
                  <ScreenShareSection
                    screenShares={screenShares}
                    pinnedUserId={pinnedScreenShareUserId}
                    onPin={handlePinScreenShare}
                    remoteStreams={screenShareStreams}
                    currentUserId={user?.id ?? ''}
                  />
                </div>
              )}

              <div className="relative flex flex-1 overflow-hidden" style={{ marginBottom: 0, paddingBottom: 0 }}>
                <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[32px] bg-gray-900/40 backdrop-blur" style={{ height: `calc(100vh - ${topOffset}px - ${bottomControlsOffset}px - env(safe-area-inset-bottom))`, marginBottom: 0, paddingBottom: 0 }}>
                  <div
                    className={`relative h-full w-full ${showSplitLayout ? 'overflow-y-auto pr-3 sm:pr-4' : 'overflow-hidden'
                      }`}
                  >
                    {participantTilesForDisplay.length === 0 ? (
                      <div className="flex h-full items-center justify-center text-sm font-medium text-gray-400">
                        Waiting for participants…
                      </div>
                    ) : (
                      <div
                        className={
                          showSplitLayout
                            ? `grid h-full w-full gap-1 ${splitGridClasses} ${splitGridAutoRowsClass}`
                            : `${nonSplitLayoutConfig?.gridClasses ?? 'grid h-full w-full gap-1 grid-cols-1 sm:grid-cols-2'} ${nonSplitLayoutConfig?.autoRowsClass ?? ''
                            }`
                        }
                      >
                        {participantTilesForDisplay.map((tile, index) => renderParticipantTile(tile, index))}
                      </div>
                    )}

                    {!showSplitLayout && (
                      <OverflowParticipantsButton
                        overflowCount={overflowCount}
                        totalParticipants={totalParticipants}
                        onClick={() => setShowParticipantList(true)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </main>

        <BottomControlsBar
          isAudioMuted={isAudioMuted}
          audioForceActive={audioForceActive}
          isSpeaking={localTile.isSpeaking}
          hostControls={hostControls}
          deviceStatus={deviceStatus}
          showAudioDropdown={showAudioDropdown}
          availableAudioDevices={availableDevices.audioInput}
          selectedAudioDeviceId={selectedDevices.audioInput}
          onToggleAudio={handleToggleAudio}
          onToggleAudioDropdown={() => setShowAudioDropdown(prev => !prev)}
          onSelectAudioDevice={(deviceId) => handleDeviceSelect('audio', deviceId)}
          onShowAudioDialog={handleShowAudioDialog}
          isVideoMuted={isVideoMuted}
          videoForceActive={videoForceActive}
          showVideoDropdown={showVideoDropdown}
          availableVideoDevices={availableDevices.videoInput}
          selectedVideoDeviceId={selectedDevices.videoInput}
          onToggleVideo={handleToggleVideo}
          onToggleVideoDropdown={() => setShowVideoDropdown(prev => !prev)}
          onSelectVideoDevice={(deviceId) => handleDeviceSelect('video', deviceId)}
          onShowVideoDialog={handleShowVideoDialog}
          isHandRaised={user?.id ? raisedHands.has(user.id) : false}
          onToggleRaiseHand={handleToggleRaiseHand}
          isScreenSharing={isScreenSharing}
          onToggleScreenShare={isScreenSharing ? handleStopScreenShare : handleStartScreenShare}
          chatUnreadCount={chatUnreadCount}
          onOpenChat={() => {
            setShowChatPanel(true);
            setChatActiveConversation(EVERYONE_CONVERSATION_ID);
          }}
          onShowParticipantList={() => setShowParticipantList(true)}
          isAdmin={isAdmin}
          onMuteAllAudio={handleHostMuteAllAudio}
          onUnmuteAllAudio={handleHostUnmuteAllAudio}
          onMuteAllVideo={handleHostMuteAllVideo}
          onUnmuteAllVideo={handleHostUnmuteAllVideo}
          onToggleChat={handleHostToggleChat}
          onToggleLock={handleHostToggleLock}
          onShowPendingRequests={() => setShowPendingRequests(!showPendingRequests)}
          pendingRequestsCount={pendingRequests.length}
          roomCode={roomCode}
          currentIsPublic={roomIsPublic}
          participantCount={participants.length + 1}
          isLeaving={isLeaving}
          isEndingMeeting={isEndingMeeting}
          canEndMeeting={canEndMeeting}
          onLeave={() => {
            void leaveRoom();
          }}
          onEndMeeting={() => {
            void handleEndMeetingForAll();
          }}
        />
      </div>

      <ParticipantList
        isOpen={showParticipantList}
        onClose={() => setShowParticipantList(false)}
        canModerate={isAdmin}
        canManageRoles={isHost}
        currentUserId={user?.id ?? null}
        onForceMute={handleHostControlParticipant}
        onRemoveParticipant={handleHostRemoveParticipant}
        onPromoteToCoHost={handlePromoteToCoHost}
        onDemoteFromCoHost={handleDemoteFromCoHost}
      />
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
          <KeyboardShortcuts
            isOpen={showShortcuts}
            onClose={() => setShowShortcuts(false)}
          />
        </>
      )}
      <ChatPanelPortal
        isOpen={showChatPanel}
        currentUser={{
          id: user?.id ?? 'local-user',
          name: user?.name ?? 'You',
          email: user?.email ?? '',
          picture: user?.picture ?? null,
        }}
        onClose={() => setShowChatPanel(false)}
      />

      <DevicePermissionDialog
        isOpen={showDeviceDialog}
        onClose={() => setShowDeviceDialog(false)}
        onRetry={deviceDialogType === 'audio' ? handleToggleAudio : handleToggleVideo}
        deviceType={deviceDialogType}
        issueType={deviceStatus[deviceDialogType].issueType}
        errorReason={deviceStatus[deviceDialogType].errorReason}
        canRetry={deviceStatus[deviceDialogType].canRetry}
      />
      <ReconnectionOverlay
        onCancel={() => {
          // Only cancel if actually reconnecting (prevent canceling after successful reconnect)
          if (isReconnectingRef.current || reconnectionManager.isReconnecting()) {
            reconnectionManager.cancelReconnection();
            // Reset guards
            isReconnectingRef.current = false;
            isDisconnectHandledRef.current = false;
            preservedLocalStreamRef.current = null;
            handlePermanentDisconnect('Reconnection cancelled by user');
          }
        }}
      />
    </div>
  );
}
