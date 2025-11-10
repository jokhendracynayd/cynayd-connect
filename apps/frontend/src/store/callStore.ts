import { create } from 'zustand';
import type { ScreenShare } from '../types/screenShare';
import type { NetworkQualityLevel, NetworkSample } from '../lib/networkMonitor';

export type ChatMessageType = 'BROADCAST' | 'DIRECT' | 'SYSTEM';

export interface ChatUserInfo {
  id: string;
  name: string;
  email: string;
  picture?: string | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  senderId: string;
  recipientId?: string | null;
  content: string;
  messageType: ChatMessageType;
  createdAt: string;
  updatedAt?: string;
  sender?: ChatUserInfo | null;
  recipient?: ChatUserInfo | null;
  clientMessageId?: string;
  status?: 'pending' | 'sent' | 'failed';
}

export interface ChatConversation {
  id: string;
  type: 'group' | 'direct';
  title: string;
  participantIds: string[];
  unreadCount: number;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  nextCursor: string | null;
  hasMoreHistory: boolean;
}

export const EVERYONE_CONVERSATION_ID = 'everyone';

export type NetworkDirection = 'upstream' | 'downstream';

export interface NetworkQualitySummary {
  level: NetworkQualityLevel;
  bitrateKbps: number;
  packetLoss: number;
  jitter: number;
  rtt: number;
  kind: 'audio' | 'video' | 'screen';
  lastUpdated: number;
}

export interface NetworkQualityAggregate {
  upstream: NetworkQualitySummary | null;
  downstream: NetworkQualitySummary | null;
  lastUpdated: number;
}

const qualityRank: Record<NetworkQualityLevel, number> = {
  excellent: 4,
  good: 3,
  fair: 2,
  poor: 1,
  unknown: 0,
};

const updateDirectionSummary = (
  existing: NetworkQualitySummary | null,
  incoming: NetworkQualitySummary
): NetworkQualitySummary => {
  if (!existing) {
    return incoming;
  }

  const incomingRank = qualityRank[incoming.level];
  const existingRank = qualityRank[existing.level];

  const useIncoming =
    incomingRank < existingRank ||
    (incomingRank === existingRank && incoming.lastUpdated >= existing.lastUpdated);

  if (useIncoming) {
    return incoming;
  }

  return {
    ...existing,
    lastUpdated: Math.max(existing.lastUpdated, incoming.lastUpdated),
  };
};

const createGroupConversation = (): ChatConversation => ({
  id: EVERYONE_CONVERSATION_ID,
  type: 'group',
  title: 'Everyone',
  participantIds: [],
  unreadCount: 0,
  nextCursor: null,
  hasMoreHistory: true,
});

