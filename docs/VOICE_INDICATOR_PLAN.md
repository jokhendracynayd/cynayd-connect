# Voice Indicator (Active Speaker Detection) - Implementation Plan

## Overview

Implement automatic active speaker detection with audio level monitoring, performance optimizations, and environment-based configuration toggle.

## Current Status

**60% Complete** - UI and state management ready, detection logic missing.

**What Works:**
- ✅ Backend handler receives and broadcasts events
- ✅ Frontend listener updates state correctly
- ✅ UI indicators show active speaker (blue ring, badge)
- ✅ State management tracks `activeSpeakerId`

**What's Missing:**
- ❌ Automatic audio detection logic
- ❌ Audio level monitoring
- ❌ Socket emission method
- ❌ Performance optimizations
- ❌ Configuration toggle

---

## Architecture Design

### Detection Method: WebRTC Stats + AudioContext Hybrid

**Why Hybrid Approach:**
1. **WebRTC Stats** - Lower CPU, detects network-level audio activity
2. **AudioContext** - More accurate, detects actual audio levels
3. **Combined** - Best balance of performance and accuracy

### Components

```
┌─────────────────────────────────────────────────┐
│  ActiveSpeakerDetector (lib/activeSpeaker.ts)  │
├─────────────────────────────────────────────────┤
│  - Monitors all audio consumers                 │
│  - Uses WebRTC stats (primary)                  │
│  - Falls back to AudioContext (if enabled)      │
│  - Throttled updates (500-1000ms)              │
│  - Debounced emissions (only on state change)   │
│  - Automatic cleanup on participant leave      │
└─────────────────────────────────────────────────┘
         │
         ├───> SocketManager.emitActiveSpeaker()
         └───> Updates Call.tsx state via socket events
```

---

## Implementation Steps

### Step 1: Add Configuration

**File**: `apps/frontend/src/config/index.ts`

Add feature flags:
```typescript
export const config = {
  apiUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  socketUrl: import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000',
  signalingPath: '/socket',
  
  // Voice Indicator Configuration
  features: {
    voiceIndicator: {
      enabled: import.meta.env.VITE_ENABLE_VOICE_INDICATOR !== 'false', // Default: true
      method: (import.meta.env.VITE_VOICE_INDICATOR_METHOD || 'stats') as 'stats' | 'audiocontext' | 'hybrid',
      updateInterval: parseInt(import.meta.env.VITE_VOICE_UPDATE_INTERVAL || '500', 10), // ms
      debounceDelay: parseInt(import.meta.env.VITE_VOICE_DEBOUNCE_DELAY || '200', 10), // ms
      audioThreshold: parseFloat(import.meta.env.VITE_VOICE_THRESHOLD || '-50'), // dB
      silenceThreshold: parseFloat(import.meta.env.VITE_VOICE_SILENCE_THRESHOLD || '-60'), // dB
    },
  },
};
```

**Environment Variables**:
- `VITE_ENABLE_VOICE_INDICATOR=true/false` - Master toggle
- `VITE_VOICE_INDICATOR_METHOD=stats/audiocontext/hybrid` - Detection method
- `VITE_VOICE_UPDATE_INTERVAL=500` - How often to check (ms)
- `VITE_VOICE_DEBOUNCE_DELAY=200` - Debounce emission delay (ms)
- `VITE_VOICE_THRESHOLD=-50` - dB threshold for speaking
- `VITE_VOICE_SILENCE_THRESHOLD=-60` - dB threshold for silence

---

### Step 2: Create ActiveSpeakerDetector Service

**File**: `apps/frontend/src/lib/activeSpeaker.ts` (NEW)

