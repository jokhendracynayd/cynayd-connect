import type { RecordingState, RecordingStatus, CallState } from '../store/callStore';
import type { RecordingStateEventPayload } from '../types/call';

/**
 * Normalizes incoming recording state payload to a consistent RecordingState format
 * @param incoming - The raw recording state payload from the server
 * @returns Normalized RecordingState object
 */
export function normalizeRecordingState(
  incoming?: RecordingStateEventPayload | null
): RecordingState {
  if (!incoming) {
    return {
      active: false,
      status: null,
      sessionId: null,
      hostId: null,
      serverInstanceId: null,
      startedAt: null,
      endedAt: null,
      failureReason: null,
      updatedAt: new Date().toISOString(),
    };
  }

  const rawStatus =
    typeof incoming.status === 'string'
      ? (incoming.status.toUpperCase() as RecordingStatus)
      : incoming.status ?? null;
  const allowedStatuses: RecordingStatus[] = [
    'STARTING',
    'RECORDING',
    'UPLOADING',
    'COMPLETED',
    'FAILED',
  ];
  const normalizedStatus =
    rawStatus && allowedStatuses.includes(rawStatus) ? rawStatus : null;

  return {
    active: Boolean(incoming.active) || normalizedStatus === 'RECORDING',
    status: normalizedStatus,
    sessionId: incoming.sessionId ?? null,
    hostId: incoming.hostId ?? null,
    serverInstanceId: incoming.serverInstanceId ?? null,
    startedAt: incoming.startedAt ?? null,
    endedAt: incoming.endedAt ?? null,
    failureReason: incoming.failureReason ?? null,
    updatedAt: incoming.updatedAt ?? new Date().toISOString(),
  };
}

/**
 * Resolves producer metadata to determine userId and kind
 * @param producerId - The producer ID to look up
 * @param producerMetadataRef - Reference to the producer metadata map
 * @returns Object with userId and kind, or undefined if not found
 */
export function resolveProducerMeta(
  producerId: string,
  producerMetadataRef: React.MutableRefObject<
    Map<string, { source?: string; userId?: string; kind?: 'audio' | 'video' }>
  >
): { userId?: string; kind: 'audio' | 'video' | 'screen' } | undefined {
  const metadata = producerMetadataRef.current.get(producerId);
  if (!metadata) {
    return undefined;
  }

  const source = metadata.source;
  let kind: 'audio' | 'video' | 'screen';
  if (source === 'screen') {
    kind = 'screen';
  } else if (source === 'microphone') {
    kind = 'audio';
  } else if (source === 'camera') {
    kind = 'video';
  } else {
    kind = metadata.kind ?? 'video';
  }

  return {
    userId: metadata.userId,
    kind,
  };
}

/**
 * Runs a participant update action immediately if the participant exists,
 * otherwise queues it for later execution when the participant is added
 * @param targetUserId - The user ID to update
 * @param action - The action function to execute
 * @param getCallStoreState - Function to get current call store state
 * @param pendingParticipantEventsRef - Reference to the pending events map
 */
export function runOrQueueParticipantUpdate(
  targetUserId: string | undefined,
  action: () => void,
  getCallStoreState: () => CallState,
  pendingParticipantEventsRef: React.MutableRefObject<Map<string, Array<() => void>>>
): void {
  if (!targetUserId) {
    return;
  }

  const { participants } = getCallStoreState();
  const participantExists = participants.some(p => p.userId === targetUserId);

  if (participantExists) {
    action();
    return;
  }

  const queue = pendingParticipantEventsRef.current.get(targetUserId) ?? [];
  queue.push(action);
  pendingParticipantEventsRef.current.set(targetUserId, queue);
}

/**
 * Flushes all pending participant update actions for a given user
 * @param targetUserId - The user ID whose pending events should be flushed
 * @param pendingParticipantEventsRef - Reference to the pending events map
 */
export function flushPendingParticipantEvents(
  targetUserId: string | undefined,
  pendingParticipantEventsRef: React.MutableRefObject<Map<string, Array<() => void>>>
): void {
  if (!targetUserId) {
    return;
  }

  const queue = pendingParticipantEventsRef.current.get(targetUserId);
  if (!queue?.length) {
    pendingParticipantEventsRef.current.delete(targetUserId);
    return;
  }

  pendingParticipantEventsRef.current.delete(targetUserId);

  queue.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.error('Error executing pending participant update', { userId: targetUserId, error });
    }
  });
}

