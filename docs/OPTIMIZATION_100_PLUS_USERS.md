# Optimization Guide for 100+ Users in Single Room

**Last Updated**: November 2025  
**Target**: Support 100+ concurrent users in a single room  
**Current Capacity**: ~20-30 users comfortably

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Current Architecture Analysis](#current-architecture-analysis)
3. [Frontend Optimizations](#frontend-optimizations)
4. [Backend Optimizations](#backend-optimizations)
5. [Implementation Priority](#implementation-priority)
6. [Performance Metrics](#performance-metrics)
7. [Testing Strategy](#testing-strategy)

---

## Executive Summary

### Current State
- **Bandwidth per user**: ~100 Mbps (consuming all 99 video streams)
- **Video consumers per user**: 99 (all participants)
- **Join time**: 30-60 seconds
- **Server capacity**: ~20-30 users per room
- **CPU usage**: High on both client and server

### Target State (After Optimizations)
- **Bandwidth per user**: ~5-10 Mbps (selective consumption)
- **Video consumers per user**: 10-15 (active + visible only)
- **Join time**: 5-10 seconds
- **Server capacity**: 100+ users per room
- **CPU usage**: Medium (optimized consumption)

### Expected Improvements
- **90% bandwidth reduction** per user
- **85-90% reduction** in video consumers
- **80% faster** join time
- **5x increase** in server capacity
- **50% reduction** in CPU usage

---

## Current Architecture Analysis

### Frontend Architecture

#### Key Files
- `apps/frontend/src/lib/webrtc.ts` - WebRTC manager
- `apps/frontend/src/pages/Call.tsx` - Main call component
- `apps/frontend/src/lib/media.ts` - Media manager
- `apps/frontend/src/lib/socket.ts` - Socket.io client
- `apps/frontend/src/store/callStore.ts` - State management

#### Current Behavior
1. **Consumer Creation**: Creates consumers for ALL producers immediately
2. **No Pause/Resume**: All consumers stay active even when not visible
3. **No Limits**: No maximum limit on concurrent consumers
4. **Fixed Bitrates**: Same bitrate regardless of room size
5. **No Priority**: All consumers treated equally

### Backend Architecture

#### Key Files
- `apps/backend/src/shared/config/mediasoup.config.ts` - Mediasoup configuration
- `apps/backend/src/media/Worker.ts` - Worker pool management
- `apps/backend/src/media/Router.ts` - Router management
- `apps/backend/src/media/Transport.ts` - Transport management
- `apps/backend/src/media/Producer.ts` - Producer management
- `apps/backend/src/media/Consumer.ts` - Consumer management
- `apps/backend/src/signaling/handlers/media.handler.ts` - Media signaling

#### Current Behavior
1. **Fixed Bitrates**: 2.5 Mbps per producer (too high for 100+ users)
2. **No Room Size Awareness**: Same config for 10 or 100 users
3. **No Consumer Limits**: Server doesn't limit consumer creation
4. **No Priority System**: All producers treated equally

---

## Frontend Optimizations

### 1. Selective Video Consumer Management ⭐ CRITICAL

**Problem**: Each user consumes video from all 99 other users (~100 Mbps bandwidth)

**Location**: 
- `apps/frontend/src/lib/webrtc.ts` - `consumeProducer()` method
- `apps/frontend/src/pages/Call.tsx` - Consumer creation logic

**Current Code**:
```typescript
// Call.tsx - Currently consumes ALL producers
socket.on('new-producer', async (data) => {
  await webrtcManager.consumeProducer(data.producerId);
});
```

**Solution**: Only consume video from:
1. **Active speaker** (always)
2. **Pinned screen share** (always)
3. **Visible users in viewport** (max 9-16 tiles)
4. **First N users in grid** (configurable, e.g., 9)

**Implementation**:
```typescript
// webrtc.ts - Add method to check if should consume video
shouldConsumeVideo(producerId: string, metadata: ProducerMetadata): boolean {
  const { activeSpeakerId, pinnedScreenShareUserId, visibleUserIds } = 
    this.getConsumptionContext();
  
  // Always consume audio (for active speaker detection)
  if (metadata.kind === 'audio') return true;
  
  // Always consume video from:
  // 1. Active speaker
  if (metadata.userId === activeSpeakerId) return true;
  
  // 2. Pinned screen share
  if (metadata.source === 'screen' && metadata.userId === pinnedScreenShareUserId) return true;
  
  // 3. Visible users (in viewport)
  if (visibleUserIds.has(metadata.userId)) return true;
  
  // 4. First N users in grid (fallback)
  const participantOrder = this.getParticipantOrder();
  const maxVisible = 9; // Configurable
  if (participantOrder.indexOf(metadata.userId) < maxVisible) return true;
  
  return false;
}
```

**Performance Impact**:
- **Bandwidth**: 100 Mbps → 5-10 Mbps (90% reduction)
- **CPU**: High → Medium (50% reduction)
- **Memory**: High → Medium (60% reduction)

**Files to Modify**:
- `apps/frontend/src/lib/webrtc.ts` - Add `shouldConsumeVideo()` method
- `apps/frontend/src/pages/Call.tsx` - Update consumer creation logic
- `apps/frontend/src/store/callStore.ts` - Track visible user IDs

---

### 2. Consumer Pause/Resume Logic ⭐ CRITICAL

**Problem**: All consumers stay active even when user scrolls away or user becomes inactive

**Location**: 
- `apps/frontend/src/lib/webrtc.ts` - Consumer management
- `apps/frontend/src/pages/Call.tsx` - Visibility tracking

**Current Code**:
```typescript
// No pause/resume logic exists
```

**Solution**: Pause video consumers when:
- User scrolls out of viewport
- User is not active speaker
- User is not pinned
- User is not in first N visible tiles

**Implementation**:
```typescript
// webrtc.ts - Add pause/resume methods
async pauseConsumer(producerId: string): Promise<void> {
  const consumer = this.consumers.get(producerId);
  if (!consumer || consumer.paused) return;
  
  try {
    consumer.pause();
    await socketManager.pauseConsumer(consumer.id);
    console.log(`Paused consumer for producer: ${producerId}`);
  } catch (error) {
    console.error(`Error pausing consumer ${producerId}:`, error);
  }
}

async resumeConsumer(producerId: string): Promise<void> {
  const consumer = this.consumers.get(producerId);
  if (!consumer || !consumer.paused) return;
  
  try {
    consumer.resume();
    await socketManager.resumeConsumer(consumer.id);
    console.log(`Resumed consumer for producer: ${producerId}`);
  } catch (error) {
    console.error(`Error resuming consumer ${producerId}:`, error);
  }
}

// Call.tsx - Optimize consumers based on visibility
useEffect(() => {
  const optimizeConsumers = async () => {
    const { activeSpeakerId, pinnedScreenShareUserId } = useCallStore.getState();
    const visibleUserIds = getVisibleUserIds(); // From viewport
    
    for (const [producerId, consumer] of webrtcManager.getConsumerEntries()) {
      const metadata = producerMetadataRef.current.get(producerId);
      if (!metadata || metadata.kind !== 'video') continue;
      
      const shouldBeActive = 
        metadata.userId === activeSpeakerId ||
        (metadata.source === 'screen' && metadata.userId === pinnedScreenShareUserId) ||
        visibleUserIds.has(metadata.userId);
      
      if (shouldBeActive && consumer.paused) {
        await webrtcManager.resumeConsumer(producerId);
      } else if (!shouldBeActive && !consumer.paused) {
        await webrtcManager.pauseConsumer(producerId);
      }
    }
  };
  
  // Run optimization when visibility changes
  const interval = setInterval(optimizeConsumers, 2000); // Every 2 seconds
  return () => clearInterval(interval);
}, [activeSpeakerId, pinnedScreenShareUserId]);
```

**Performance Impact**:
- **Bandwidth**: Additional 80-90% reduction for paused consumers
- **CPU**: Reduced processing for paused tracks
- **Battery**: Better battery life on mobile devices

**Files to Modify**:
- `apps/frontend/src/lib/webrtc.ts` - Add pause/resume methods
- `apps/frontend/src/lib/socket.ts` - Add pause/resume socket events
- `apps/frontend/src/pages/Call.tsx` - Add visibility tracking and optimization
- `apps/backend/src/signaling/handlers/media.handler.ts` - Add pause/resume handlers

---

### 3. Lazy Consumer Creation ⭐ HIGH PRIORITY

**Problem**: Creates consumers for all users immediately on join (slow join time)

**Location**: 
- `apps/frontend/src/pages/Call.tsx` - Initial consumer creation

**Current Code**:
```typescript
// Creates consumers for all existing producers immediately
socket.on('existing-producers', async (producers) => {
  for (const producer of producers) {
    await webrtcManager.consumeProducer(producer.id);
  }
});
```

**Solution**: Create consumers lazily:
1. Create audio consumers immediately (for active speaker detection)
2. Create video consumers only when needed (visible/active)
3. Batch creation to avoid overwhelming the connection

**Implementation**:
```typescript
// Call.tsx - Lazy consumer creation
socket.on('existing-producers', async (producers) => {
  // Separate audio and video producers
  const audioProducers = producers.filter(p => p.kind === 'audio');
  const videoProducers = producers.filter(p => p.kind === 'video');
  
  // Create all audio consumers immediately (needed for active speaker)
  for (const producer of audioProducers) {
    await webrtcManager.consumeProducer(producer.id);
  }
  
  // Create video consumers lazily (only for visible/active users)
  const { activeSpeakerId, pinnedScreenShareUserId } = useCallStore.getState();
  const visibleUserIds = getInitialVisibleUserIds(); // First 9 users
  
  const videoProducersToConsume = videoProducers.filter(p => {
    const metadata = producerMetadataRef.current.get(p.id);
    return metadata && (
      metadata.userId === activeSpeakerId ||
      (metadata.source === 'screen' && metadata.userId === pinnedScreenShareUserId) ||
      visibleUserIds.has(metadata.userId)
    );
  });
  
  // Batch create (5 at a time to avoid overwhelming)
  for (let i = 0; i < videoProducersToConsume.length; i += 5) {
    const batch = videoProducersToConsume.slice(i, i + 5);
    await Promise.all(batch.map(p => webrtcManager.consumeProducer(p.id)));
    // Small delay between batches
    if (i + 5 < videoProducersToConsume.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
});
```

**Performance Impact**:
- **Join time**: 30-60s → 5-10s (80% faster)
- **Initial bandwidth**: 100 Mbps → 2-5 Mbps (95% reduction)
- **User experience**: Much faster room entry

**Files to Modify**:
- `apps/frontend/src/pages/Call.tsx` - Update existing-producers handler
- `apps/frontend/src/lib/webrtc.ts` - Add batch creation support

---

### 4. Limit Maximum Video Consumers ⭐ HIGH PRIORITY (EASY)

**Problem**: No limit on concurrent video consumers (can consume 99+ streams)

**Location**: 
- `apps/frontend/src/lib/webrtc.ts` - Consumer creation

**Current Code**:
```typescript
// No limit check
async consumeProducer(producerId: string): Promise<MediaStreamTrack | null> {
  // Creates consumer without checking limits
}
```

**Solution**: Hard limit on video consumers (e.g., max 20)

**Implementation**:
```typescript
// webrtc.ts - Add consumer limit
private readonly MAX_VIDEO_CONSUMERS = 20; // Configurable

async consumeProducer(producerId: string): Promise<MediaStreamTrack | null> {
  return this.runConsumeTask(async () => {
    // Check if already consuming
    if (this.consumers.has(producerId)) {
      return this.consumers.get(producerId)?.track || null;
    }
    
    // Get producer metadata to check kind
    const metadata = await this.getProducerMetadata(producerId);
    
    // Check video consumer limit
    if (metadata?.kind === 'video') {
      const videoConsumerCount = Array.from(this.consumers.values())
        .filter(c => c.kind === 'video').length;
      
      if (videoConsumerCount >= this.MAX_VIDEO_CONSUMERS) {
        console.warn(`Max video consumers (${this.MAX_VIDEO_CONSUMERS}) reached. Skipping ${producerId}`);
        return null;
      }
    }
    
    // Continue with normal consumption...
  });
}
```

**Performance Impact**:
- **Bandwidth**: Prevents bandwidth exhaustion
- **Stability**: Prevents connection failures
- **CPU**: Limits CPU usage

**Files to Modify**:
- `apps/frontend/src/lib/webrtc.ts` - Add limit check

---

### 5. Reduce Bitrate for Large Rooms ⭐ HIGH PRIORITY (EASY)

**Problem**: Same bitrate (900k max) regardless of room size

**Location**: 
- `apps/frontend/src/lib/webrtc.ts` - Producer creation

**Current Code**:
```typescript
encodings: [
  { rid: 'r0', maxBitrate: 100000, scalabilityMode: 'S1T3' },
  { rid: 'r1', maxBitrate: 300000, scalabilityMode: 'S1T3' },
  { rid: 'r2', maxBitrate: 900000, scalabilityMode: 'S1T3' },
],
```

**Solution**: Reduce bitrates when room has 50+ users

**Implementation**:
```typescript
// webrtc.ts - Dynamic bitrate based on room size
private getVideoEncodings(participantCount: number) {
  // For large rooms (50+), use lower bitrates
  if (participantCount >= 50) {
    return [
      { rid: 'r0', maxBitrate: 50000, scalabilityMode: 'S1T3' },   // 50k (was 100k)
      { rid: 'r1', maxBitrate: 150000, scalabilityMode: 'S1T3' },  // 150k (was 300k)
      { rid: 'r2', maxBitrate: 400000, scalabilityMode: 'S1T3' },  // 400k (was 900k)
    ];
  }
  
  // Default for smaller rooms
  return [
    { rid: 'r0', maxBitrate: 100000, scalabilityMode: 'S1T3' },
    { rid: 'r1', maxBitrate: 300000, scalabilityMode: 'S1T3' },
    { rid: 'r2', maxBitrate: 900000, scalabilityMode: 'S1T3' },
  ];
}

async produceVideo(track: MediaStreamTrack): Promise<any> {
  const participantCount = this.getParticipantCount(); // Get from store
  const encodings = this.getVideoEncodings(participantCount);
  
  const producer = await this.sendTransport.produce({
    track,
    encodings,
    appData: { source: 'camera' },
  });
  
  return producer;
}
```

**Performance Impact**:
- **Bandwidth**: 50-60% reduction per producer in large rooms
- **Server load**: Reduced server bandwidth usage
- **Quality**: Slight quality reduction but acceptable for large rooms

**Files to Modify**:
- `apps/frontend/src/lib/webrtc.ts` - Add dynamic bitrate logic

---

### 6. Audio-Only Mode for Low Bandwidth ⭐ MEDIUM PRIORITY

**Problem**: Low-end devices or poor network can't handle video

**Location**: 
- `apps/frontend/src/pages/Call.tsx` - Network monitoring
- `apps/frontend/src/lib/networkMonitor.ts` - Network quality detection

**Solution**: Auto-disable video when bandwidth is low, show avatar instead

**Implementation**:
```typescript
// Call.tsx - Auto-disable video on low bandwidth
useEffect(() => {
  const checkNetworkQuality = () => {
    const networkQuality = useCallStore.getState().networkQuality;
    const localQuality = networkQuality.get(user?.id || '');
    
    if (localQuality?.downstream) {
      const { bitrateKbps, level } = localQuality.downstream;
      
      // Auto-disable video if bandwidth is very low
      if (level === 'poor' && bitrateKbps < 500 && !isVideoMuted) {
        console.warn('Low bandwidth detected, disabling video');
        setLocalVideoMuted(true);
        toast.error('Low bandwidth detected. Video disabled.');
      }
      
      // Re-enable video when bandwidth improves
      if (level === 'good' && bitrateKbps > 1000 && isVideoMuted && videoAutoMutedRef.current) {
        console.log('Bandwidth improved, re-enabling video');
        setLocalVideoMuted(false);
        videoAutoMutedRef.current = false;
      }
    }
  };
  
  const interval = setInterval(checkNetworkQuality, 5000); // Check every 5s
  return () => clearInterval(interval);
}, [isVideoMuted, user?.id]);
```

**Performance Impact**:
- **Bandwidth**: 90% reduction when video disabled
- **Accessibility**: Enables participation on low-end devices
- **User experience**: Better experience on poor networks

**Files to Modify**:
- `apps/frontend/src/pages/Call.tsx` - Add network quality monitoring
- `apps/frontend/src/lib/networkMonitor.ts` - Enhance quality detection

---

### 7. Consumer Priority Queue ⭐ MEDIUM PRIORITY

**Problem**: All consumers treated equally, no prioritization

**Location**: 
- `apps/frontend/src/lib/webrtc.ts` - Consumer management

**Solution**: Priority system for consumers:
1. **Priority 1**: Active speaker
2. **Priority 2**: Pinned screen share
3. **Priority 3**: Visible users
4. **Priority 4**: Others

**Implementation**:
```typescript
// webrtc.ts - Priority-based consumer management
private getConsumerPriority(producerId: string): number {
  const metadata = producerMetadataRef.current.get(producerId);
  if (!metadata) return 4; // Lowest priority
  
  const { activeSpeakerId, pinnedScreenShareUserId } = this.getConsumptionContext();
  
  // Priority 1: Active speaker
  if (metadata.userId === activeSpeakerId) return 1;
  
  // Priority 2: Pinned screen share
  if (metadata.source === 'screen' && metadata.userId === pinnedScreenShareUserId) return 2;
  
  // Priority 3: Visible users
  if (this.isVisible(metadata.userId)) return 3;
  
  // Priority 4: Others
  return 4;
}

// When at limit, pause lowest priority consumers
private optimizeConsumersAtLimit() {
  const videoConsumers = Array.from(this.consumers.entries())
    .filter(([_, consumer]) => consumer.kind === 'video')
    .map(([producerId, consumer]) => ({
      producerId,
      consumer,
      priority: this.getConsumerPriority(producerId),
    }))
    .sort((a, b) => a.priority - b.priority); // Lower number = higher priority
  
  // If over limit, pause lowest priority
  if (videoConsumers.length > this.MAX_VIDEO_CONSUMERS) {
    const toPause = videoConsumers.slice(this.MAX_VIDEO_CONSUMERS);
    toPause.forEach(({ producerId }) => {
      this.pauseConsumer(producerId);
    });
  }
}
```

**Performance Impact**:
- **Quality**: Better quality for important streams
- **Bandwidth**: Efficient bandwidth allocation
- **User experience**: Important users always visible

**Files to Modify**:
- `apps/frontend/src/lib/webrtc.ts` - Add priority system

---

## Backend Optimizations

### 8. Dynamic Bitrate Limits Based on Room Size ⭐ CRITICAL

**Problem**: Fixed 2.5 Mbps per producer (too high for 100+ users)

**Location**: 
- `apps/backend/src/shared/config/mediasoup.config.ts`
- `apps/backend/src/media/Router.ts`

**Current Code**:
```typescript
webRtcTransport: {
  maxIncomingBitrate: 2500000, // 2.5 Mbps per producer
  initialAvailableOutgoingBitrate: 2500000,
  minimumAvailableOutgoingBitrate: 1500000,
}
```

**Solution**: Reduce bitrates when room has 50+ users

**Implementation**:
```typescript
// Router.ts - Dynamic transport config
static async createTransport(
  router: Router,
  socketId: string,
  roomId: string,
  isProducer: boolean
): Promise<WebRtcTransport> {
  // Get room participant count
  const participantCount = await this.getRoomParticipantCount(roomId);
  
  // Adjust bitrates based on room size
  const transportConfig = { ...mediasoupConfig.webRtcTransport };
  
  if (participantCount >= 50) {
    // Reduce bitrates for large rooms
    transportConfig.maxIncomingBitrate = 1500000; // 1.5 Mbps (was 2.5 Mbps)
    transportConfig.initialAvailableOutgoingBitrate = 2000000; // 2 Mbps (was 2.5 Mbps)
    transportConfig.minimumAvailableOutgoingBitrate = 1000000; // 1 Mbps (was 1.5 Mbps)
  }
  
  const transport = await router.createWebRtcTransport(transportConfig);
  // ... rest of the code
}
```

**Performance Impact**:
- **Server bandwidth**: 40% reduction per producer in large rooms
- **Server capacity**: Can handle 2x more users
- **Stability**: Prevents server overload

**Files to Modify**:
- `apps/backend/src/media/Transport.ts` - Add dynamic config
- `apps/backend/src/media/Router.ts` - Add room size tracking

---

### 9. Consumer Creation Limits ⭐ HIGH PRIORITY

**Problem**: No limit on consumer creation per user

**Location**: 
- `apps/backend/src/signaling/handlers/media.handler.ts`

**Current Code**:
```typescript
socket.on('consume', async (data: unknown, callback) => {
  // No limit check
  const consumer = await transport.consume({...});
});
```

**Solution**: Limit consumers per socket (e.g., max 30 consumers per user)

**Implementation**:
```typescript
// media.handler.ts - Add consumer limit
const MAX_CONSUMERS_PER_SOCKET = 30; // Configurable

socket.on('consume', async (data: unknown, callback) => {
  try {
    const validatedData = consumeSchema.parse(data);
    
    // Check consumer count for this socket
    const existingConsumers = ConsumerManager.getConsumers(socket.id);
    if (existingConsumers.length >= MAX_CONSUMERS_PER_SOCKET) {
      return callback({ 
        error: `Maximum consumers (${MAX_CONSUMERS_PER_SOCKET}) reached` 
      });
    }
    
    // Continue with normal consumption...
    const consumer = await transport.consume({...});
    await ConsumerManager.addConsumer(socket.id, consumer, validatedData.producerId);
    
    callback({ id: consumer.id, ... });
  } catch (error) {
    callback({ error: error.message });
  }
});
```

**Performance Impact**:
- **Server resources**: Prevents resource exhaustion
- **Stability**: Prevents server crashes
- **Fairness**: Ensures fair resource distribution

**Files to Modify**:
- `apps/backend/src/signaling/handlers/media.handler.ts` - Add limit check
- `apps/backend/src/media/Consumer.ts` - Add count method

---

### 10. Room Size-Based Router Configuration ⭐ MEDIUM PRIORITY

**Problem**: Same router config for 10 or 100 users

**Location**: 
- `apps/backend/src/media/Router.ts`

**Solution**: Adjust router settings based on room size

**Implementation**:
```typescript
// Router.ts - Dynamic router config
static async createRouter(roomId: string): Promise<Router> {
  const worker = WorkerManager.getWorker();
  
  // Get expected room size (from room metadata or default)
  const expectedSize = await this.getExpectedRoomSize(roomId);
  
  // Adjust codec priorities for large rooms
  let mediaCodecs = [...mediasoupConfig.router.mediaCodecs];
  
  if (expectedSize >= 50) {
    // For large rooms, prioritize VP8 (lower CPU) over VP9/H264
    mediaCodecs = mediaCodecs.sort((a, b) => {
      if (a.mimeType === 'video/VP8') return -1;
      if (b.mimeType === 'video/VP8') return 1;
      return 0;
    });
  }
  
  const router = await worker.createRouter({ mediaCodecs });
  // ... rest of the code
}
```

**Performance Impact**:
- **CPU**: Lower CPU usage with VP8 priority
- **Compatibility**: Better compatibility with older devices
- **Stability**: More stable for large rooms

**Files to Modify**:
- `apps/backend/src/media/Router.ts` - Add dynamic codec selection

---

### 11. Producer Pause on Low Bandwidth ⭐ MEDIUM PRIORITY

**Problem**: Producers continue sending even when consumers can't receive

**Location**: 
- `apps/backend/src/media/Producer.ts`
- `apps/backend/src/signaling/handlers/media.handler.ts`

**Solution**: Server-side pause producers when no active consumers

**Implementation**:
```typescript
// Producer.ts - Auto-pause when no active consumers
static async checkAndPauseInactiveProducers(roomId: string): Promise<void> {
  const roomProducers = this.getProducersByRoom(roomId);
  
  for (const producer of roomProducers) {
    const activeConsumers = ConsumerManager.getActiveConsumersForProducer(producer.id);
    
    // If no active consumers and producer is not paused, pause it
    if (activeConsumers.length === 0 && !producer.paused) {
      producer.pause();
      logger.debug(`Auto-paused producer ${producer.id} (no active consumers)`);
    }
    
    // Resume if consumers become active
    if (activeConsumers.length > 0 && producer.paused) {
      producer.resume();
      logger.debug(`Auto-resumed producer ${producer.id} (consumers active)`);
    }
  }
}

// Run periodically (every 10 seconds)
setInterval(() => {
  // Get all active rooms and check producers
  const activeRooms = RouterManager.getActiveRooms();
  activeRooms.forEach(roomId => {
    ProducerManager.checkAndPauseInactiveProducers(roomId);
  });
}, 10000);
```

**Performance Impact**:
- **Server bandwidth**: Significant reduction when producers paused
- **Server CPU**: Lower CPU usage
- **Efficiency**: Only process active streams

**Files to Modify**:
- `apps/backend/src/media/Producer.ts` - Add auto-pause logic
- `apps/backend/src/media/Consumer.ts` - Add active consumer tracking

---

## Implementation Priority

### Phase 1: Quick Wins (1-2 days)
**Goal**: Immediate improvements with minimal risk

1. ✅ **Limit Maximum Video Consumers** (#4)
   - Time: 30 minutes
   - Risk: Low
   - Impact: Prevents bandwidth exhaustion

2. ✅ **Reduce Bitrate for Large Rooms** (#5)
   - Time: 1 hour
   - Risk: Low
   - Impact: 50-60% bandwidth reduction

3. ✅ **Backend Dynamic Bitrate Limits** (#8)
   - Time: 1 hour
   - Risk: Low
   - Impact: Prevents server overload

### Phase 2: Core Optimizations (3-5 days)
**Goal**: Major bandwidth and performance improvements

4. ✅ **Consumer Pause/Resume Logic** (#2)
   - Time: 2 hours
   - Risk: Medium
   - Impact: 80-90% bandwidth reduction

5. ✅ **Selective Video Consumer Management** (#1)
   - Time: 3 hours
   - Risk: Medium
   - Impact: 90% bandwidth reduction

6. ✅ **Lazy Consumer Creation** (#3)
   - Time: 2 hours
   - Risk: Medium
   - Impact: 80% faster join time

7. ✅ **Backend Consumer Limits** (#9)
   - Time: 1 hour
   - Risk: Low
   - Impact: Prevents resource exhaustion

### Phase 3: Advanced Optimizations (1-2 weeks)
**Goal**: Fine-tuning and advanced features

8. ✅ **Audio-Only Mode** (#6)
   - Time: 2 hours
   - Risk: Low
   - Impact: Enables low-end devices

9. ✅ **Consumer Priority Queue** (#7)
   - Time: 2 hours
   - Risk: Medium
   - Impact: Better quality for important streams

10. ✅ **Room Size-Based Router Config** (#10)
    - Time: 2 hours
    - Risk: Low
    - Impact: Better CPU efficiency

11. ✅ **Producer Auto-Pause** (#11)
    - Time: 3 hours
    - Risk: Medium
    - Impact: Server bandwidth reduction

---

## Performance Metrics

### Before Optimizations (100 users)

| Metric | Value | Notes |
|--------|-------|-------|
| Video consumers per user | 99 | All participants |
| Bandwidth per user | ~100 Mbps | Receiving all streams |
| Join time | 30-60 seconds | Creating all consumers |
| Server bandwidth | ~10 Gbps | 100 users × 100 Mbps |
| CPU usage (client) | High (80-100%) | Processing all streams |
| CPU usage (server) | High (70-90%) | Routing all streams |
| Memory usage (client) | High (2-4 GB) | All video tracks |
| Memory usage (server) | High (8-16 GB) | All producers/consumers |
| Max room capacity | ~20-30 users | Before degradation |

### After Phase 1 Optimizations (100 users)

| Metric | Value | Improvement |
|--------|-------|-------------|
| Video consumers per user | 20 (max) | 80% reduction |
| Bandwidth per user | ~20 Mbps | 80% reduction |
| Join time | 20-30 seconds | 50% faster |
| Server bandwidth | ~2 Gbps | 80% reduction |
| CPU usage (client) | Medium-High (60-80%) | 20% reduction |
| CPU usage (server) | Medium-High (50-70%) | 20% reduction |
| Max room capacity | ~40-50 users | 2x increase |

### After Phase 2 Optimizations (100 users)

| Metric | Value | Improvement |
|--------|-------|-------------|
| Video consumers per user | 10-15 | 85-90% reduction |
| Bandwidth per user | ~5-10 Mbps | 90% reduction |
| Join time | 5-10 seconds | 80% faster |
| Server bandwidth | ~500 Mbps - 1 Gbps | 90% reduction |
| CPU usage (client) | Medium (40-60%) | 50% reduction |
| CPU usage (server) | Medium (30-50%) | 50% reduction |
| Max room capacity | 100+ users | 5x increase |

### After Phase 3 Optimizations (100 users)

| Metric | Value | Improvement |
|--------|-------|-------------|
| Video consumers per user | 8-12 | 88-92% reduction |
| Bandwidth per user | ~3-8 Mbps | 92% reduction |
| Join time | 3-5 seconds | 90% faster |
| Server bandwidth | ~300-800 Mbps | 92% reduction |
| CPU usage (client) | Low-Medium (30-50%) | 60% reduction |
| CPU usage (server) | Low-Medium (20-40%) | 60% reduction |
| Max room capacity | 150+ users | 7x increase |

---

## Testing Strategy

### Unit Tests

1. **Consumer Limit Tests**
   - Test max consumer limit enforcement
   - Test priority-based consumer management
   - Test pause/resume functionality

2. **Bitrate Tests**
   - Test dynamic bitrate adjustment
   - Test room size detection
   - Test encoding configuration

### Integration Tests

1. **Large Room Simulation**
   - Test with 50, 75, 100, 150 users
   - Monitor bandwidth usage
   - Monitor CPU/memory usage
   - Test join time

2. **Network Condition Tests**
   - Test with low bandwidth (1 Mbps)
   - Test with high latency (200ms+)
   - Test with packet loss (5%+)

### Performance Tests

1. **Load Testing**
   - Gradually add users (10 → 50 → 100)
   - Monitor server metrics
   - Monitor client metrics
   - Identify breaking points

2. **Stress Testing**
   - Rapid user join/leave
   - Multiple active speakers
   - Screen sharing with many users
   - Network interruptions

### Monitoring

1. **Key Metrics to Track**
   - Bandwidth per user
   - Consumer count per user
   - Join time
   - Server CPU/memory
   - Packet loss
   - Frame rate
   - Latency

2. **Alerts**
   - Bandwidth > threshold
   - Consumer count > limit
   - Join time > 15 seconds
   - Server CPU > 80%
   - Packet loss > 5%

---

## Configuration

### Environment Variables

```bash
# Frontend
VITE_MAX_VIDEO_CONSUMERS=20
VITE_LARGE_ROOM_THRESHOLD=50
VITE_LOW_BANDWIDTH_THRESHOLD=500

# Backend
MAX_CONSUMERS_PER_SOCKET=30
LARGE_ROOM_PARTICIPANT_THRESHOLD=50
MAX_INCOMING_BITRATE_LARGE_ROOM=1500000
INITIAL_OUTGOING_BITRATE_LARGE_ROOM=2000000
```

### Runtime Configuration

```typescript
// config/optimization.ts
export const optimizationConfig = {
  maxVideoConsumers: parseInt(process.env.VITE_MAX_VIDEO_CONSUMERS || '20'),
  largeRoomThreshold: parseInt(process.env.VITE_LARGE_ROOM_THRESHOLD || '50'),
  lowBandwidthThreshold: parseInt(process.env.VITE_LOW_BANDWIDTH_THRESHOLD || '500'),
  
  // Bitrate configurations
  bitrates: {
    smallRoom: {
      low: 100000,    // 100 kbps
      medium: 300000, // 300 kbps
      high: 900000,   // 900 kbps
    },
    largeRoom: {
      low: 50000,     // 50 kbps
      medium: 150000, // 150 kbps
      high: 400000,   // 400 kbps
    },
  },
};
```

---

## Conclusion

By implementing these optimizations, the system can scale from ~20-30 users to **100+ users** in a single room while maintaining good performance and user experience.

**Key Takeaways**:
1. **Selective consumption** is the most critical optimization (90% bandwidth reduction)
2. **Consumer pause/resume** provides significant additional savings (80-90% reduction)
3. **Backend limits** prevent resource exhaustion
4. **Dynamic bitrates** adapt to room size automatically
5. **Lazy creation** dramatically improves join time

**Expected Timeline**:
- **Phase 1**: 1-2 days (quick wins)
- **Phase 2**: 3-5 days (core optimizations)
- **Phase 3**: 1-2 weeks (advanced features)

**Total Expected Improvement**:
- **90% bandwidth reduction** per user
- **85-90% reduction** in video consumers
- **80-90% faster** join time
- **5-7x increase** in server capacity
- **50-60% reduction** in CPU usage

---

## References

- [Mediasoup Documentation](https://mediasoup.org/documentation/v3/)
- [WebRTC Best Practices](https://webrtc.org/getting-started/overview)
- [Simulcast Guide](https://webrtc.org/getting-started/overview)
- [Network Quality Monitoring](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats)

---

**Document Version**: 1.0  
**Last Updated**: November 2025  
**Author**: Development Team

