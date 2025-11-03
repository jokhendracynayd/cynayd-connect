# Sprint 4: Core Features

**Duration**: 2 weeks (Week 7-8)
**Team**: 1-2 Frontend Engineers + 1 Backend Engineer
**Prerequisites**: Sprint 3 completed (Basic video calling working)

## Overview

Enhance the video calling experience with production-ready features including screen sharing, text chat, participant management, network quality indicators, and device selection. This sprint focuses on making the application truly usable for real-world scenarios.

## Goals

### Primary Goals
1. Implement screen sharing (desktop/window/app)
2. Add text chat with message history
3. Enhanced participant list with avatars and status
4. Device selection (camera/microphone/speaker)
5. Network quality indicators
6. Mute/unmute all participants (host)
7. Recording capabilities (optional)
8. Better error handling and reconnection

### Success Criteria
- [ ] Users can share their screen
- [ ] Chat messages persist during session
- [ ] Users can select preferred devices
- [ ] Network quality shown to users
- [ ] 5+ users can be in a room
- [ ] Host can control participants
- [ ] Reconnection on network loss
- [ ] Zero crashes during 1-hour call

## Features

### 1. Screen Sharing

**Requirements**:
- Share entire screen
- Share specific window
- Share browser tab
- Toggle screen share on/off
- Multiple participants can share (optional)
- Clear indication who is sharing

**Implementation**:

```typescript
// src/lib/media.ts additions
async startScreenShare() {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    
    // Create new producer for screen share
    const track = stream.getVideoTracks()[0];
    const producer = await this.sendTransport?.produce({ track });
    
    // Handle stop screen share
    track.onended = () => {
      this.stopScreenShare();
    };
    
    return producer;
  } catch (error) {
    console.error('Screen share failed:', error);
    throw error;
  }
}

stopScreenShare() {
  // Stop producer and cleanup
}
```

**UI Component**:
```typescript
// src/components/call/ScreenShareControl.tsx
import { useState } from 'react';
import { ShareIcon, StopIcon } from '@heroicons/react/outline';

export default function ScreenShareControl() {
  const [isSharing, setIsSharing] = useState(false);
  const { startScreenShare, stopScreenShare } = useCallStore();

  const handleToggle = async () => {
    if (isSharing) {
      await stopScreenShare();
      setIsSharing(false);
    } else {
      await startScreenShare();
      setIsSharing(true);
    }
  };

  return (
    <button
      onClick={handleToggle}
      className={isSharing ? 'bg-red-600' : 'bg-gray-600'}
    >
      {isSharing ? <StopIcon /> : <ShareIcon />}
      {isSharing ? 'Stop Sharing' : 'Share Screen'}
    </button>
  );
}
```

### 2. Text Chat

**Requirements**:
- Send/receive messages in real-time
- Message history during session
- Emoji support (optional)
- System messages (user joined/left)
- Timestamped messages
- Unread indicator

**Backend Handler** (already exists):
```typescript
// Already implemented in signaling/handlers/chat.handler.ts
socket.on('chat', (data: { message: string }) => {
  io.to(roomCode).emit('chat', {
    message: data.message,
    name: userName,
    userId,
    timestamp: new Date().toISOString(),
  });
});
```

**Frontend Chat Panel**:
```typescript
// src/components/call/ChatPanel.tsx
import { useState, useEffect, useRef } from 'react';
import { useCallStore } from '../../store/callStore';

interface Message {
  id: string;
  message: string;
  name: string;
  userId: string;
  timestamp: string;
  isSystem: boolean;
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { socket, currentUser } = useCallStore();

  useEffect(() => {
    socket.on('chat', (message: any) => {
      setMessages(prev => [...prev, { ...message, id: Date.now().toString() }]);
    });

    socket.on('user-joined', (data: any) => {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        message: `${data.name} joined the call`,
        name: 'System',
        userId: 'system',
        timestamp: new Date().toISOString(),
        isSystem: true,
      }]);
    });

    return () => {
      socket.off('chat');
      socket.off('user-joined');
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    
    socket.emit('chat', { message: input });
    setInput('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map(msg => (
          <div key={msg.id} className={msg.isSystem ? 'text-center text-gray-500 text-sm' : ''}>
            {!msg.isSystem && <span className="font-semibold">{msg.name}: </span>}
            {msg.message}
            <span className="text-xs text-gray-400 ml-2">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="border-t p-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
          className="w-full border rounded px-3 py-2"
        />
      </div>
    </div>
  );
}
```