**Class Structure**:
```typescript
class ActiveSpeakerDetector {
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private audioContexts: Map<string, AudioContext> = new Map();
  private analysers: Map<string, AnalyserNode> = new Map();
  private currentSpeakers: Map<string, boolean> = new Map(); // userId -> isSpeaking
  private emissionQueue: Map<string, NodeJS.Timeout> = new Map(); // Debounce queue
  
  // Start monitoring a participant's audio
  startMonitoring(userId: string, audioTrack: MediaStreamTrack, consumerId: string): void
  
  // Stop monitoring a participant
  stopMonitoring(userId: string): void
  
  // Clean up all monitoring
  cleanup(): void
  
  // Private: Monitor using WebRTC stats
  private monitorWithStats(userId: string, consumerId: string): void
  
  // Private: Monitor using AudioContext
  private monitorWithAudioContext(userId: string, audioTrack: MediaStreamTrack): void
  
  // Private: Calculate audio level from stats
  private getAudioLevelFromStats(stats: any): number | null
  
  // Private: Calculate audio level from AudioContext
  private getAudioLevelFromAnalyser(analyser: AnalyserNode): number
  
  // Private: Emit active speaker event (debounced)
  private emitActiveSpeaker(userId: string, isActive: boolean): void
}
```

**Key Features**:
1. **Automatic cleanup** - Removes intervals and AudioContexts when participant leaves
2. **Throttled monitoring** - Configurable interval (default 500ms)
3. **Debounced emissions** - Only emit on state change
4. **Graceful degradation** - Falls back if AudioContext unavailable
5. **Memory efficient** - Reuses AudioContext when possible

---

### Step 3: Add Socket Emission Method

**File**: `apps/frontend/src/lib/socket.ts`

Add method:
```typescript
emitActiveSpeaker(isActiveSpeaker: boolean): void {
  if (!this.socket) return;
  this.socket.emit('active-speaker', { 
    uid: (this.socket as any).data?.userId || '',
    isActiveSpeaker 
  });
}
```

---

### Step 4: Integrate Detector in Call.tsx

**File**: `apps/frontend/src/pages/Call.tsx`

**Changes**:
1. Import `ActiveSpeakerDetector` and config
2. Create detector instance (useRef)
3. Start monitoring when consuming audio producers
4. Stop monitoring when participant leaves
5. Cleanup on unmount/leave

**Integration Points**:
- In `consumeProducer()` - Start monitoring when audio track received
- In `setupEventListeners()` - No changes needed (already listens)
- In `leaveRoom()` - Stop all monitoring
- In cleanup useEffect - Cleanup detector

---

### Step 5: Add Performance Optimizations

**Optimizations**:
1. **Throttling**: Only check audio levels every 500ms (configurable)
2. **Debouncing**: Only emit socket events on state change (200ms delay)
3. **Lazy AudioContext**: Create only when needed, reuse when possible
4. **Cleanup**: Proper disposal of intervals, AudioContext, AnalyserNodes
5. **Early Exit**: Skip monitoring if feature disabled or user muted

---

## Detailed Implementation

### File: `apps/frontend/src/lib/activeSpeaker.ts`

**Implementation Details**:

1. **WebRTC Stats Method** (Primary, Lower CPU):
   - Use `consumer.getStats()` every 500ms
   - Extract `audioLevel` or `totalAudioEnergy` from stats
   - Compare against threshold

2. **AudioContext Method** (Fallback, More Accurate):
   - Create `AudioContext` per audio track
   - Create `AnalyserNode` with FFT size 256
   - Use `getByteFrequencyData()` or `getByteTimeDomainData()`
   - Calculate RMS (Root Mean Square) for audio level
   - Convert to dB: `20 * log10(rms / max)`

3. **Hybrid Method** (Best Balance):
   - Use WebRTC stats as primary
   - Use AudioContext for confirmation when stats unclear
   - Fallback gracefully if either fails

**Error Handling**:
- Try WebRTC stats first
- If stats unavailable, try AudioContext
- If both fail, log warning and disable detection for that participant
- Don't crash the application

**Performance**:
- Monitor max 1 time per 500ms per participant
- Only calculate when participant not muted
- Stop monitoring immediately when participant leaves
- Dispose AudioContext properly to prevent memory leaks

---

### File: `apps/frontend/src/pages/Call.tsx`

**Integration Points**:

1. **In consumeProducer()** (around line 781):
   ```typescript
   if (kind === 'audio' && track) {
     activeSpeakerDetectorRef.current.startMonitoring(userId, track, producerId);
   }
   ```

2. **In removeParticipant handler**:
   ```typescript
   activeSpeakerDetectorRef.current.stopMonitoring(userId);
   ```

