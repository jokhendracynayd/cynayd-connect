import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCallStore } from '../store/callStore';
import { mediaManager } from '../lib/media';
import { toast } from 'react-hot-toast';
import WarningBadge from '../components/shared/WarningBadge';
import DevicePermissionDialog from '../components/call/DevicePermissionDialog';
import SpeakingIndicator from '../components/call/SpeakingIndicator';
import { getAudioDeviceStatus, getVideoDeviceStatus, setupPermissionListener, setupDeviceChangeListener } from '../lib/deviceStatus';
import { ActiveSpeakerDetector } from '../lib/activeSpeaker';
import { config } from '../config';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';

interface MediaDeviceInfo {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'videoinput' | 'audiooutput';
}

export default function PreJoin() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const navigate = useNavigate();
  const {
    settings,
    setSettings,
    selectedDevices,
    setSelectedDevices,
    localStream,
    setLocalStream,
    setPermissionError,
    clearPermissionErrors,
    setPreJoinCompleted,
    deviceStatus,
    setDeviceStatus,
  } = useCallStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<{
    audioInput: MediaDeviceInfo[];
    videoInput: MediaDeviceInfo[];
    audioOutput: MediaDeviceInfo[];
  }>({ audioInput: [], videoInput: [], audioOutput: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [hasDevices, setHasDevices] = useState(false);
  const [showDeviceDialog, setShowDeviceDialog] = useState(false);
  const [deviceDialogType, setDeviceDialogType] = useState<'audio' | 'video'>('audio');
  const audioAutoMutedRef = useRef(false);
  const videoAutoMutedRef = useRef(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const detectorRef = useRef<ActiveSpeakerDetector | null>(null);

  useEffect(() => {
    clearPermissionErrors();
    setPreJoinCompleted(false);
    loadDevices();
  }, [clearPermissionErrors, setPreJoinCompleted]);

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

      // Handle audio: Track if we should force disable, but DON'T change settings here to avoid loop
      if (audioStatus.issueType !== 'none') {
        if (settings.joinWithAudio && !audioAutoMutedRef.current) {
          audioAutoMutedRef.current = true;
        }
      } else {
        if (audioAutoMutedRef.current) {
          audioAutoMutedRef.current = false;
        }
      }

      // Handle video: Track if we should force disable, but DON'T change settings here to avoid loop
      if (videoStatus.issueType !== 'none') {
        if (settings.joinWithVideo && !videoAutoMutedRef.current) {
          videoAutoMutedRef.current = true;
        }
      } else {
        if (videoAutoMutedRef.current) {
          videoAutoMutedRef.current = false;
        }
      }
    };

    updateDeviceStatus();

    // Setup permission listeners
    const cleanupAudioPermission = setupPermissionListener('microphone', async () => {
      const audioTrack = localStream?.getAudioTracks()[0];
      const status = await getAudioDeviceStatus(audioTrack);
      setDeviceStatus('audio', status);
    });

    const cleanupVideoPermission = setupPermissionListener('camera', async () => {
      const videoTrack = localStream?.getVideoTracks()[0];
      const status = await getVideoDeviceStatus(videoTrack);
      setDeviceStatus('video', status);
    });

    // Setup device change listener
    const cleanupDeviceChange = setupDeviceChangeListener(updateDeviceStatus);

    return () => {
      cleanupAudioPermission?.();
      cleanupVideoPermission?.();
      cleanupDeviceChange();
    };
  }, [localStream, setDeviceStatus, settings.joinWithAudio, settings.joinWithVideo]);

  useEffect(() => {
    // Initialize detector
    if (!detectorRef.current) {
      detectorRef.current = new ActiveSpeakerDetector(config.features.voiceIndicator);
    }

    // Start preview if either audio or video is enabled
    if ((settings.joinWithAudio || settings.joinWithVideo) && hasDevices) {
      startPreview();
    } else if (!settings.joinWithAudio && !settings.joinWithVideo) {
      // Stop preview if both are disabled
      stopPreview();
    }
    return () => {
      // Cleanup on unmount
      if (settings.joinWithAudio || settings.joinWithVideo) {
        stopPreview();
      }
      // Cleanup detector
      if (detectorRef.current) {
        detectorRef.current.cleanup();
      }
    };
  }, [settings.joinWithVideo, settings.joinWithAudio, selectedDevices, hasDevices]);

  const loadDevices = async () => {
    try {
      const deviceList = await mediaManager.getDevices();
      const formattedDevices = {
        audioInput: deviceList.audioInput.map(d => ({ deviceId: d.deviceId, label: d.label || 'Microphone', kind: d.kind } as MediaDeviceInfo)),
        videoInput: deviceList.videoInput.map(d => ({ deviceId: d.deviceId, label: d.label || 'Camera', kind: d.kind } as MediaDeviceInfo)),
        audioOutput: deviceList.audioOutput.map(d => ({ deviceId: d.deviceId, label: d.label || 'Speaker', kind: d.kind } as MediaDeviceInfo)),
      };
      
      setDevices(formattedDevices);
      
      if (formattedDevices.audioInput.length > 0 || formattedDevices.videoInput.length > 0) {
        setHasDevices(true);
        
        // Auto-select first devices if not selected
        if (!selectedDevices.audioInput && formattedDevices.audioInput[0]) {
          setSelectedDevices({ audioInput: formattedDevices.audioInput[0].deviceId });
        }
        if (!selectedDevices.videoInput && formattedDevices.videoInput[0]) {
          setSelectedDevices({ videoInput: formattedDevices.videoInput[0].deviceId });
        }
        if (!selectedDevices.audioOutput && formattedDevices.audioOutput[0]) {
          setSelectedDevices({ audioOutput: formattedDevices.audioOutput[0].deviceId });
        }
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
      toast.error('Failed to load devices');
    }
  };

  const startPreview = async () => {
    try {
      // Only request media if at least one is enabled
      if (!settings.joinWithAudio && !settings.joinWithVideo) {
        return;
      }

      const stream = await mediaManager.getLocalMedia(
        settings.joinWithAudio,
        settings.joinWithVideo,
        selectedDevices.audioInput,
        selectedDevices.videoInput
      );
      
      if (videoRef.current && stream) {
        // Only set video srcObject if video is enabled
        if (settings.joinWithVideo && stream.getVideoTracks().length > 0) {
          videoRef.current.srcObject = stream;
        } else if (!settings.joinWithVideo) {
          videoRef.current.srcObject = null;
        }
        setLocalStream(stream);

        // Start active speaker detection for local audio track
        if (settings.joinWithAudio && detectorRef.current) {
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack && audioTrack.readyState === 'live' && audioTrack.enabled) {
            // Use a placeholder userId for PreJoin (will use actual userId in Call)
            const placeholderUserId = 'local-preview';
            
            // Stop any existing monitoring first (in case audio track was replaced)
            detectorRef.current.stopMonitoring(placeholderUserId);
            
            // Small delay to ensure track is fully ready
            setTimeout(() => {
              if (detectorRef.current && audioTrack.readyState === 'live' && audioTrack.enabled) {
                console.log('[PreJoin] Starting active speaker detection for local audio track', {
                  trackId: audioTrack.id,
                  trackEnabled: audioTrack.enabled,
                  trackReadyState: audioTrack.readyState,
                  trackSettings: audioTrack.getSettings?.()
                });
                detectorRef.current.startMonitoringLocal(
                  audioTrack,
                  placeholderUserId,
                  (isActive) => {
                    console.log('[PreJoin] Active speaker state changed:', isActive);
                    setIsSpeaking(isActive);
                  },
                  undefined, // No producer in PreJoin
                  stream // Pass original stream so track stays active
                );
              } else {
                console.warn('[PreJoin] Audio track not ready after delay:', {
                  readyState: audioTrack?.readyState,
                  enabled: audioTrack?.enabled
                });
              }
            }, 100);
          } else {
            console.warn('[PreJoin] Audio track not available, not live, or disabled:', {
              exists: !!audioTrack,
              readyState: audioTrack?.readyState,
              enabled: audioTrack?.enabled
            });
          }
        }
      }
    } catch (error: any) {
      console.error('Failed to start preview:', error);
      const blockedByPermission =
        error.name === 'NotAllowedError' ||
        error.name === 'SecurityError';

      if (blockedByPermission) {
        if (settings.joinWithAudio) {
          setSettings({ joinWithAudio: false });
          setPermissionError('audio', true);
        }
        if (settings.joinWithVideo) {
          setSettings({ joinWithVideo: false });
          setPermissionError('video', true);
        }

        stopPreview();
        toast.error('Browser blocked access. Join in listen-only mode and re-enable devices inside the room.', {
          duration: 5000,
        });
      } else if (error.name === 'NotFoundError') {
        if (settings.joinWithAudio) {
          setSettings({ joinWithAudio: false });
        }
        if (settings.joinWithVideo) {
          setSettings({ joinWithVideo: false });
        }
        toast.error('No camera or microphone found');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        toast.error('Camera or microphone is busy');
      } else {
        toast.error('Failed to start preview');
      }
    }
  };

  const stopPreview = () => {
    // Stop active speaker detection
    if (detectorRef.current) {
      detectorRef.current.stopMonitoring('local-preview');
      setIsSpeaking(false);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    mediaManager.stopLocalMedia();
    setLocalStream(null);
  };

  const handleShowAudioDialog = () => {
    setDeviceDialogType('audio');
    setShowDeviceDialog(true);
  };

  const handleShowVideoDialog = () => {
    setDeviceDialogType('video');
    setShowDeviceDialog(true);
  };

  const handleToggleAudio = () => {
    // Check if there are device issues - if so, show dialog instead of toggling
    if (deviceStatus.audio.issueType !== 'none') {
      handleShowAudioDialog();
      return;
    }

    // User is manually toggling - reset auto-mute tracking
    audioAutoMutedRef.current = false;

    const newAudioState = !settings.joinWithAudio;

    if (!newAudioState) {
      setPermissionError('audio', false);
    }

    setSettings({ joinWithAudio: newAudioState });
    
    // If turning audio OFF, stop audio tracks (optional - can just mute)
    // For preview, we'll stop to save resources
    if (!newAudioState) {
      // Get stream from video element or localStream
      const stream = (videoRef.current?.srcObject as MediaStream) || localStream;
      
      if (stream) {
        stream.getAudioTracks().forEach(track => {
          track.stop();
          stream.removeTrack(track);
        });
        
        // Update localStream in store
        if (localStream && localStream === stream) {
          const updatedStream = new MediaStream(stream.getTracks());
          setLocalStream(updatedStream);
        }
      }
    }
  };

  const handleToggleVideo = () => {
    // Check if there are device issues - if so, show dialog instead of toggling
    if (deviceStatus.video.issueType !== 'none') {
      handleShowVideoDialog();
      return;
    }

    // User is manually toggling - reset auto-mute tracking
    videoAutoMutedRef.current = false;

    const newVideoState = !settings.joinWithVideo;

    if (!newVideoState) {
      setPermissionError('video', false);
    }

    setSettings({ joinWithVideo: newVideoState });
    
    // If turning video OFF, stop video tracks
    if (!newVideoState) {
      // Get stream from video element or localStream
      const stream = (videoRef.current?.srcObject as MediaStream) || localStream;
      
      if (stream) {
        stream.getVideoTracks().forEach(track => {
          track.stop();
          stream.removeTrack(track);
        });
        
        // Update video element
        if (videoRef.current) {
          // Check if stream has any tracks left
          if (stream.getTracks().length === 0) {
            videoRef.current.srcObject = null;
          } else {
            // Create new stream without video tracks
            const newStream = new MediaStream(stream.getTracks());
            videoRef.current.srcObject = newStream;
          }
        }
        
        // Update localStream in store
        if (localStream && localStream === stream) {
          const updatedStream = new MediaStream(stream.getTracks());
          setLocalStream(updatedStream);
        }
      }
    }
  };

  const handleDeviceChange = async (kind: 'audioInput' | 'videoInput' | 'audioOutput', deviceId: string) => {
    setSelectedDevices({ [kind]: deviceId });
    
    // Restart preview if video or audio device changed
    if ((kind === 'videoInput' || kind === 'audioInput') && 
        (settings.joinWithVideo || settings.joinWithAudio)) {
      stopPreview();
      setTimeout(() => startPreview(), 300);
    }
  };

  const handleJoin = async () => {
    if (!roomCode) return;
    
    setIsLoading(true);
    try {
      // Stop preview and clear media (tracks may be stopped)
      stopPreview();
      // Clear the media manager's stream reference to ensure fresh tracks in Call
      mediaManager.stopLocalMedia();
      setPreJoinCompleted(true);
      navigate(`/call/${roomCode}`);
    } catch (error) {
      console.error('Failed to join:', error);
      toast.error('Failed to join room');
      setIsLoading(false);
    }
  };

  if (!hasDevices) {
    // No devices available - can still join
    return (
      <div className="min-h-screen bg-[#f7f9fc] flex items-center justify-center px-6 py-16">
        <div className="max-w-md w-full">
          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-10 text-center shadow-[0_28px_70px_-35px_rgba(14,165,233,0.45)] backdrop-blur">
            <div className="mb-6 flex justify-center">
              <svg className="h-16 w-16 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-slate-900 mb-3">No audio/video devices detected</h2>
            <p className="text-sm leading-relaxed text-slate-600 mb-8">
              You can still enter the room as a listener. Reconnect devices anytime from within the session.
            </p>
            <button
              onClick={handleJoin}
              disabled={isLoading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_22px_45px_-24px_rgba(14,165,233,0.6)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-[-120px] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 opacity-70 blur-[160px]" />
        <div className="absolute right-[-100px] bottom-[-160px] h-[480px] w-[480px] rounded-full bg-gradient-to-tl from-white via-cyan-100 to-indigo-100 opacity-60 blur-[170px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col justify-center px-6 py-16 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_0.8fr]">
          {/* Video Preview */}
          <div className="rounded-[36px] border border-slate-200 bg-white/95 shadow-[0_36px_90px_-46px_rgba(14,165,233,0.55)] backdrop-blur overflow-hidden">
            <div className="relative">
              <div className="relative aspect-[4/3] min-h-[360px] border-b border-slate-100 bg-slate-950 sm:aspect-[16/9] sm:min-h-[420px] lg:min-h-[520px]">
                {settings.joinWithVideo ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover mirror-video"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50">
                    <div className="flex flex-col items-center justify-center gap-3 text-center text-slate-500">
                      <svg className="h-16 w-16 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium">Camera is currently off</p>
                        <p className="mt-1 text-xs text-slate-400">Enable video to check framing before you join.</p>
                      </div>
                    </div>
                  </div>
                )}
                {settings.joinWithVideo && (
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,rgba(34,197,94,0.18),transparent_60%)]" />
                )}
                {/* Speaking indicator overlay */}
                {settings.joinWithAudio && (
                  <div className="absolute bottom-4 right-4 pointer-events-none z-50">
                    {isSpeaking ? (
                      <SpeakingIndicator isSpeaking={isSpeaking} size="md" />
                    ) : (
                      // Debug: Show a subtle indicator when audio is enabled but not speaking
                      <div className="w-3 h-3 rounded-full bg-gray-500/50 opacity-50" title="Audio monitoring active (not speaking)" />
                    )}
                  </div>
                )}
                <div className="absolute top-4 left-4 flex flex-wrap items-center gap-3 text-xs font-medium text-white">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-500/80 px-3 py-1 backdrop-blur">
                    <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
                    Live feed
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                    <span className="inline-flex h-2 w-2 rounded-full bg-rose-400 animate-pulse" />
                    Recording Prep Ready
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 backdrop-blur">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400/90 text-[11px] font-semibold">
                      HD
                    </span>
                    4K Presence Enabled
                  </div>
                </div>
              </div>

              <div className="grid gap-2 border-t border-slate-100 bg-white/92 px-6 py-4 sm:grid-cols-2">
                <div className="relative">
                  {(() => {
                    // Check if mic is actually active - settings must be true AND no system issues
                    const isMicActuallyActive = settings.joinWithAudio && deviceStatus.audio.issueType === 'none';
                    return (
                      <button
                        onClick={handleToggleAudio}
                        className={`flex w-full items-center justify-center gap-3 rounded-[20px] px-5 py-3 text-sm font-semibold transition ${
                          isMicActuallyActive
                            ? 'bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 text-white shadow-[0_22px_45px_-24px_rgba(14,165,233,0.65)] hover:shadow-[0_26px_55px_-26px_rgba(14,165,233,0.7)]'
                            : 'border border-rose-200 bg-rose-50/90 text-rose-500 hover:border-rose-300'
                        }`}
                      >
                        {isMicActuallyActive ? (
                          <>
                            <div className="relative h-6 w-6 flex items-center justify-center">
                              {/* Lottie mic animation - show when speaking, otherwise show static mic icon */}
                              {isSpeaking ? (
                                <DotLottieReact
                                  src="/micanimation.json"
                                  loop
                                  autoplay
                                  style={{
                                    width: '24px',
                                    height: '24px',
                                  }}
                                />
                              ) : (
                                <svg 
                                  className="h-4 w-4 relative z-10" 
                                  viewBox="0 0 24 24" 
                                  fill="none" 
                                  stroke="currentColor"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={1.8} 
                                    d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" 
                                  />
                                </svg>
                              )}
                            </div>
                            Mic active
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            </svg>
                            Mic muted
                          </>
                        )}
                      </button>
                    );
                  })()}
                  {deviceStatus.audio.issueType !== 'none' && (
                    <WarningBadge onClick={handleShowAudioDialog} />
                  )}
                </div>
                <div className="relative">
                  {(() => {
                    // Check if video is actually active - settings must be true AND no system issues
                    const isVideoActuallyActive = settings.joinWithVideo && deviceStatus.video.issueType === 'none';
                    return (
                      <button
                        onClick={handleToggleVideo}
                        className={`flex w-full items-center justify-center gap-3 rounded-[20px] px-5 py-3 text-sm font-semibold transition ${
                          isVideoActuallyActive
                            ? 'bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 text-white shadow-[0_22px_45px_-24px_rgba(14,165,233,0.65)] hover:shadow-[0_26px_55px_-26px_rgba(14,165,233,0.7)]'
                            : 'border border-rose-200 bg-rose-50/90 text-rose-500 hover:border-rose-300'
                        }`}
                      >
                        {isVideoActuallyActive ? (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Video live
                          </>
                        ) : (
                          <>
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            Video paused
                          </>
                        )}
                      </button>
                    );
                  })()}
                  {deviceStatus.video.issueType !== 'none' && (
                    <WarningBadge onClick={handleShowVideoDialog} />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Settings Panel */}
          <div className="flex flex-col gap-6">
            <div className="rounded-[32px] border border-slate-200 bg-white/95 p-8 shadow-[0_30px_75px_-38px_rgba(14,165,233,0.5)] backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Ready to join?</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">Personalize before entering</h3>
                </div>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                  Step 2 of 2
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Confirm your devices and presence settings. You can adjust these anytime inside the room.
              </p>

              {/* Device Selection */}
              <div className="mt-6 space-y-5">
                {devices.audioInput.length > 0 && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">
                      Microphone
                    </label>
                    <select
                      value={selectedDevices.audioInput}
                      onChange={(e) => handleDeviceChange('audioInput', e.target.value)}
                      className="w-full rounded-[16px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 shadow-[0_16px_40px_-32px_rgba(14,165,233,0.55)] focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                    >
                      {devices.audioInput.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {devices.videoInput.length > 0 && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">
                      Camera
                    </label>
                    <select
                      value={selectedDevices.videoInput}
                      onChange={(e) => handleDeviceChange('videoInput', e.target.value)}
                      className="w-full rounded-[16px] border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 shadow-[0_16px_40px_-32px_rgba(14,165,233,0.55)] focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                    >
                      {devices.videoInput.map((device) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Join Button */}
              <div className="mt-8 space-y-3">
                <button
                  onClick={handleJoin}
                  disabled={isLoading}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_22px_45px_-24px_rgba(14,165,233,0.6)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Joining...' : 'Join now'}
                </button>

                <button
                  onClick={() => navigate(-1)}
                  className="inline-flex w-full items-center justify-center rounded-[20px] border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-600 transition hover:border-cyan-200 hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100"
                >
                  Back
                </button>
              </div>
            </div>

            {/* Room Info */}
            <div className="rounded-[24px] border border-slate-200 bg-white/80 p-6 shadow-[0_20px_50px_-36px_rgba(14,165,233,0.45)] backdrop-blur">
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Room code</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{roomCode}</p>
            </div>
          </div>
        </div>
      </div>

      <DevicePermissionDialog
        isOpen={showDeviceDialog}
        onClose={() => setShowDeviceDialog(false)}
        onRetry={deviceDialogType === 'audio' ? handleToggleAudio : handleToggleVideo}
        deviceType={deviceDialogType}
        issueType={deviceStatus[deviceDialogType].issueType}
        errorReason={deviceStatus[deviceDialogType].errorReason}
        canRetry={deviceStatus[deviceDialogType].canRetry}
      />
    </div>
  );
}

