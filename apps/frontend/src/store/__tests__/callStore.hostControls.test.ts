import { describe, expect, it, beforeEach } from 'vitest';
import { useCallStore, EVERYONE_CONVERSATION_ID } from '../callStore';

describe('callStore host control state', () => {
  beforeEach(() => {
    const { resetCallState } = useCallStore.getState();
    resetCallState();
  });

  it('tracks participant force mute state updates', () => {
    const { addParticipant, applyParticipantForceState } = useCallStore.getState();

    addParticipant({
      userId: 'user-1',
      name: 'Remote User',
      isAudioMuted: true,
      isVideoMuted: true,
    });

    applyParticipantForceState('user-1', {
      audio: {
        forced: true,
        muted: true,
        forcedBy: 'host-1',
        reason: 'background noise',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    });

    const participant = useCallStore
      .getState()
      .participants.find(p => p.userId === 'user-1');

    expect(participant).toMatchObject({
      isAudioForceMuted: true,
      audioForceMutedBy: 'host-1',
      forceMuteReason: 'background noise',
      audioForceMutedAt: '2024-01-01T00:00:00.000Z',
    });
  });

  it('removes screen share metadata when video is force disabled', () => {
    const { addParticipant, addScreenShare, applyParticipantForceState } =
      useCallStore.getState();

    addParticipant({
      userId: 'user-1',
      name: 'Remote User',
      isAudioMuted: true,
      isVideoMuted: false,
    });

    addScreenShare({
      userId: 'user-1',
      producerId: 'producer-1',
      name: 'Screen Share',
    });

    applyParticipantForceState('user-1', {
      video: {
        forced: true,
        muted: true,
        forcedBy: 'host-1',
        timestamp: '2024-01-01T00:00:00.000Z',
      },
    });

    expect(useCallStore.getState().screenShares.has('user-1')).toBe(false);
  });

  it('maintains host control state via setter and reset', () => {
    const { setHostControls, resetCallState } = useCallStore.getState();

    setHostControls({
      locked: true,
      lockedBy: 'host-1',
      lockedReason: 'Security check',
      chatForceAll: true,
      chatForceReason: 'Quiet time',
    });

    expect(useCallStore.getState().hostControls.locked).toBe(true);
    expect(useCallStore.getState().hostControls.lockedReason).toBe('Security check');
    expect(useCallStore.getState().hostControls.chatForceAll).toBe(true);
    expect(useCallStore.getState().hostControls.chatForceReason).toBe('Quiet time');

    resetCallState();

    expect(useCallStore.getState().hostControls).toMatchObject({
      locked: false,
      lockedReason: null,
      audioForceAll: false,
      videoForceAll: false,
      chatForceAll: false,
    });
    // ensure conversations map preserved default to avoid lint complaining
    expect(useCallStore.getState().chat.conversations.has(EVERYONE_CONVERSATION_ID)).toBe(
      true
    );
  });
});