3. **In leaveRoom()**:
   ```typescript
   activeSpeakerDetectorRef.current.cleanup();
   ```

4. **Add ref and initialization**:
   ```typescript
   const activeSpeakerDetectorRef = useRef(new ActiveSpeakerDetector(socketManager, config.features.voiceIndicator));
   ```

---

## Configuration Examples

### Development (Performance Testing):
```env
VITE_ENABLE_VOICE_INDICATOR=true
VITE_VOICE_INDICATOR_METHOD=stats
VITE_VOICE_UPDATE_INTERVAL=1000
VITE_VOICE_DEBOUNCE_DELAY=300
```

### Production (Optimized):
```env
VITE_ENABLE_VOICE_INDICATOR=true
VITE_VOICE_INDICATOR_METHOD=hybrid
VITE_VOICE_UPDATE_INTERVAL=500
VITE_VOICE_DEBOUNCE_DELAY=200
```

### Disabled:
```env
VITE_ENABLE_VOICE_INDICATOR=false
```

---

## Performance Metrics

### Expected Performance Impact:

**With Optimizations**:
- CPU: < 3% per participant (with throttling)
- Memory: ~50KB per participant (AudioContext + AnalyserNode)
- Network: Minimal (only emits on state change, debounced)
- Battery: Low impact (throttled monitoring)

**Without Optimizations** (if implemented poorly):
- CPU: 15-20% per participant (continuous monitoring)
- Memory: Memory leaks (uncleaned intervals)
- Network: Spam (frequent emissions)
- Battery: High drain

---

## Testing Strategy

### Unit Tests:
1. Audio level calculation accuracy
2. Threshold detection logic
3. Debouncing behavior
4. Cleanup functionality

### Integration Tests:
1. Start/stop monitoring on participant join/leave
2. Socket emission on active speaker change
3. UI updates correctly
4. Multiple participants simultaneously

### Performance Tests:
1. 10+ participants with detection enabled
2. CPU usage monitoring
3. Memory leak detection
4. Battery consumption

---

## Error Handling

### Scenarios to Handle:

1. **AudioContext creation fails**:
   - Fallback to WebRTC stats only
   - Log warning, continue with stats

2. **getStats() unavailable**:
   - Fallback to AudioContext
   - If both fail, disable for that participant

3. **Track becomes unavailable**:
   - Stop monitoring immediately
   - Clean up resources

4. **Feature disabled in config**:
   - Skip all initialization
   - No performance impact

---

## Rollout Strategy

### Phase 1: Basic Implementation
- Implement WebRTC stats method only
- Add configuration toggle
- Test with 2-3 users

### Phase 2: Optimization
- Add AudioContext fallback
- Implement hybrid method
- Optimize performance

### Phase 3: Production
- Enable by default in production
- Monitor performance
- Fine-tune thresholds

---

## Files to Create/Modify

### New Files:
1. `apps/frontend/src/lib/activeSpeaker.ts` - Detector service

### Modified Files:
1. `apps/frontend/src/config/index.ts` - Add feature configuration
2. `apps/frontend/src/lib/socket.ts` - Add emitActiveSpeaker method
3. `apps/frontend/src/pages/Call.tsx` - Integrate detector
4. `apps/frontend/.env.example` - Add new env variables (if exists)

---

## Success Criteria

✅ Feature works automatically (no manual triggering needed)
✅ Performance impact < 5% CPU per participant
✅ No memory leaks (proper cleanup)
✅ Configurable on/off via environment variable
✅ Works in both development and production
✅ Graceful degradation if detection fails
✅ UI updates smoothly without jank
✅ Handles 10+ participants simultaneously

---

## Implementation Priority

**Priority: Medium-High**
- Not critical for basic functionality
- Significant UX improvement
- Performance-conscious implementation required

**Estimated Time**: 6-8 hours
- Detection logic: 3-4 hours
- Integration: 2 hours
- Testing & optimization: 1-2 hours

---

## Notes

- Use `requestAnimationFrame` instead of `setInterval` for better performance (optional optimization)
- Consider using Web Workers for audio processing if CPU impact is too high (future optimization)
- Monitor real-world performance and adjust thresholds based on usage data
- Can be disabled per-environment for testing/development