### 3. Enhanced Participant List

**Requirements**:
- Avatar for each participant
- Name and status
- Mute/unmute indicator
- Video on/off indicator
- Network quality
- Speaking indicator
- Role (host/participant)
- Remove/kick participant (host only)

**Component**:
```typescript
// src/components/call/ParticipantList.tsx
import { UserCircleIcon, MicIcon, VideoCameraIcon, WifiIcon } from '@heroicons/react/outline';

interface Participant {
  userId: string;
  name: string;
  picture?: string;
  isAudioMuted: boolean;
  isVideoMuted: boolean;
  isSpeaking: boolean;
  networkQuality: number; // 0-5
  role: 'host' | 'participant';
}

export default function ParticipantList({ participants, currentUser }: any) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold mb-3">Participants ({participants.length})</h3>
      <div className="space-y-2">
        {participants.map((p: Participant) => (
          <div key={p.userId} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded">
            <div className="flex items-center space-x-3">
              {p.picture ? (
                <img src={p.picture} alt={p.name} className="w-10 h-10 rounded-full" />
              ) : (
                <UserCircleIcon className="w-10 h-10 text-gray-400" />
              )}
              <div>
                <p className="font-medium">{p.name}</p>
                <div className="flex items-center space-x-2 text-gray-500">
                  {p.isSpeaking && <span className="text-green-500">●</span>}
                  {p.isAudioMuted && <MicIcon className="w-4 h-4" />}
                  {p.isVideoMuted && <VideoCameraIcon className="w-4 h-4" />}
                  <WifiIcon className={`w-4 h-4 ${p.networkQuality >= 4 ? 'text-green-500' : 'text-orange-500'}`} />
                </div>
              </div>
            </div>
            {p.userId === currentUser?.userId && <span className="text-xs text-blue-600">You</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

### 4. Device Selection

**Requirements**:
- List available cameras
- List available microphones
- List available speakers
- Switch devices during call
- Remember preference
- Test before joining

**Component**:
```typescript
// src/components/call/DeviceSelector.tsx
import { useState, useEffect } from 'react';

