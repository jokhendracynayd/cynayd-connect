import { create } from 'zustand';

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
  isSpeaking: boolean;
  isAdmin: boolean;
  hasRaisedHand: boolean;
}

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
  selectedDevices: {
    audioInput: string;
    videoInput: string;
    audioOutput: string;
  };
  settings: {
    joinWithAudio: boolean;
    joinWithVideo: boolean;
  };
  setRoomCode: (code: string) => void;
  setIsConnected: (connected: boolean) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setParticipants: (participants: Participant[]) => void;
  addParticipant: (participant: Participant) => void;
  removeParticipant: (userId: string) => void;
  updateParticipant: (userId: string, updates: Partial<Participant>) => void;
  toggleAudio: () => void;
  toggleVideo: () => void;
  setIsAdmin: (isAdmin: boolean) => void;
  setRoomIsPublic: (isPublic: boolean) => void;
  setPendingRequests: (requests: RoomJoinRequest[]) => void;
  addPendingRequest: (request: RoomJoinRequest) => void;
  removePendingRequest: (requestId: string) => void;
  setActiveSpeaker: (userId: string | null) => void;
  toggleRaiseHand: () => void;
  setRaiseHand: (userId: string, isRaised: boolean) => void;
  setSelectedDevices: (devices: Partial<CallState['selectedDevices']>) => void;
  setSettings: (settings: Partial<CallState['settings']>) => void;
  resetCallState: () => void;
}

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
  selectedDevices: {
    audioInput: '',
    videoInput: '',
    audioOutput: '',
  },
  settings: {
    joinWithAudio: true,
    joinWithVideo: true,
  },
  
  setRoomCode: (code) => set({ roomCode: code }),
  setIsConnected: (connected) => set({ isConnected: connected }),
  setLocalStream: (stream) => set({ localStream: stream }),
  setParticipants: (participants) => set({ participants }),
  addParticipant: (participant) => set((state) => {
    // Check if participant already exists to prevent duplicates
    const exists = state.participants.some(p => p.userId === participant.userId);
    if (exists) {
      // Update existing participant instead of adding duplicate
      return {
        participants: state.participants.map(p =>
          p.userId === participant.userId ? { ...p, ...participant } : p
        ),
      };
    }
    // Ensure default values for new fields
    const newParticipant: Participant = {
      ...participant,
      isAdmin: participant.isAdmin ?? false,
      hasRaisedHand: participant.hasRaisedHand ?? false,
    };
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
  setSelectedDevices: (devices) => set((state) => ({
    selectedDevices: { ...state.selectedDevices, ...devices },
  })),
  setSettings: (settings) => set((state) => ({
    settings: { ...state.settings, ...settings },
  })),
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
    selectedDevices: {
      audioInput: '',
      videoInput: '',
      audioOutput: '',
    },
    settings: {
      joinWithAudio: true,
      joinWithVideo: true,
    },
  }),
}));