const sortMessages = (messages: ChatMessage[]): ChatMessage[] =>
  [...messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

const upsertMessage = (messages: ChatMessage[], incoming: ChatMessage): ChatMessage[] => {
  const updated = [...messages];

  const byIdIndex = incoming.id
    ? updated.findIndex(message => message.id === incoming.id)
    : -1;

  if (byIdIndex >= 0) {
    updated[byIdIndex] = { ...updated[byIdIndex], ...incoming, status: incoming.status ?? updated[byIdIndex].status };
    return sortMessages(updated);
  }

  if (incoming.clientMessageId) {
    const byClientIndex = updated.findIndex(
      message => message.clientMessageId && message.clientMessageId === incoming.clientMessageId
    );

    if (byClientIndex >= 0) {
      updated[byClientIndex] = {
        ...updated[byClientIndex],
        ...incoming,
        status: incoming.status ?? updated[byClientIndex].status,
      };
      return sortMessages(updated);
    }
  }

  updated.push(incoming);
  return sortMessages(updated);
};

const mergeMessages = (existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  let merged = [...existing];
  for (const message of incoming) {
    merged = upsertMessage(merged, message);
  }
  return merged;
};

const deriveConversationFromMessage = (
  message: ChatMessage,
  currentUserId?: string
): { id: string; type: 'group' | 'direct'; title: string; otherParticipantId?: string } => {
  if (message.messageType !== 'DIRECT') {
    return {
      id: EVERYONE_CONVERSATION_ID,
      type: 'group',
      title: 'Everyone',
    };
  }

  const senderId = message.senderId;
  const recipientId = message.recipientId ?? '';
  const otherParticipantId =
    senderId === currentUserId ? recipientId || senderId : senderId || recipientId;

  const title =
    senderId === currentUserId
      ? message.recipient?.name ?? 'Direct message'
      : message.sender?.name ?? 'Direct message';

  return {
    id: `direct:${otherParticipantId ?? senderId}`,
    type: 'direct',
    title,
    otherParticipantId: otherParticipantId ?? senderId,
  };
};

export interface RoomJoinRequest {
  id: string;
  userId: string;
  name: string;
  email: string;
  picture?: string;
  requestedAt: Date | string;
  status: 'pending' | 'approved' | 'rejected';
}

interface Participant {
  userId: string;
  name: string;
  email: string;
  picture?: string;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isAudioForceMuted: boolean;
  isVideoForceMuted: boolean;
  isSpeaking: boolean;
  isAdmin: boolean;
  hasRaisedHand: boolean;
  audioForceMutedAt?: string | null;
  videoForceMutedAt?: string | null;
  audioForceMutedBy?: string | null;
  videoForceMutedBy?: string | null;
  forceMuteReason?: string | null;
}

type ParticipantInput = {
  userId: string;
  name?: string;
  email?: string;
  picture?: string;
  isAudioMuted?: boolean;
  isVideoMuted?: boolean;
  isAudioForceMuted?: boolean;
  isVideoForceMuted?: boolean;
  isSpeaking?: boolean;
  isAdmin?: boolean;
  hasRaisedHand?: boolean;
  audioForceMutedAt?: string | null;
  videoForceMutedAt?: string | null;
  audioForceMutedBy?: string | null;
  videoForceMutedBy?: string | null;
  forceMuteReason?: string | null;
};

interface CallState {
  isConnected: boolean;
  roomCode: string | null;
  participants: Participant[];
  localStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isAdmin: boolean;
  roomIsPublic: boolean;
  pendingRequests: RoomJoinRequest[];
  activeSpeakerId: string | null;
  raisedHands: Set<string>;
  screenShares: Map<string, ScreenShare>; // userId -> ScreenShare
  pinnedScreenShareUserId: string | null; // User's local pin choice
  isScreenSharing: boolean; // Local user's screen share state
  permissionErrors: {
    audio: boolean;
    video: boolean;
  };
  selectedDevices: {
    audioInput: string;
    videoInput: string;
    audioOutput: string;
  };
  settings: {
    joinWithAudio: boolean;
    joinWithVideo: boolean;
  };
  chat: {
    activeConversationId: string;
    conversations: Map<string, ChatConversation>;
    messages: Map<string, ChatMessage[]>;
  };
  networkQuality: Map<string, NetworkQualityAggregate>;
  hostControls: {
    locked: boolean;
    lockedBy: string | null;
    lockedReason: string | null;
    audioForceAll: boolean;
    audioForcedBy: string | null;
    audioForceReason: string | null;
    videoForceAll: boolean;
    videoForcedBy: string | null;
    videoForceReason: string | null;
    chatForceAll: boolean;
    chatForcedBy: string | null;
    chatForceReason: string | null;
    updatedAt: string | null;
  };
  setRoomCode: (code: string) => void;
  setIsConnected: (connected: boolean) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: ParticipantInput) => void;
  removeParticipant: (userId: string) => void;
  updateParticipant: (userId: string, updates: Partial<Participant>) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setLocalAudioMuted: (muted: boolean) => void;
  setLocalVideoMuted: (muted: boolean) => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setRoomIsPublic: (isPublic: boolean) => void;
  setPendingRequests: (requests: RoomJoinRequest[]) => void;
  addPendingRequest: (request: RoomJoinRequest) => void;
  removePendingRequest: (requestId: string) => void;
  setActiveSpeaker: (userId: string | null) => void;
  toggleRaiseHand: () => void;
  setRaiseHand: (userId: string, isRaised: boolean) => void;
  addScreenShare: (share: ScreenShare) => void;
  removeScreenShare: (userId: string) => void;
  setPinnedScreenShare: (userId: string | null) => void;
  setIsScreenSharing: (isSharing: boolean) => void;
  setPermissionError: (kind: 'audio' | 'video', hasError: boolean) => void;
  clearPermissionErrors: () => void;
  setSelectedDevices: (devices: Partial<CallState['selectedDevices']>) => void;
  setSettings: (settings: Partial<CallState['settings']>) => void;
  setChatActiveConversation: (conversationId: string) => void;
  ingestChatMessage: (message: ChatMessage, options?: { currentUserId?: string; markAsRead?: boolean }) => void;
  addPendingChatMessage: (conversationId: string, message: ChatMessage) => void;
  resolvePendingChatMessage: (conversationId: string, clientMessageId: string, serverMessage: ChatMessage) => void;
  failPendingChatMessage: (conversationId: string, clientMessageId: string) => void;
  applyChatHistory: (
    conversationId: string,
    messages: ChatMessage[],
    options?: { currentUserId?: string; nextCursor?: string | null; hasMore?: boolean }
  ) => void;
  ensureChatConversation: (conversation: ChatConversation) => void;
  updateNetworkQuality: (samples: NetworkSample[]) => void;
  clearNetworkQuality: () => void;
  setHostControls: (controls: Partial<CallState['hostControls']>) => void;
  applyParticipantForceState: (
    userId: string,
    state: {
      audio?: {
        muted?: boolean;
        forced: boolean;
        reason?: string | null;
        forcedBy?: string | null;
        timestamp?: string | null;
      };
      video?: {
        muted?: boolean;
        forced: boolean;
        reason?: string | null;
        forcedBy?: string | null;
        timestamp?: string | null;
      };
    }
  ) => void;
  resetCallState: () => void;
}

