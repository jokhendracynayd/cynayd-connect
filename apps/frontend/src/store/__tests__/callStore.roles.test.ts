import { describe, it, expect, beforeEach } from 'vitest';
import { useCallStore } from '../callStore';

describe('callStore participant roles', () => {
  beforeEach(() => {
    useCallStore.getState().resetCallState();
  });

  it('defaults new participants to participant role', () => {
    const { addParticipant } = useCallStore.getState();
    addParticipant({
      userId: 'user-1',
      name: 'Remote User',
    });

    const participant = useCallStore.getState().participants.find(p => p.userId === 'user-1');
    expect(participant).toMatchObject({
      role: 'PARTICIPANT',
      isAdmin: false,
    });
  });

  it('updates moderator flag when role changes', () => {
    const { addParticipant, updateParticipant } = useCallStore.getState();
    addParticipant({
      userId: 'user-2',
      name: 'Co-host Candidate',
    });

    updateParticipant('user-2', { role: 'COHOST' });
    let participant = useCallStore.getState().participants.find(p => p.userId === 'user-2');
    expect(participant).toMatchObject({
      role: 'COHOST',
      isAdmin: true,
    });

    updateParticipant('user-2', { role: 'PARTICIPANT' });
    participant = useCallStore.getState().participants.find(p => p.userId === 'user-2');
    expect(participant).toMatchObject({
      role: 'PARTICIPANT',
      isAdmin: false,
    });
  });

  it('tracks local participant role and host flags', () => {
    const { setParticipantRole, setIsHost } = useCallStore.getState();

    setParticipantRole('COHOST');
    expect(useCallStore.getState().participantRole).toBe('COHOST');

    setIsHost(true);
    expect(useCallStore.getState().isHost).toBe(true);

    useCallStore.getState().resetCallState();
    expect(useCallStore.getState().participantRole).toBe('PARTICIPANT');
    expect(useCallStore.getState().isHost).toBe(false);
    expect(useCallStore.getState().recording.active).toBe(false);
    expect(useCallStore.getState().recording.status).toBeNull();
  });
});

