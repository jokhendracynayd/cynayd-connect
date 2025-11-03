# Cleanup Review - User Leave Room

## Overview
This document reviews the cleanup mechanisms when a user leaves a room, covering all scenarios:
- User clicks "Leave" button
- User closes browser tab
- User closes browser window
- Network disconnection
- Page refresh/navigation

---

## Frontend Cleanup Review

### ✅ What's Working Well

1. **Manual Leave (`leaveRoom` function)**
   - ✅ Closes WebRTC producers/consumers
   - ✅ Disconnects socket
   - ✅ Stops local media
   - ✅ Clears local stream in store
   - ✅ Navigates away

2. **useEffect Cleanup**
   - ✅ Clears event listeners on unmount
   - ✅ Calls `leaveRoom()` in cleanup

3. **Event Listeners**
   - ✅ Properly stored in ref for cleanup
   - ✅ Removed on component unmount

### ❌ Issues Found

#### **Critical Issues:**

1. **No Browser Tab/Window Close Handler**
   - ❌ Missing `beforeunload` event listener
   - ❌ Missing `visibilitychange` event listener
   - ❌ When user closes tab/window, cleanup code doesn't run
   - **Impact**: Socket stays connected, media resources not released, backend thinks user is still in room

2. **Remote Video Elements Not Cleaned**
   - ❌ `remoteVideoRefs` Map not cleared on leave
   - ❌ Video elements might still be in DOM with `srcObject` set
   - **Impact**: Memory leaks, DOM nodes not released

3. **Remote Streams Map Not Fully Cleared**
   - ⚠️ Streams are cleared in `handleUserLeft` but not in `leaveRoom`
   - ⚠️ If user leaves while others are still connected, their streams might remain
   - **Impact**: Memory leaks

4. **State Store Not Reset**
   - ❌ Participants array not cleared completely
   - ❌ Remote streams map might retain references
   - ❌ `activeSpeakerId` not reset
   - ❌ `raisedHands` not cleared
   - ❌ `pendingRequests` not cleared
   - **Impact**: State pollution when rejoining room

5. **WebRTC Consumers Not Closed Properly**
   - ⚠️ `webrtcManager.cleanup()` closes consumers but doesn't verify all are closed
   - ⚠️ Consumer tracks might still be active in remote streams
   - **Impact**: Media tracks not released

6. **MediaManager State Not Reset**
   - ⚠️ `mediaManager.localStream` might retain reference even after `stopLocalMedia()`
   - **Impact**: Potential memory leak

#### **Medium Priority Issues:**

7. **Event Listeners Might Not Fire on Abrupt Disconnect**
   - ⚠️ If socket disconnects unexpectedly, cleanup might not run
   - ⚠️ Need to handle `socket.on('disconnect')` on frontend

8. **Video Element srcObject Not Cleared**
   - ⚠️ `localVideoRef.current.srcObject` not explicitly set to `null` in cleanup
   - ⚠️ Remote video elements not cleared from DOM

---

## Backend Cleanup Review

### ✅ What's Working Well

1. **Socket Disconnect Handler**
   - ✅ Cleans up producers
   - ✅ Cleans up consumers
   - ✅ Cleans up transports
   - ✅ Cleans up Redis state
   - ✅ Handles errors gracefully

2. **Manual Leave Handler**
   - ✅ Same cleanup as disconnect
   - ✅ Notifies other users
   - ✅ Leaves Socket.io room
   - ✅ Publishes to Redis

3. **Manager Cleanup Methods**
   - ✅ `ProducerManager.closeAllProducers()` - properly closes and cleans Redis
   - ✅ `ConsumerManager.closeAllConsumers()` - properly closes and cleans Redis
   - ✅ `TransportManager.closeAllTransports()` - properly closes and cleans Redis

### ❌ Issues Found

#### **Critical Issues:**

1. **No Verification of Cleanup Completion**
   - ⚠️ Backend doesn't verify that all Redis state is actually removed
   - ⚠️ If Redis operation fails silently, state might remain
   - **Impact**: Orphaned Redis entries

2. **Room Participant Cleanup Not Verified**
   - ⚠️ `RoomService.leaveRoom()` might not handle edge cases
   - ⚠️ Need to verify participant is removed from database
   - **Impact**: Stale participant records

3. **Race Conditions**
   - ⚠️ If user disconnects while producing/consuming, cleanup might be incomplete
   - ⚠️ Multiple cleanup operations happening simultaneously

#### **Medium Priority Issues:**

4. **Error Logging Only**
   - ⚠️ Errors in cleanup are logged but not retried
   - ⚠️ Failed cleanup operations are not retried with exponential backoff

---

## Recommended Fixes

### Frontend Fixes

1. **Add Browser Close Handlers**
   ```typescript
   useEffect(() => {
     const handleBeforeUnload = () => {
       // Force cleanup before page unloads
       webrtcManager.cleanup();
       mediaManager.stopLocalMedia();
       socketManager.leaveRoom().catch(() => {});
       socketManager.disconnect();
     };
     
     const handleVisibilityChange = () => {
       if (document.hidden) {
         // User switched tabs - could trigger cleanup
         // Optional: only cleanup if socket disconnected
       }
     };
     
     window.addEventListener('beforeunload', handleBeforeUnload);
     document.addEventListener('visibilitychange', handleVisibilityChange);
     
     return () => {
       window.removeEventListener('beforeunload', handleBeforeUnload);
       document.removeEventListener('visibilitychange', handleVisibilityChange);
     };
   }, []);
   ```

