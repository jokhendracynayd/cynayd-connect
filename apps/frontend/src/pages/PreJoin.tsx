import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCallStore } from '../store/callStore';
import { mediaManager } from '../lib/media';
import { toast } from 'react-hot-toast';

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
  } = useCallStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<{
    audioInput: MediaDeviceInfo[];
    videoInput: MediaDeviceInfo[];
    audioOutput: MediaDeviceInfo[];
  }>({ audioInput: [], videoInput: [], audioOutput: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [hasDevices, setHasDevices] = useState(false);

  useEffect(() => {
    clearPermissionErrors();
    loadDevices();
  }, []);

  useEffect(() => {
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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    mediaManager.stopLocalMedia();
    setLocalStream(null);
  };

  const handleToggleAudio = () => {
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

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-16 sm:px-8 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Video Preview */}
          <div className="rounded-[34px] border border-slate-200 bg-white/95 shadow-[0_32px_75px_-40px_rgba(14,165,233,0.55)] backdrop-blur overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Preview</p>
                <h3 className="mt-2 text-lg font-semibold text-slate-900">Check your presence</h3>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-500">
                Live preview
              </div>
            </div>
            <div className="relative">
              <div className="aspect-video border-b border-slate-100 bg-slate-950/90">
                {settings.joinWithVideo ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50">
                    <div className="text-center">
                      <svg className="mx-auto h-16 w-16 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <p className="mt-4 text-sm font-medium text-slate-500">Camera is currently off</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-slate-100 bg-white/90 px-6 py-4 sm:flex-row">
                <button
                  onClick={handleToggleAudio}
                  className={`flex-1 rounded-[18px] px-4 py-3 text-sm font-medium transition ${
                    settings.joinWithAudio
                      ? 'bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 text-white shadow-[0_18px_40px_-22px_rgba(14,165,233,0.6)] hover:shadow-[0_22px_50px_-24px_rgba(14,165,233,0.65)]'
                      : 'border border-rose-200 bg-rose-50 text-rose-500 hover:border-rose-300'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    {settings.joinWithAudio ? (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                        Mic on
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
                  </span>
                </button>
                <button
                  onClick={handleToggleVideo}
                  className={`flex-1 rounded-[18px] px-4 py-3 text-sm font-medium transition ${
                    settings.joinWithVideo
                      ? 'border border-slate-200 bg-white text-slate-700 hover:border-cyan-200 hover:bg-cyan-50'
                      : 'border border-rose-200 bg-rose-50 text-rose-500 hover:border-rose-300'
                  }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    {settings.joinWithVideo ? (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Camera on
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                        Camera off
                      </>
                    )}
                  </span>
                </button>
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
    </div>
  );
}