const withParticipantDefaults = (participant: ParticipantInput): Participant => ({
  userId: participant.userId,
  name: participant.name ?? 'Unknown',
  email: participant.email ?? '',
  picture: participant.picture,
  isAudioMuted: participant.isAudioMuted ?? true,
  isVideoMuted: participant.isVideoMuted ?? true,
  isAudioForceMuted: participant.isAudioForceMuted ?? false,
  isVideoForceMuted: participant.isVideoForceMuted ?? false,
  isSpeaking: participant.isSpeaking ?? false,
  isAdmin: participant.isAdmin ?? false,
  hasRaisedHand: participant.hasRaisedHand ?? false,
  audioForceMutedAt: participant.audioForceMutedAt ?? null,
  videoForceMutedAt: participant.videoForceMutedAt ?? null,
  audioForceMutedBy: participant.audioForceMutedBy ?? null,
  videoForceMutedBy: participant.videoForceMutedBy ?? null,
  forceMuteReason: participant.forceMuteReason ?? null,
});

const mergeParticipantWithUpdates = (existing: Participant, updates: ParticipantInput): Participant => ({
  userId: existing.userId,
  name: updates.name ?? existing.name,
  email: updates.email ?? existing.email,
  picture: updates.picture ?? existing.picture,
  isAudioMuted: updates.isAudioMuted ?? existing.isAudioMuted,
  isVideoMuted: updates.isVideoMuted ?? existing.isVideoMuted,
  isAudioForceMuted: updates.isAudioForceMuted ?? existing.isAudioForceMuted,
  isVideoForceMuted: updates.isVideoForceMuted ?? existing.isVideoForceMuted,
  isSpeaking: updates.isSpeaking ?? existing.isSpeaking,
  isAdmin: updates.isAdmin ?? existing.isAdmin,
  hasRaisedHand: updates.hasRaisedHand ?? existing.hasRaisedHand,
  audioForceMutedAt:
    updates.audioForceMutedAt !== undefined ? updates.audioForceMutedAt : existing.audioForceMutedAt ?? null,
  videoForceMutedAt:
    updates.videoForceMutedAt !== undefined ? updates.videoForceMutedAt : existing.videoForceMutedAt ?? null,
  audioForceMutedBy:
    updates.audioForceMutedBy !== undefined ? updates.audioForceMutedBy : existing.audioForceMutedBy ?? null,
  videoForceMutedBy:
    updates.videoForceMutedBy !== undefined ? updates.videoForceMutedBy : existing.videoForceMutedBy ?? null,
  forceMuteReason:
    updates.forceMuteReason !== undefined ? updates.forceMuteReason : existing.forceMuteReason ?? null,
});

