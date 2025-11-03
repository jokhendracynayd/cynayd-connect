import { create } from 'zustand';

interface Participant {
  userId: string;
  name: string;
  email: string;
  picture?: string;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isSpeaking: boolean;
}

interface CallState {
  isConnected: boolean;
  roomCode: string | null;
  participants: Participant[];
  localStream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
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
  setSelectedDevices: (devices: Partial<CallState['selectedDevices']>) => void;
  setSettings: (settings: Partial<CallState['settings']>) => void;
}

export const useCallStore = create<CallState>((set) => ({
  isConnected: false,
  roomCode: null,
  participants: [],
  localStream: null,
  isAudioMuted: false,
  isVideoMuted: false,
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
    return {
      participants: [...state.participants, participant],
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
  setSelectedDevices: (devices) => set((state) => ({
    selectedDevices: { ...state.selectedDevices, ...devices },
  })),
  setSettings: (settings) => set((state) => ({
    settings: { ...state.settings, ...settings },
  })),
}));

