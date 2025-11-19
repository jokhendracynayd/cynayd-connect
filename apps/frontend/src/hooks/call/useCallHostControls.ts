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
    <
      TResponse extends {
        success?: boolean;
        error?: string;
        [key: string]: unknown;
      } = {
        success?: boolean;
        error?: string;
        [key: string]: unknown;
      }
    >(
      event: string,
      payload: Record<string, unknown>,
      successMessage?: string,
      fallbackErrorMessage: string = 'Host action failed'
    ): Promise<TResponse> => {
      const socket = socketManager.getSocket
        ? socketManager.getSocket()
        : (socketManager as any).socket;
      if (!socket) {
        const error = new Error('Not connected to signaling server.');
        toast.error(error.message);
        return Promise.reject(error);
      }

      return new Promise<TResponse>((resolve, reject) => {
        socket.emit(event, payload, (response?: TResponse) => {
          if (response && response.success === false) {
            const message =
              (typeof response.error === 'string' && response.error) || fallbackErrorMessage;
            toast.error(message);
            return reject(new Error(message));
          }
          if (successMessage) {
            toast.success(successMessage);
          }
          resolve(response ?? ({} as TResponse));
        });
      });
    },
    []
  );

  const fireAndForgetHostControl = useCallback(
    (
      event: string,
      payload: Record<string, unknown>,
      successMessage?: string,
      fallbackErrorMessage?: string
    ) => {
      void emitHostControl(event, payload, successMessage, fallbackErrorMessage).catch(error => {
        console.error(`Host control "${event}" failed:`, error);
      });
    },
    [emitHostControl]
  );

  const handleHostMuteAllAudio = useCallback(() => {
    fireAndForgetHostControl(
      'host-control:mute-all',
      { targets: ['audio'], mute: true },
      'Muted all microphones',
      'Failed to mute microphones'
    );
  }, [fireAndForgetHostControl]);

  const handleHostUnmuteAllAudio = useCallback(() => {
    fireAndForgetHostControl(
      'host-control:mute-all',
      { targets: ['audio'], mute: false },
      'Released microphones',
      'Failed to unmute microphones'
    );
  }, [fireAndForgetHostControl]);

  const handleHostMuteAllVideo = useCallback(() => {
    fireAndForgetHostControl(
      'host-control:mute-all',
      { targets: ['video'], mute: true },
      'Disabled all cameras',
      'Failed to disable cameras'
    );
  }, [fireAndForgetHostControl]);

  const handleHostUnmuteAllVideo = useCallback(() => {
    fireAndForgetHostControl(
      'host-control:mute-all',
      { targets: ['video'], mute: false },
      'Enabled cameras',
      'Failed to enable cameras'
    );
  }, [fireAndForgetHostControl]);

  const handleHostToggleChat = useCallback(() => {
    const shouldMute = !hostControls.chatForceAll;
    fireAndForgetHostControl(
      'host-control:mute-chat',
      { mute: shouldMute },
      shouldMute ? 'Muted chat for everyone' : 'Chat reopened for participants',
      shouldMute ? 'Failed to mute chat' : 'Failed to reopen chat'
    );
  }, [fireAndForgetHostControl, hostControls.chatForceAll]);

  const handleHostToggleLock = useCallback(() => {
    const nextLocked = !hostControls.locked;
    fireAndForgetHostControl(
      'host-control:lock-room',
      { locked: nextLocked },
      nextLocked ? 'Room locked' : 'Room unlocked',
      'Failed to update room lock'
    );
  }, [fireAndForgetHostControl, hostControls.locked]);

  const handleHostStartRecording = useCallback(() => {
    fireAndForgetHostControl(
      'host-control:start-recording',
      {},
      'Starting recording…',
      'Failed to start recording'
    );
  }, [fireAndForgetHostControl]);

  const handleHostStopRecording = useCallback(() => {
    fireAndForgetHostControl(
      'host-control:stop-recording',
      {},
      'Stopping recording…',
      'Failed to stop recording'
    );
  }, [fireAndForgetHostControl]);

  const handleHostControlParticipant = useCallback(
    (userId: string, targets: { audio?: boolean; video?: boolean }, mute: boolean) => {
      fireAndForgetHostControl(
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
    [fireAndForgetHostControl]
  );

  const handleHostRemoveParticipant = useCallback(
    (userId: string) => {
      fireAndForgetHostControl(
        'host-control:remove-participant',
        { targetUserId: userId },
        'Participant removed',
        'Failed to remove participant'
      );
    },
    [fireAndForgetHostControl]
  );

  const handlePromoteToCoHost = useCallback(
    (userId: string) => {
      fireAndForgetHostControl(
        'host-control:update-role',
        { targetUserId: userId, role: 'cohost' },
        'Participant promoted to co-host',
        'Failed to promote participant to co-host'
      );
    },
    [fireAndForgetHostControl]
  );

  const handleDemoteFromCoHost = useCallback(
    (userId: string) => {
      fireAndForgetHostControl(
        'host-control:update-role',
        { targetUserId: userId, role: 'participant' },
        'Co-host privileges revoked',
        'Failed to update participant role'
      );
    },
    [fireAndForgetHostControl]
  );

  const handleHostEndMeeting = useCallback(() => {
    return emitHostControl(
      'host-control:end-room',
      {},
      undefined,
      'Failed to end the meeting for everyone'
    );
  }, [emitHostControl]);

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
    handleHostEndMeeting,
  };
}

