import { useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { socketManager } from '../../lib/socket';
import { mediaManager } from '../../lib/media';
import { webrtcManager } from '../../lib/webrtc';

interface UseCallMediaProps {
  localStream: MediaStream | null;
  localVideoElement: HTMLVideoElement | null;
  localVideoRef: React.RefObject<HTMLVideoElement | null>;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  selectedDevices: { audioInput: string; videoInput: string };
  deviceStatus: {
    audio: { issueType: string };
    video: { issueType: string };
  };
  permissionErrors: { audio: boolean; video: boolean };
  audioForceActive: boolean;
  videoForceActive: boolean;
  setLocalStream: (stream: MediaStream | null) => void;
  setLocalVideoMuted: (muted: boolean) => void;
  setPermissionError: (kind: 'audio' | 'video', error: boolean) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setShowDeviceDialog: (show: boolean) => void;
  setDeviceDialogType: (type: 'audio' | 'video') => void;
  setRaiseHand: (userId: string, raised: boolean) => void;
}

export function useCallMedia({
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
}: UseCallMediaProps) {
  const { roomCode } = useParams<{ roomCode: string }>();
  const { user } = useAuthStore();
  const { raisedHands } = useCallStore();
  const audioAutoMutedRef = useRef(false);
  const videoAutoMutedRef = useRef(false);

  const handleShowAudioDialog = useCallback(() => {
    setDeviceDialogType('audio');
    setShowDeviceDialog(true);
  }, [setDeviceDialogType, setShowDeviceDialog]);

  const handleShowVideoDialog = useCallback(() => {
    setDeviceDialogType('video');
    setShowDeviceDialog(true);
  }, [setDeviceDialogType, setShowDeviceDialog]);

  const handleDeviceSelect = useCallback(
    async (kind: 'audio' | 'video', deviceId: string) => {
      const previousDeviceId = kind === 'audio' ? selectedDevices.audioInput : selectedDevices.videoInput;
      if (previousDeviceId === deviceId) {
        return;
      }

      try {
        const newTrack = await mediaManager.getSingleTrack(kind, deviceId || undefined);
        const existingStream = localStream;
        const remainingTracks = existingStream?.getTracks().filter(track => track.kind !== kind) ?? [];
        const updatedStream = new MediaStream([...remainingTracks, newTrack]);

        const isMuted = kind === 'audio' ? isAudioMuted : isVideoMuted;
        newTrack.enabled = !isMuted;

        if (kind === 'video') {
          const targetElement = localVideoElement ?? localVideoRef.current;
          if (targetElement) {
            targetElement.srcObject = updatedStream;
          }
        }

        setLocalStream(updatedStream);
        (mediaManager as any).localStream = updatedStream;

        existingStream
          ?.getTracks()
          .filter(track => track.kind === kind)
          .forEach(track => {
            if (track !== newTrack) {
              track.stop();
            }
          });

        const existingProducer = webrtcManager.getProducer(kind);
        if (existingProducer) {
          if (kind === 'audio') {
            await webrtcManager.replaceAudioTrack(newTrack);
          } else {
            await webrtcManager.replaceVideoTrack(newTrack);
          }
        } else {
          if (kind === 'audio') {
            await webrtcManager.produceAudio(newTrack);
          } else {
            await webrtcManager.produceVideo(newTrack);
          }
        }

        if (existingProducer) {
          try {
            if (isMuted) {
              await webrtcManager.pauseProducer(kind);
            } else {
              await webrtcManager.resumeProducer(kind);
            }
          } catch (producerError) {
            console.warn('Failed to update producer state after switching device:', producerError);
          }
        }

        if (kind === 'audio') {
          useCallStore.getState().setSelectedDevices({ audioInput: deviceId });
          setPermissionError('audio', false);
        } else {
          useCallStore.getState().setSelectedDevices({ videoInput: deviceId });
          setPermissionError('video', false);
        }

        const label = kind === 'audio' ? 'Microphone' : 'Camera';
        toast.success(`${label} switched successfully.`);
      } catch (error: any) {
        console.error(`Failed to switch ${kind}:`, error);
        const label = kind === 'audio' ? 'microphone' : 'camera';
        if (error.name === 'NotAllowedError') {
          toast.error(`${label.charAt(0).toUpperCase()}${label.slice(1)} permission denied.`);
        } else if (error.name === 'NotFoundError') {
          toast.error(`Selected ${label} not found.`);
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          toast.error(`${label.charAt(0).toUpperCase()}${label.slice(1)} is busy or unavailable.`);
        } else {
          toast.error(`Failed to switch ${label}.`);
        }
      }
    },
    [
      isAudioMuted,
      isVideoMuted,
      localStream,
      localVideoElement,
      localVideoRef,
      selectedDevices.audioInput,
      selectedDevices.videoInput,
      setLocalStream,
      setPermissionError,
    ]
  );

  const handleToggleAudio = useCallback(async () => {
    // Check if there are device issues - if so, show dialog instead of toggling
    if (deviceStatus.audio.issueType !== 'none') {
      handleShowAudioDialog();
      return;
    }

    // User is manually toggling - reset auto-mute tracking
    audioAutoMutedRef.current = false;

    const desiredMutedState = !isAudioMuted;
    if (audioForceActive && !desiredMutedState) {
      toast.error('The host has muted your microphone.');
      return;
    }

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
          setLocalStream(new MediaStream(localStream.getTracks()));
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
    const newMuted = desiredMutedState;
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
    
    if (!wasMuted) {
      // Turning OFF - mute track and pause producer
      if (audioTrack) {
        audioTrack.enabled = false;
      }
      if (audioProducer) {
        try {
          await webrtcManager.pauseProducer('audio');
        } catch (error) {
          console.error('Error pausing audio producer:', error);
        }
      }
    } else {
      // Turning ON - unmute track and resume producer
      // CRITICAL FIX: Handle all cases - track missing, producer missing, or both missing
      
      if (!audioTrack) {
        // Case 1: No track exists - need to create one
        try {
          const newAudioTrack = await mediaManager.getSingleTrack('audio', selectedDevices.audioInput);
          
          // Add track to stream
          if (localStream) {
            localStream.addTrack(newAudioTrack);
            setLocalStream(new MediaStream(localStream.getTracks()));
          } else {
            const newStream = new MediaStream([newAudioTrack]);
            setLocalStream(newStream);
          }
          
          newAudioTrack.enabled = true;
          
          // Create producer if it doesn't exist
          if (!audioProducer) {
            await webrtcManager.produceAudio(newAudioTrack);
            console.log('Created audio track and producer when unmuting');
          } else {
            // Producer exists but track was missing - replace track
            await webrtcManager.replaceAudioTrack(newAudioTrack);
            await webrtcManager.resumeProducer('audio');
            console.log('Created audio track and replaced in existing producer when unmuting');
          }
        } catch (error: any) {
          console.error('Failed to create audio track when unmuting:', error);
          // Revert the toggle since we failed
          toggleAudio();
          
          if (error.name === 'NotAllowedError') {
            toast.error('Microphone permission denied');
          } else if (error.name === 'NotFoundError') {
            toast.error('No microphone found');
          } else {
            toast.error('Failed to enable microphone');
          }
          return;
        }
      } else {
        // Case 2: Track exists
        audioTrack.enabled = true;
        
        if (!audioProducer) {
          // Track exists but producer doesn't - create producer
          try {
            await webrtcManager.produceAudio(audioTrack);
            console.log('Created audio producer when unmuting (track already existed)');
          } catch (error) {
            console.error('Error creating audio producer when unmuting:', error);
            // Revert the toggle
            toggleAudio();
            toast.error('Failed to enable microphone');
            return;
          }
        } else {
          // Case 3: Both track and producer exist - just resume
          try {
            await webrtcManager.resumeProducer('audio');
          } catch (error) {
            console.error('Error resuming audio producer:', error);
          }
        }
      }
    }
  }, [
    deviceStatus.audio.issueType,
    handleShowAudioDialog,
    isAudioMuted,
    audioForceActive,
    permissionErrors.audio,
    selectedDevices.audioInput,
    localStream,
    setLocalStream,
    setPermissionError,
    toggleAudio,
    roomCode,
    user?.id,
  ]);

  const handleToggleVideo = useCallback(async () => {
    // Check if there are device issues - if so, show dialog instead of toggling
    if (deviceStatus.video.issueType !== 'none') {
      handleShowVideoDialog();
      return;
    }

    // User is manually toggling - reset auto-mute tracking
    videoAutoMutedRef.current = false;

    const desiredMutedState = !isVideoMuted;
    if (videoForceActive && !desiredMutedState) {
      toast.error('The host has disabled your camera.');
      return;
    }

    if (permissionErrors.video) {
      try {
        const newVideoTrack = await mediaManager.getSingleTrack('video', selectedDevices.videoInput);
        const targetMuted = desiredMutedState;

        if (localStream) {
          localStream.getVideoTracks().forEach(track => {
            track.stop();
            localStream.removeTrack(track);
          });
          localStream.addTrack(newVideoTrack);
          setLocalStream(new MediaStream(localStream.getTracks()));
        } else {
          const newStream = new MediaStream([newVideoTrack]);
          setLocalStream(newStream);
        }

        newVideoTrack.enabled = !targetMuted;

        const existingProducer = webrtcManager.getProducer('video');
        if (existingProducer) {
          await webrtcManager.replaceVideoTrack(newVideoTrack);
        } else {
          await webrtcManager.produceVideo(newVideoTrack);
        }

        if (targetMuted) {
          newVideoTrack.enabled = false;
          try {
            await webrtcManager.pauseProducer('video');
          } catch (pauseError) {
            console.warn('Failed to pause video producer after replacing track:', pauseError);
          }
        } else {
          newVideoTrack.enabled = true;
          try {
            await webrtcManager.resumeProducer('video');
          } catch (resumeError) {
            console.warn('Failed to resume video producer after replacing track:', resumeError);
          }
        }

        setLocalVideoMuted(targetMuted);
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
          setLocalStream(new MediaStream(localStream.getTracks()));
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
          setLocalStream(new MediaStream(localStream.getTracks()));
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
  }, [
    deviceStatus.video.issueType,
    handleShowVideoDialog,
    isVideoMuted,
    videoForceActive,
    permissionErrors.video,
    selectedDevices.videoInput,
    localStream,
    setLocalStream,
    setLocalVideoMuted,
    setPermissionError,
    toggleVideo,
    roomCode,
    user?.id,
  ]);

  const handleToggleRaiseHand = useCallback(() => {
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
  }, [user?.id, raisedHands, setRaiseHand]);

  return {
    handleToggleAudio,
    handleToggleVideo,
    handleToggleRaiseHand,
    handleDeviceSelect,
    handleShowAudioDialog,
    handleShowVideoDialog,
  };
}

