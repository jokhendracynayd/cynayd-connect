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
  const { settings, setSettings, selectedDevices, setSelectedDevices, localStream, setLocalStream } = useCallStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [devices, setDevices] = useState<{
    audioInput: MediaDeviceInfo[];
    videoInput: MediaDeviceInfo[];
    audioOutput: MediaDeviceInfo[];
  }>({ audioInput: [], videoInput: [], audioOutput: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [hasDevices, setHasDevices] = useState(false);

  useEffect(() => {
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
      if (error.name === 'NotAllowedError') {
        toast.error('Please allow camera and microphone access');
      } else if (error.name === 'NotFoundError') {
        toast.error('No camera or microphone found');
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
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="bg-gray-800 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg className="w-16 h-16 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-4">No Audio/Video Devices</h2>
            <p className="text-gray-400 mb-6">
              You can still join the room as a listener, but won't be able to share audio or video.
            </p>
            <button
              onClick={handleJoin}
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium disabled:opacity-50"
            >
              {isLoading ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="grid md:grid-cols-2 gap-6">
          {/* Video Preview */}
          <div className="bg-gray-800 rounded-lg overflow-hidden">
            <div className="aspect-video bg-black relative">
              {settings.joinWithVideo ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <svg className="w-20 h-20 mx-auto text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <p className="text-gray-400 mt-4">Camera off</p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-4 left-4 right-4 flex gap-2">
                <button
                  onClick={handleToggleAudio}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium ${
                    settings.joinWithAudio
                      ? 'bg-gray-700 text-white hover:bg-gray-600'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {settings.joinWithAudio ? (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                      Mic on
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                      Mic off
                    </>
                  )}
                </button>
                <button
                  onClick={handleToggleVideo}
                  className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium ${
                    settings.joinWithVideo
                      ? 'bg-gray-700 text-white hover:bg-gray-600'
                      : 'bg-red-600 text-white hover:bg-red-700'
                  }`}
                >
                  {settings.joinWithVideo ? (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Camera on
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Camera off
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Settings Panel */}
          <div className="space-y-4">
            <div className="bg-gray-800 rounded-lg p-6">
              <h3 className="text-xl font-bold text-white mb-4">
                Ready to join?
              </h3>
              <p className="text-gray-400 mb-6">
                Adjust your settings before joining the room.
              </p>

              {/* Device Selection */}
              <div className="space-y-4 mb-6">
                {devices.audioInput.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Microphone
                    </label>
                    <select
                      value={selectedDevices.audioInput}
                      onChange={(e) => handleDeviceChange('audioInput', e.target.value)}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Camera
                    </label>
                    <select
                      value={selectedDevices.videoInput}
                      onChange={(e) => handleDeviceChange('videoInput', e.target.value)}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              <button
                onClick={handleJoin}
                disabled={isLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-lg font-medium disabled:opacity-50 mb-4"
              >
                {isLoading ? 'Joining...' : 'Join Now'}
              </button>

              {/* Back Button */}
              <button
                onClick={() => navigate(-1)}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-medium"
              >
                Back
              </button>
            </div>

            {/* Room Info */}
            <div className="bg-gray-800 rounded-lg p-4">
              <p className="text-sm text-gray-400">Room code</p>
              <p className="text-xl font-bold text-white">{roomCode}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

