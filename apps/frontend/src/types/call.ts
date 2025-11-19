import type { ParticipantRole, RecordingStatus } from '../store/callStore';

export interface RecordingStateEventPayload {
  active?: boolean;
  status?: RecordingStatus | string | null;
  sessionId?: string | null;
  hostId?: string | null;
  serverInstanceId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  failureReason?: string | null;
  updatedAt?: string | null;
}

export interface RecordingErrorEventPayload {
  message?: string;
}

export type SocketEventKey =
  | 'user-joined'
  | 'user-left'
  | 'new-producer'
  | 'producer-closed'
  | 'chat:message'
  | 'chat'
  | 'audio-mute'
  | 'video-mute'
  | 'active-speaker'
  | 'raised-hand'
  | 'join-request'
  | 'pending-requests-loaded'
  | 'screen-share-started'
  | 'screen-share-stopped'
  | 'host-control:participant-state'
  | 'host-control:room-state'
  | 'host-control:chat-state'
  | 'host-control:participant-removed'
  | 'room:ended'
  | 'host-control:role-updated'
  | 'recording:state'
  | 'recording:error';

export type ServerParticipant = {
  userId: string;
  name: string;
  email: string;
  picture?: string | null;
  role?: ParticipantRole;
  isAdmin?: boolean;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  isAudioForceMuted?: boolean;
  isVideoForceMuted?: boolean;
  isSpeaking?: boolean;
  hasRaisedHand?: boolean;
  joinedAt?: string;
  audioMutedAt?: string | null;
  videoMutedAt?: string | null;
  audioForceMutedAt?: string | null;
  videoForceMutedAt?: string | null;
  audioForceMutedBy?: string | null;
  videoForceMutedBy?: string | null;
  forceMuteReason?: string | null;
};

export interface ParticipantTile {
  userId: string;
  name: string;
  email: string;
  picture?: string | null;
  isLocal: boolean;
  isHost: boolean;
  isModerator: boolean;
  role: ParticipantRole;
  stream?: MediaStream | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isSpeaking: boolean;
  hasRaisedHand: boolean;
}

