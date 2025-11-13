import { useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { socketManager } from '../../lib/socket';

interface UseCallHostControlsProps {
  hostControls: {
    chatForceAll: boolean;
    locked: boolean;
  };
}

export function useCallHostControls({ hostControls }: UseCallHostControlsProps) {
  const emitHostControl = useCallback(
    (
      event: string,
      payload: Record<string, unknown>,
      successMessage?: string,
      fallbackErrorMessage: string = 'Host action failed'
    ) => {
      const socket = socketManager.getSocket
        ? socketManager.getSocket()
        : (socketManager as any).socket;
      if (!socket) {
        toast.error('Not connected to signaling server.');
        return;
      }

      socket.emit(event, payload, (response?: { success?: boolean; error?: string }) => {
        if (response && response.success === false) {
          toast.error(response.error ?? fallbackErrorMessage);
          return;
        }
        if (successMessage) {
          toast.success(successMessage);
        }
      });
    },
    []
  );

  const handleHostMuteAllAudio = useCallback(() => {
    emitHostControl(
      'host-control:mute-all',
      { targets: ['audio'], mute: true },
      'Muted all microphones',
      'Failed to mute microphones'
    );
  }, [emitHostControl]);

  const handleHostUnmuteAllAudio = useCallback(() => {
    emitHostControl(
      'host-control:mute-all',
      { targets: ['audio'], mute: false },
      'Released microphones',
      'Failed to unmute microphones'
    );
  }, [emitHostControl]);

  const handleHostMuteAllVideo = useCallback(() => {
    emitHostControl(
      'host-control:mute-all',
      { targets: ['video'], mute: true },
      'Disabled all cameras',
      'Failed to disable cameras'
    );
  }, [emitHostControl]);

  const handleHostUnmuteAllVideo = useCallback(() => {
    emitHostControl(
      'host-control:mute-all',
      { targets: ['video'], mute: false },
      'Enabled cameras',
      'Failed to enable cameras'
    );
  }, [emitHostControl]);

  const handleHostToggleChat = useCallback(() => {
    const shouldMute = !hostControls.chatForceAll;
    emitHostControl(
      'host-control:mute-chat',
      { mute: shouldMute },
      shouldMute ? 'Muted chat for everyone' : 'Chat reopened for participants',
      shouldMute ? 'Failed to mute chat' : 'Failed to reopen chat'
    );
  }, [emitHostControl, hostControls.chatForceAll]);

  const handleHostToggleLock = useCallback(() => {
    const nextLocked = !hostControls.locked;
    emitHostControl(
      'host-control:lock-room',
      { locked: nextLocked },
      nextLocked ? 'Room locked' : 'Room unlocked',
      'Failed to update room lock'
    );
  }, [emitHostControl, hostControls.locked]);

  const handleHostStartRecording = useCallback(() => {
    emitHostControl(
      'host-control:start-recording',
      {},
      'Starting recording…',
      'Failed to start recording'
    );
  }, [emitHostControl]);

  const handleHostStopRecording = useCallback(() => {
    emitHostControl(
      'host-control:stop-recording',
      {},
      'Stopping recording…',
      'Failed to stop recording'
    );
  }, [emitHostControl]);

  const handleHostControlParticipant = useCallback(
    (userId: string, targets: { audio?: boolean; video?: boolean }, mute: boolean) => {
      emitHostControl(
        'host-control:mute-participant',
        {
          targetUserId: userId,
          audio: targets.audio ?? false,
          video: targets.video ?? false,
          mute,
        },
        mute ? 'Participant muted' : 'Participant unmuted',
        'Failed to update participant state'
      );
    },
    [emitHostControl]
  );

  const handleHostRemoveParticipant = useCallback(
    (userId: string) => {
      emitHostControl(
        'host-control:remove-participant',
        { targetUserId: userId },
        'Participant removed',
        'Failed to remove participant'
      );
    },
    [emitHostControl]
  );

  const handlePromoteToCoHost = useCallback(
    (userId: string) => {
      emitHostControl(
        'host-control:update-role',
        { targetUserId: userId, role: 'cohost' },
        'Participant promoted to co-host',
        'Failed to promote participant to co-host'
      );
    },
    [emitHostControl]
  );

  const handleDemoteFromCoHost = useCallback(
    (userId: string) => {
      emitHostControl(
        'host-control:update-role',
        { targetUserId: userId, role: 'participant' },
        'Co-host privileges revoked',
        'Failed to update participant role'
      );
    },
    [emitHostControl]
  );

  return {
    emitHostControl,
    handleHostMuteAllAudio,
    handleHostUnmuteAllAudio,
    handleHostMuteAllVideo,
    handleHostUnmuteAllVideo,
    handleHostToggleChat,
    handleHostToggleLock,
    handleHostStartRecording,
    handleHostStopRecording,
    handleHostControlParticipant,
    handleHostRemoveParticipant,
    handlePromoteToCoHost,
    handleDemoteFromCoHost,
  };
}

