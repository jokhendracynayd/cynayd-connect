# Testing Instructions - Sprint 3 Frontend

## Prerequisites

### Backend Status ✅
- PostgreSQL container running: `my-postgres`
- Redis container running: `my-redis`
- Backend API server: Port 3000
- Socket.io signaling: Port 4000
- Mediasoup: 20 workers ready

### Frontend Status ✅
- React app: Port 5173
- All dependencies installed
- No linter errors

---

## How to Test Video Calling

### Step 1: Start Backend

```bash
cd connect-sdk/apps/backend
pnpm dev
```

**Verify**: Should see logs like:
- PostgreSQL connected ✅
- Redis connected ✅
- Creating 20 Mediasoup workers...
- All Mediasoup workers created successfully ✅
- API server listening on port 3000 ✅
- Signaling server initialized on /socket ✅

### Step 2: Start Frontend

```bash
cd connect-sdk/apps/frontend
pnpm dev
```

**Verify**: Should see:
- Vite server running on http://localhost:5173
- No errors in console

### Step 3: Create User Account

1. Open http://localhost:5173
2. Should be redirected to `/login`
3. Click "Sign up"
4. Fill in registration form:
   - Name: Test User
   - Email: test@test.com
   - Password: password123
5. Click "Create account"
6. Should be logged in and on home page

### Step 4: Create Room

1. On home page, click "Create Room"
2. Enter room name: "Test Room"
3. Click "Create Room"
4. **Should navigate to Pre-join page!**

### Step 5: Pre-Join Test (Like Google Meet!)

**Expected Behavior**:
1. Camera preview appears
2. Can hear microphone
3. Device dropdowns populated
4. Can toggle mic/camera on/off
5. "Join Now" button available

**If no devices**:
- See message: "No Audio/Video Devices"
- Can still click "Join Room"

### Step 6: Join Call

1. Click "Join Now" on pre-join page
2. **Should navigate to Call page**
3. **Should see**: Local video displaying

**Expected**:
- Local video showing self
- Controls at bottom (mic, camera, leave)
- Room code displayed
- "Connecting to room..." briefly, then "Connected to room" ✅

### Step 7: Second User Joins

**In a separate browser window/tab**:

1. Register/login as different user
2. Home page: "Join Room"
3. Enter same room code from first user
4. Pre-join → Join Now
5. **Should see**:
   - Second user's local video
   - First user's video in their grid ✅
   - Two participants in room

**Expected Behavior**:
- ✅ Audio should work (use headphones to avoid echo)
- ✅ Video should work
- ✅ Mute/unmute should work
- ✅ Video on/off should work
- ✅ Leave button should work

---

## Testing Checklist

### Authentication ✅
- [ ] Can register new user
- [ ] Can login with credentials
- [ ] Protected routes redirect to login
- [ ] JWT tokens work

### Room Management ✅
- [ ] Can create room
- [ ] Can join room by code
- [ ] Room code validation works
- [ ] Navigate between pages smoothly

### Pre-Join Experience ✅
- [ ] Camera preview works
- [ ] Microphone preview works
- [ ] Device selection works
- [ ] Can join without devices
- [ ] Settings persist to call

### Video Calling ⏳ (Need Testing)
- [ ] Join room successfully
- [ ] Socket.io connects
- [ ] Mediasoup initializes
- [ ] Local video displays
- [ ] Transports created
- [ ] Producers working
- [ ] Remote video displays when second user joins
- [ ] Audio works both ways
- [ ] Mute/unmute works
- [ ] Video toggle works
- [ ] Leave room works
- [ ] Cleanup happens properly

---

## Known Issues / TODO

### Current Limitations
1. ⏳ Producer/consumer implementation needs testing
2. ⏳ Remote video rendering needs verification
3. ⏳ Audio track handling for remote streams
4. ⏳ Reconnection logic not implemented
5. ⏳ Screen sharing not implemented
6. ⏳ Chat UI not implemented
7. ⏳ Network quality indicators not implemented

### Next Steps After Testing
1. Test with 2 users and fix any issues
2. Add screen sharing
3. Add chat UI
4. Add reconnection logic
5. Polish UI/UX
6. Performance testing
7. Multi-user testing (5+ users)

---

## Browser Console Logs to Watch

**Good Signs**:
- "Socket connected"
- "Joined room: {...}"
- "Device initialized"
- "Send transport created"
- "Recv transport created"
- "Audio producer created"
- "Video producer created"
- "User joined: {...}"
- "Remote stream added"

**Bad Signs**:
- "Error: ..." (red logs)
- "Failed to connect"
- "Transport error"
- "Producer failed"
- WebRTC errors

---

**Status**: Ready for 2-user testing! 🧪

**Next**: Let's test it and see if video calling actually works! 🎥

