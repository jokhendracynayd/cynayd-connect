import { useState, useRef, useEffect } from 'react';
import type { RecordingStatus } from '../../store/callStore';

interface UseCallStateProps {
  hostControls: {
    locked: boolean;
    lockedBy: string | null;
    lockedReason: string | null;
    audioForceAll: boolean;
    audioForcedBy: string | null;
    audioForceReason: string | null;
    videoForceAll: boolean;
    videoForcedBy: string | null;
    videoForceReason: string | null;
    chatForceAll: boolean;
    chatForcedBy: string | null;
    chatForceReason: string | null;
    updatedAt: string | null;
  };
  recording: {
    status: RecordingStatus | null;
  };
}

export function useCallState({ hostControls, recording }: UseCallStateProps) {
  // UI State
  const [showPendingRequests, setShowPendingRequests] = useState(false);
  const [showRoomSettings, setShowRoomSettings] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showWaitingRoom, setShowWaitingRoom] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isEndingMeeting, setIsEndingMeeting] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [showParticipantList, setShowParticipantList] = useState(false);
  const [showChatPanel, setShowChatPanel] = useState(false);
  const [permissionBannerDismissed, setPermissionBannerDismissed] = useState(false);
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [deviceDialogType, setDeviceDialogType] = useState<'audio' | 'video'>('audio');
  const [showAudioDropdown, setShowAudioDropdown] = useState(false);
  const [showVideoDropdown, setShowVideoDropdown] = useState(false);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const [localForceState, setLocalForceState] = useState<{
    audio: boolean;
    video: boolean;
    audioReason: string | null;
    videoReason: string | null;
  }>({
    audio: false,
    video: false,
    audioReason: null,
    videoReason: null,
  });
  const [isConnecting, setIsConnecting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recordingElapsedSeconds, setRecordingElapsedSeconds] = useState(0);
  const [windowSize, setWindowSize] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Refs
  const hasConnectedRef = useRef(false);
  const isLeavingRef = useRef(false);
  const isEndingMeetingRef = useRef(false);
  const isLoadingPendingRequestsRef = useRef(false);
  const endMeetingFallbackTimerRef = useRef<number | null>(null);
  const hasHandledRoomEndedRef = useRef(false);
  const previousHostControlsRef = useRef(hostControls);
  const previousRecordingStatusRef = useRef<RecordingStatus | null>(recording.status ?? null);
  const showChatPanelRef = useRef(showChatPanel);
  const audioAutoMutedRef = useRef(false);
  const videoAutoMutedRef = useRef(false);
  // Reconnection guards to prevent race conditions
  const isReconnectingRef = useRef(false);
  const isDisconnectHandledRef = useRef(false);
  const preservedLocalStreamRef = useRef<MediaStream | null>(null);

  // Sync showChatPanelRef with showChatPanel prop
  useEffect(() => {
    showChatPanelRef.current = showChatPanel;
  }, [showChatPanel]);

  // Sync previousHostControlsRef
  useEffect(() => {
    previousHostControlsRef.current = hostControls;
  }, [hostControls]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({ width: window.innerWidth, height: window.innerHeight });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cleanup endMeetingFallbackTimerRef
  useEffect(() => {
    return () => {
      if (endMeetingFallbackTimerRef.current) {
        clearTimeout(endMeetingFallbackTimerRef.current);
        endMeetingFallbackTimerRef.current = null;
      }
    };
  }, []);

  return {
    // UI State
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
    // Refs
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
    // Reconnection guards
    isReconnectingRef,
    isDisconnectHandledRef,
    preservedLocalStreamRef,
  };
}