2. **Enhanced leaveRoom Function**
   ```typescript
   const leaveRoom = async () => {
     try {
       // Close all WebRTC resources
       webrtcManager.cleanup();
       
       // Stop all local media
       mediaManager.stopLocalMedia();
       
       // Clear all remote streams and their tracks
       remoteStreams.forEach((stream, userId) => {
         stream.getTracks().forEach(track => track.stop());
       });
       setRemoteStreams(new Map());
       
       // Clear all remote video refs
       remoteVideoRefs.current.forEach((videoEl, userId) => {
         if (videoEl) {
           videoEl.srcObject = null;
         }
       });
       remoteVideoRefs.current.clear();
       
       // Clear local video ref
       if (localVideoRef.current) {
         localVideoRef.current.srcObject = null;
       }
       
       // Leave room via socket
       await socketManager.leaveRoom();
       
       // Disconnect socket
       socketManager.disconnect();
       
       // Reset all state
       setLocalStream(null);
       setIsConnected(false);
       removeParticipant(user?.id || ''); // Remove self
       // Clear all participants
       setParticipants([]);
       setActiveSpeaker(null);
       setRaiseHand(user?.id || '', false);
       setPendingRequests([]);
       consumingProducersRef.current.clear();
       
       navigate('/');
     } catch (error) {
       console.error('Error leaving room:', error);
       // Force navigation even on error
       navigate('/');
     }
   };
   ```

3. **Add Socket Disconnect Handler**
   ```typescript
   useEffect(() => {
     const handleDisconnect = () => {
       console.log('Socket disconnected, cleaning up...');
       webrtcManager.cleanup();
       mediaManager.stopLocalMedia();
       setLocalStream(null);
       setIsConnected(false);
       // Optionally navigate to home
       navigate('/');
     };
     
     socketManager.on('disconnect', handleDisconnect);
     
     return () => {
       socketManager.off('disconnect', handleDisconnect);
     };
   }, []);
   ```

4. **Add Store Reset Function**
   ```typescript
   // In callStore.ts
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
   }),
   ```

### Backend Fixes

1. **Add Cleanup Verification**
   ```typescript
   // After cleanup, verify Redis state is cleared
   const verifyCleanup = async (socketId: string) => {
     const producers = await RedisStateService.getSocketProducers(socketId);
     const consumers = await RedisStateService.getSocketConsumers(socketId);
     const transports = await RedisStateService.getSocketTransports(socketId);
     
     if (producers.length > 0 || consumers.length > 0 || transports.length > 0) {
       logger.warn(`Cleanup incomplete for socket ${socketId}:`, {
         producers: producers.length,
         consumers: consumers.length,
         transports: transports.length,
       });
       // Retry cleanup
       await RedisStateService.cleanupSocketState(socketId);
     }
   };
   ```

2. **Enhanced Error Handling with Retry**
   ```typescript
   const cleanupWithRetry = async (socketId: string, retries = 3) => {
     for (let i = 0; i < retries; i++) {
       try {
         await Promise.all([
           ProducerManager.closeAllProducers(socketId),
           ConsumerManager.closeAllConsumers(socketId),
           TransportManager.closeAllTransports(socketId),
           RedisStateService.cleanupSocketState(socketId),
         ]);
         return; // Success
       } catch (error) {
         if (i === retries - 1) throw error;
         await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
       }
     }
   };
   ```

---

## Testing Checklist

### Frontend Testing
- [ ] User clicks "Leave" button - verify all cleanup
- [ ] User closes browser tab - verify cleanup runs (check backend logs)
- [ ] User closes browser window - verify cleanup runs
- [ ] User refreshes page - verify cleanup runs
- [ ] Network disconnection - verify cleanup runs
- [ ] User navigates away - verify cleanup runs
- [ ] Verify no memory leaks (Chrome DevTools)
- [ ] Verify all video elements removed from DOM
- [ ] Verify all media tracks stopped
- [ ] Verify state store reset

### Backend Testing
- [ ] Verify producers closed in Mediasoup
- [ ] Verify consumers closed in Mediasoup
- [ ] Verify transports closed in Mediasoup
- [ ] Verify Redis state cleared
- [ ] Verify database participant removed
- [ ] Verify Socket.io room left
- [ ] Verify other users notified
- [ ] Test rapid connect/disconnect (race conditions)
- [ ] Test cleanup during active media streaming

---

## Priority Order for Implementation

1. **HIGH PRIORITY**
   - Add `beforeunload` handler on frontend
   - Clear remote video refs in `leaveRoom`
   - Clear remote streams map completely
   - Add socket disconnect handler on frontend

2. **MEDIUM PRIORITY**
   - Reset state store completely
   - Clear video element `srcObject`
   - Add cleanup verification on backend

3. **LOW PRIORITY**
   - Add retry logic for failed cleanup
   - Add cleanup metrics/monitoring
   - Optimize cleanup performance

---

## Summary

**Current State:** Partial cleanup - works for manual leave but fails for abrupt disconnections (tab close, window close, network issues).

**Risk Level:** HIGH - Memory leaks and resource exhaustion over time.

**Recommendation:** Implement all HIGH PRIORITY fixes immediately, then proceed with medium/low priority items.