export const useCallStore = create<CallState>((set) => ({
  isConnected: false,
  roomCode: null,
  participants: [],
  localStream: null,
  isAudioMuted: false,
  isVideoMuted: false,
  isAdmin: false,
  roomIsPublic: true,
  pendingRequests: [],
  activeSpeakerId: null,
  raisedHands: new Set<string>(),
  screenShares: new Map<string, ScreenShare>(),
  pinnedScreenShareUserId: null,
  isScreenSharing: false,
  permissionErrors: {
    audio: false,
    video: false,
  },
  selectedDevices: {
    audioInput: '',
    videoInput: '',
    audioOutput: '',
  },
  settings: {
    joinWithAudio: true,
    joinWithVideo: true,
  },
  chat: {
    activeConversationId: EVERYONE_CONVERSATION_ID,
    conversations: new Map<string, ChatConversation>([
      [EVERYONE_CONVERSATION_ID, createGroupConversation()],
    ]),
    messages: new Map<string, ChatMessage[]>([
      [EVERYONE_CONVERSATION_ID, []],
    ]),
  },
  networkQuality: new Map<string, NetworkQualityAggregate>(),
  hostControls: {
    locked: false,
    lockedBy: null,
    lockedReason: null,
    audioForceAll: false,
    audioForcedBy: null,
    audioForceReason: null,
    videoForceAll: false,
    videoForcedBy: null,
    videoForceReason: null,
    chatForceAll: false,
    chatForcedBy: null,
    chatForceReason: null,
    updatedAt: null,
  },
  
  setRoomCode: (code) => set({ roomCode: code }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setParticipants: (participants) => set({
    participants: participants.map(withParticipantDefaults),
  }),
  addParticipant: (participant) => set((state) => {
    // Check if participant already exists to prevent duplicates
    const exists = state.participants.some(p => p.userId === participant.userId);
    if (exists) {
      // Update existing participant instead of adding duplicate
      return {
        participants: state.participants.map(p =>
          p.userId === participant.userId ? mergeParticipantWithUpdates(p, participant) : p
        ),
      };
    }
    // Ensure default values for new fields
    const newParticipant = withParticipantDefaults(participant);
    return {
      participants: [...state.participants, newParticipant],
    };
  }),
  removeParticipant: (userId) => set((state) => ({
    participants: state.participants.filter((p) => p.userId !== userId),
  })),
  updateParticipant: (userId, updates) => set((state) => ({
    participants: state.participants.map((p) =>
      p.userId === userId ? { ...p, ...updates } : p
    ),
  })),
  toggleAudio: () => set((state) => ({ isAudioMuted: !state.isAudioMuted })),
  toggleVideo: () => set((state) => ({ isVideoMuted: !state.isVideoMuted })),
  setLocalAudioMuted: (muted) => set({ isAudioMuted: muted }),
  setLocalVideoMuted: (muted) => set({ isVideoMuted: muted }),
  setIsAdmin: (isAdmin) => set({ isAdmin }),
  setRoomIsPublic: (isPublic) => set({ roomIsPublic: isPublic }),
  setPendingRequests: (requests) => set({ pendingRequests: requests }),
  addPendingRequest: (request) => set((state) => {
    // Check if request already exists
    const exists = state.pendingRequests.some(r => r.id === request.id);
    if (exists) {
      return {
        pendingRequests: state.pendingRequests.map(r =>
          r.id === request.id ? request : r
        ),
      };
    }
    return {
      pendingRequests: [...state.pendingRequests, request],
    };
  }),
  removePendingRequest: (requestId) => set((state) => ({
    pendingRequests: state.pendingRequests.filter(r => r.id !== requestId),
  })),
  setActiveSpeaker: (userId) => set({ activeSpeakerId: userId }),
  toggleRaiseHand: () => set((state) => {
    // This will be called by local user to toggle their own raised hand
    // The actual state is managed via setRaiseHand
    return state;
  }),
  setRaiseHand: (userId, isRaised) => set((state) => {
    const newRaisedHands = new Set(state.raisedHands);
    if (isRaised) {
      newRaisedHands.add(userId);
    } else {
      newRaisedHands.delete(userId);
    }
    // Also update participant state
    return {
      raisedHands: newRaisedHands,
      participants: state.participants.map(p =>
        p.userId === userId ? { ...p, hasRaisedHand: isRaised } : p
      ),
    };
  }),
  addScreenShare: (share) => set((state) => {
    const newScreenShares = new Map(state.screenShares);
    newScreenShares.set(share.userId, share);
    return { screenShares: newScreenShares };
  }),
  removeScreenShare: (userId) => set((state) => {
    const newScreenShares = new Map(state.screenShares);
    newScreenShares.delete(userId);
    return { screenShares: newScreenShares };
  }),
  setPinnedScreenShare: (userId) => set({ pinnedScreenShareUserId: userId }),
  setIsScreenSharing: (isSharing) => set({ isScreenSharing: isSharing }),
  setPermissionError: (kind, hasError) => set((state) => ({
    permissionErrors: {
      ...state.permissionErrors,
      [kind]: hasError,
    },
  })),
  clearPermissionErrors: () => set({
    permissionErrors: {
      audio: false,
      video: false,
    },
  }),
  setSelectedDevices: (devices) => set((state) => ({
    selectedDevices: { ...state.selectedDevices, ...devices },
  })),
  setSettings: (settings) => set((state) => ({
    settings: { ...state.settings, ...settings },
  })),
  setChatActiveConversation: (conversationId) => set((state) => {
    const conversations = new Map(state.chat.conversations);
    const messages = new Map(state.chat.messages);

    if (!conversations.has(conversationId)) {
      const conversation =
        conversationId === EVERYONE_CONVERSATION_ID
          ? createGroupConversation()
          : {
              id: conversationId,
              type: 'direct' as const,
              title: 'Direct message',
              participantIds: [],
              unreadCount: 0,
              nextCursor: null,
              hasMoreHistory: true,
            };
      conversations.set(conversationId, conversation);
      if (!messages.has(conversationId)) {
        messages.set(conversationId, []);
      }
    }

    const conversation = conversations.get(conversationId)!;
    conversations.set(conversationId, {
      ...conversation,
      unreadCount: 0,
    });

    return {
      chat: {
        ...state.chat,
        activeConversationId: conversationId,
        conversations,
        messages,
      },
    };
  }),
  ingestChatMessage: (message, options) => set((state) => {
    const conversations = new Map(state.chat.conversations);
    const messages = new Map(state.chat.messages);

    const { id: conversationId, type, title, otherParticipantId } = deriveConversationFromMessage(
      message,
      options?.currentUserId
    );

    if (!conversations.has(conversationId)) {
      const conversation =
        type === 'group'
          ? createGroupConversation()
          : {
              id: conversationId,
              type: 'direct' as const,
              title,
              participantIds: otherParticipantId ? [otherParticipantId] : [],
              unreadCount: 0,
              nextCursor: null,
              hasMoreHistory: true,
            };
      conversations.set(conversationId, conversation);
    }

    if (!messages.has(conversationId)) {
      messages.set(conversationId, []);
    }

    const existingConversation = conversations.get(conversationId)!;
    const existingMessages = messages.get(conversationId)!;

    const shouldMarkRead =
      options?.markAsRead ??
      (state.chat.activeConversationId === conversationId ||
        message.senderId === options?.currentUserId);

    const mergedMessages = upsertMessage(existingMessages, {
      ...message,
      status: message.status ?? 'sent',
    });
    messages.set(conversationId, mergedMessages);

    conversations.set(conversationId, {
      ...existingConversation,
      title: type === 'direct' ? title : existingConversation.title,
      participantIds:
        type === 'direct' && otherParticipantId
          ? existingConversation.participantIds.length
            ? existingConversation.participantIds
            : [otherParticipantId]
          : existingConversation.participantIds,
      unreadCount: shouldMarkRead ? 0 : existingConversation.unreadCount + 1,
      lastMessageAt: message.createdAt,
      lastMessagePreview: message.content,
    });

    return {
      chat: {
        ...state.chat,
        conversations,
        messages,
      },
    };
  }),
  addPendingChatMessage: (conversationId, message) => set((state) => {
    const conversations = new Map(state.chat.conversations);
    const messages = new Map(state.chat.messages);

    if (!conversations.has(conversationId)) {
      const conversation =
        conversationId === EVERYONE_CONVERSATION_ID
          ? createGroupConversation()
          : {
              id: conversationId,
              type: 'direct' as const,
              title: 'Direct message',
              participantIds: [],
              unreadCount: 0,
              nextCursor: null,
              hasMoreHistory: true,
            };
      conversations.set(conversationId, conversation);
    }

    if (!messages.has(conversationId)) {
      messages.set(conversationId, []);
    }

    const existingMessages = messages.get(conversationId)!;
    const mergedMessages = upsertMessage(existingMessages, {
      ...message,
      status: 'pending',
    });
    messages.set(conversationId, mergedMessages);

    return {
      chat: {
        ...state.chat,
        conversations,
        messages,
      },
    };
  }),
  resolvePendingChatMessage: (conversationId, clientMessageId, serverMessage) => set((state) => {
    const messages = state.chat.messages.get(conversationId);
    if (!messages) {
      return { chat: state.chat };
    }

    const updatedMessages = upsertMessage(messages, {
      ...serverMessage,
      clientMessageId,
      status: 'sent',
    });

    const messagesMap = new Map(state.chat.messages);
    messagesMap.set(conversationId, updatedMessages);

    const conversations = new Map(state.chat.conversations);
    const conversation = conversations.get(conversationId);
    if (conversation) {
      conversations.set(conversationId, {
        ...conversation,
        lastMessageAt: serverMessage.createdAt,
        lastMessagePreview: serverMessage.content,
      });
    }

    return {
      chat: {
        ...state.chat,
        conversations,
        messages: messagesMap,
      },
    };
  }),
  failPendingChatMessage: (conversationId, clientMessageId) => set((state) => {
    const messages = state.chat.messages.get(conversationId);
    if (!messages) {
      return { chat: state.chat };
    }

    const updatedMessages = messages.map((msg) =>
      msg.clientMessageId === clientMessageId
        ? { ...msg, status: 'failed' as const }
        : msg
    );

    const messagesMap = new Map(state.chat.messages);
    messagesMap.set(conversationId, sortMessages(updatedMessages));

    return {
      chat: {
        ...state.chat,
        messages: messagesMap,
      },
    };
  }),
  applyChatHistory: (conversationId, historyMessages, options) => set((state) => {
    const conversations = new Map(state.chat.conversations);
    const messages = new Map(state.chat.messages);

    if (!conversations.has(conversationId)) {
      const conversation =
        conversationId === EVERYONE_CONVERSATION_ID
          ? createGroupConversation()
          : {
              id: conversationId,
              type: 'direct' as const,
              title: 'Direct message',
              participantIds: [],
              unreadCount: 0,
              nextCursor: null,
              hasMoreHistory: true,
            };
      conversations.set(conversationId, conversation);
    }

    const existingMessages = messages.get(conversationId) ?? [];
    const mergedMessages = mergeMessages(historyMessages, existingMessages);
    messages.set(conversationId, mergedMessages);

    const conversation = conversations.get(conversationId)!;
    const nextCursor = options?.nextCursor ?? conversation.nextCursor;
    const hasMore =
      options?.hasMore !== undefined ? options.hasMore : Boolean(nextCursor);

    conversations.set(conversationId, {
      ...conversation,
      nextCursor,
      hasMoreHistory: hasMore,
    });

    return {
      chat: {
        ...state.chat,
        conversations,
        messages,
      },
    };
  }),
  ensureChatConversation: (conversation) => set((state) => {
    const conversations = new Map(state.chat.conversations);
    const messages = new Map(state.chat.messages);

    if (!conversations.has(conversation.id)) {
      conversations.set(conversation.id, conversation);
    } else {
      conversations.set(conversation.id, {
        ...conversations.get(conversation.id)!,
        ...conversation,
      });
    }

    if (!messages.has(conversation.id)) {
      messages.set(conversation.id, []);
    }

    return {
      chat: {
        ...state.chat,
        conversations,
        messages,
      },
    };
  }),
  updateNetworkQuality: (samples) => set((state) => {
    if (!samples || samples.length === 0) {
      return { networkQuality: state.networkQuality };
    }

    const updated = new Map(state.networkQuality);

    for (const sample of samples) {
      if (!sample || !sample.userId) {
        continue;
      }

      const summary: NetworkQualitySummary = {
        level: sample.quality ?? 'unknown',
        bitrateKbps: Number.isFinite(sample.bitrateKbps) ? Math.max(0, Math.round(sample.bitrateKbps)) : 0,
        packetLoss: Number.isFinite(sample.packetLoss) ? Math.max(0, Number(sample.packetLoss.toFixed(2))) : 0,
        jitter: Number.isFinite(sample.jitter) ? Math.max(0, Number(sample.jitter.toFixed(2))) : 0,
        rtt: Number.isFinite(sample.rtt) ? Math.max(0, Math.round(sample.rtt)) : 0,
        kind: sample.kind,
        lastUpdated: sample.timestamp ?? Date.now(),
      };

      const existing = updated.get(sample.userId);
      const base: NetworkQualityAggregate = existing
        ? {
            upstream: existing.upstream,
            downstream: existing.downstream,
            lastUpdated: existing.lastUpdated,
          }
        : {
            upstream: null,
            downstream: null,
            lastUpdated: 0,
          };

      const next: NetworkQualityAggregate = {
        upstream:
          sample.direction === 'upstream'
            ? updateDirectionSummary(base.upstream, summary)
            : base.upstream,
        downstream:
          sample.direction === 'downstream'
            ? updateDirectionSummary(base.downstream, summary)
            : base.downstream,
        lastUpdated: Math.max(base.lastUpdated, summary.lastUpdated),
      };

      updated.set(sample.userId, next);
    }

    return {
      ...state,
      networkQuality: updated,
    };
  }),
  clearNetworkQuality: () => set((state) => ({
    ...state,
    networkQuality: new Map<string, NetworkQualityAggregate>(),
  })),
  setHostControls: (controls) => set((state) => ({
    ...state,
    hostControls: {
      ...state.hostControls,
      ...controls,
      updatedAt: controls.updatedAt ?? new Date().toISOString(),
    },
  })),
  applyParticipantForceState: (userId, state) => set((existingState) => {
    const participant = existingState.participants.find(p => p.userId === userId);
    if (!participant) {
      return existingState;
    }

    const audioForced = state.audio ? state.audio.forced : participant.isAudioForceMuted;
    const videoForced = state.video ? state.video.forced : participant.isVideoForceMuted;

    const updatedParticipant: Participant = {
      ...participant,
      isAudioMuted:
        state.audio && typeof state.audio.muted === 'boolean'
          ? state.audio.muted
          : participant.isAudioMuted,
      isVideoMuted:
        state.video && typeof state.video.muted === 'boolean'
          ? state.video.muted
          : participant.isVideoMuted,
      isAudioForceMuted: audioForced,
      isVideoForceMuted: videoForced,
      audioForceMutedAt:
        state.audio && state.audio.timestamp !== undefined
          ? state.audio.timestamp
          : participant.audioForceMutedAt ?? null,
      videoForceMutedAt:
        state.video && state.video.timestamp !== undefined
          ? state.video.timestamp
          : participant.videoForceMutedAt ?? null,
      audioForceMutedBy:
        state.audio && state.audio.forcedBy !== undefined
          ? state.audio.forcedBy ?? null
          : participant.audioForceMutedBy ?? null,
      videoForceMutedBy:
        state.video && state.video.forcedBy !== undefined
          ? state.video.forcedBy ?? null
          : participant.videoForceMutedBy ?? null,
      forceMuteReason:
        state.audio?.reason ??
        state.video?.reason ??
        (!audioForced && !videoForced ? null : participant.forceMuteReason ?? null),
    };

    const updatedParticipants = existingState.participants.map(p =>
      p.userId === userId ? updatedParticipant : p
    );

    const updatedScreenShares = new Map(existingState.screenShares);
    if (videoForced && existingState.screenShares.has(userId)) {
      updatedScreenShares.delete(userId);
    }

    return {
      ...existingState,
      participants: updatedParticipants,
      screenShares: updatedScreenShares,
    };
  }),
  resetCallState: () => set({
    isConnected: false,
    roomCode: null,
    participants: [],
    localStream: null,
    isAudioMuted: false,
    isVideoMuted: false,
    isAdmin: false,
    roomIsPublic: true,
    pendingRequests: [],
    activeSpeakerId: null,
    raisedHands: new Set<string>(),
    screenShares: new Map<string, ScreenShare>(),
    pinnedScreenShareUserId: null,
    isScreenSharing: false,
    permissionErrors: {
      audio: false,
      video: false,
    },
    selectedDevices: {
      audioInput: '',
      videoInput: '',
      audioOutput: '',
    },
    settings: {
      joinWithAudio: true,
      joinWithVideo: true,
    },
    chat: {
      activeConversationId: EVERYONE_CONVERSATION_ID,
      conversations: new Map<string, ChatConversation>([
        [EVERYONE_CONVERSATION_ID, createGroupConversation()],
      ]),
      messages: new Map<string, ChatMessage[]>([
        [EVERYONE_CONVERSATION_ID, []],
      ]),
    },
    networkQuality: new Map<string, NetworkQualityAggregate>(),
    hostControls: {
      locked: false,
      lockedBy: null,
      lockedReason: null,
      audioForceAll: false,
      audioForcedBy: null,
      audioForceReason: null,
      videoForceAll: false,
      videoForcedBy: null,
      videoForceReason: null,
      chatForceAll: false,
      chatForcedBy: null,
      chatForceReason: null,
      updatedAt: null,
    },
  }),
}));