export default function DeviceSelector() {
  const [devices, setDevices] = useState({ cameras: [], microphones: [], speakers: [] });
  const [selected, setSelected] = useState({ camera: '', microphone: '', speaker: '' });

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    const deviceList = await navigator.mediaDevices.enumerateDevices();
    
    setDevices({
      cameras: deviceList.filter(d => d.kind === 'videoinput'),
      microphones: deviceList.filter(d => d.kind === 'audioinput'),
      speakers: deviceList.filter(d => d.kind === 'audiooutput'),
    });
  };

  const handleDeviceChange = async (kind: string, deviceId: string) => {
    setSelected(prev => ({ ...prev, [kind]: deviceId }));
    
    // Switch media track
    if (kind === 'camera' || kind === 'microphone') {
      // TODO: Replace track in producer
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="font-semibold mb-3">Devices</h3>
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-1">Camera</label>
          <select
            value={selected.camera}
            onChange={(e) => handleDeviceChange('camera', e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            {devices.cameras.map((cam: any) => (
              <option key={cam.deviceId} value={cam.deviceId}>{cam.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Microphone</label>
          <select
            value={selected.microphone}
            onChange={(e) => handleDeviceChange('microphone', e.target.value)}
            className="w-full border rounded px-3 py-2"
          >
            {devices.microphones.map((mic: any) => (
              <option key={mic.deviceId} value={mic.deviceId}>{mic.label}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
```

### 5. Network Quality Indicators

**Requirements**:
- Show connection quality (upload/download)
- Show latency
- Show jitter
- Visual indicator (good/warning/poor)
- Auto-adjust quality
- Show reconnection status

**Implementation**:
```typescript
// src/lib/media.ts additions
class NetworkMonitor {
  private interval: any;
  
  startMonitoring(producer: Producer, consumer: Consumer) {
    this.interval = setInterval(async () => {
      const stats = await producer.getStats();
      const [audioStats] = stats;
      
      // Calculate packet loss, jitter, etc.
      const quality = this.calculateQuality(audioStats);
      
      // Emit to UI
      socketManager.emit('network-quality', { quality });
    }, 5000);
  }
  
  stopMonitoring() {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }
  
  private calculateQuality(stats: any): 'good' | 'warning' | 'poor' {
    // Analyze packet loss, jitter, etc.
    if (stats.packetsLost > 10) return 'poor';
    if (stats.packetsLost > 5) return 'warning';
    return 'good';
  }
}
```

**UI Indicator**:
```typescript
// src/components/call/NetworkIndicator.tsx
import { WifiIcon } from '@heroicons/react/outline';

export default function NetworkIndicator({ quality }: { quality: 'good' | 'warning' | 'poor' }) {
  const colors = {
    good: 'text-green-500',
    warning: 'text-orange-500',
    poor: 'text-red-500',
  };
  
  return (
    <div className="flex items-center space-x-1">
      <WifiIcon className={`w-5 h-5 ${colors[quality]}`} />
      <span className="text-xs capitalize">{quality}</span>
    </div>
  );
}
```

### 6. Mute All (Host Control)

**Requirements**:
- Host can mute all participants
- Host can unmute all
- Participants can self-unmute after host mute
- Visual indicator
- Toast notifications

**Backend Handler**:
```typescript
// Add to signaling/handlers/room.handler.ts
socket.on('mute-all', async (data: { mute: boolean }) => {
  const { userId, roomCode } = socket.data;
  
  // Verify user is host
  const room = await RoomService.getRoom(roomCode);
  if (room.adminId !== userId) {
    return socket.emit('error', { message: 'Only host can mute all' });
  }
  
  // Broadcast to all participants
  socket.to(roomCode).emit('mute-all', { mute: data.mute });
});
```

**Frontend Component**:
```typescript
// src/components/call/MuteAllControl.tsx
export default function MuteAllControl({ isHost }: { isHost: boolean }) {
  const { socket } = useCallStore();
  
  if (!isHost) return null;
  
  const handleMuteAll = () => {
    socket.emit('mute-all', { mute: true });
    toast.success('All participants muted');
  };
  
  const handleUnmuteAll = () => {
    socket.emit('mute-all', { mute: false });
    toast.success('All participants unmuted');
  };
  
  return (
    <div>
      <button onClick={handleMuteAll}>Mute All</button>
      <button onClick={handleUnmuteAll}>Unmute All</button>
    </div>
  );
}
```

## Implementation Plan

### Week 1 (Days 1-5)

**Day 1-2**: Screen Sharing
- Backend: Add screen share producer handling
- Frontend: Screen share UI and controls
- Testing: 2 users test screen sharing

**Day 3**: Text Chat
- Backend: Already implemented, test
- Frontend: Chat panel UI
- Testing: Message flow

**Day 4**: Enhanced Participant List
- Frontend: Participant list component
- Backend: Emit participant updates
- Testing: UI updates correctly

**Day 5**: Device Selection
- Frontend: Device selector component
- Frontend: Device switching logic
- Testing: Switch devices during call

### Week 2 (Days 6-10)

**Day 6**: Network Quality
- Frontend: Monitor network stats
- Frontend: Display indicators
- Backend: Emit stats updates

**Day 7**: Host Controls
- Backend: Mute all implementation
- Frontend: Host control UI
- Testing: Host can control participants

**Day 8-9**: Polish & Integration
- Integrate all features
- Fix UI/UX issues
- Performance optimization
- Responsive design fixes

**Day 10**: Testing & Bug Fixes
- Multi-user testing (5+ users)
- Cross-browser testing
- Bug fixes
- Documentation

## Deliverables

### Code
- [ ] Screen sharing working
- [ ] Text chat functional
- [ ] Participant list enhanced
- [ ] Device selection working
- [ ] Network indicators showing
- [ ] Host controls working
- [ ] Error handling improved
- [ ] Reconnection logic working

### Testing
- [ ] 5 users in room works
- [ ] Screen sharing stable
- [ ] Chat messages reliable
- [ ] Device switching works
- [ ] Network issues handled gracefully

## Success Metrics

- ✅ 10+ users can join room
- ✅ Screen share quality good
- ✅ Chat messages never lost
- ✅ Device switching seamless
- ✅ Network issues detected
- ✅ No crashes during 1-hour session

## Next Sprint

Sprint 5 will focus on:
- Performance optimization
- Advanced features (polls, reactions)
- Production deployment
- Security hardening
- Final polish and testing

