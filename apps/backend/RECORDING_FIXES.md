# Recording FFmpeg Crash Fixes (Updated)

## Problem Summary

The recording feature was experiencing FFmpeg crashes with exit code `3199971767` (0xBEBBB1B7), which manifested as:

```
[udp @ ...] bind failed: Error number -10048 occurred
[in#0] Error opening input: Invalid data found when processing input
```

## Root Cause (Final Analysis)

The issue had **three layers**:

### 1. Port Allocation Race Condition
Initially, audio and video PlainTransports were being allocated ports in parallel:
```typescript
const [audioPort, videoPort] = await Promise.all([
  this.allocateUdpPort(),
  this.allocateUdpPort(),
]);
```

This caused both transports to sometimes grab the same port before either could mark it as allocated.

### 2. Incorrect RTP Flow Architecture
The fundamental issue was a misunderstanding of the RTP flow:

**What we had:**
- mediasoup PlainTransport with `comedia: true` (waits to learn where to send)
- SDP with `a=recvonly` (tells FFmpeg it's the receiver)
- FFmpeg tried to bind the ports to receive, but mediasoup's transport was already using those ports

**What we needed:**
- FFmpeg binds specific UDP ports and listens for RTP
- mediasoup PlainTransport explicitly configured to **send** RTP to those FFmpeg ports
- SDP tells FFmpeg which ports to bind and listen on

### 3. Restart Loops
When FFmpeg crashed, the exit handler would call `stopRecording()`, but:
- `attachProducersToRecording()` was still running in the background
- New `handleProducerAdded()` calls would trigger `startFfmpegIfNeeded()` again
- This caused FFmpeg to restart multiple times, each time failing with port bind errors
- Windows held the UDP sockets for a few seconds after closure (TIME_WAIT), causing subsequent bind attempts to fail

## Solution (Final Implementation)

### 1. Allocate Ports for FFmpeg First
FFmpeg needs to bind specific UDP ports to listen for incoming RTP:

```typescript
// Allocate ports from the recording port range for FFmpeg to bind
const audioPort = await this.allocateFfmpegPort();
const videoPort = await this.allocateFfmpegPort();
```

### 2. Configure PlainTransport to Send to FFmpeg
Tell mediasoup's PlainTransport where to send the consumed RTP:

```typescript
const transport = await router.createPlainTransport({
  listenIp,
  rtcpMux: true,
  comedia: false,  // We explicitly configure where to send
  enableSrtp: false,
});

// Tell mediasoup to send RTP to FFmpeg's listening port
await transport.connect({
  ip: config.recording.network.ip,
  port: ffmpegPort,  // FFmpeg's listening port
});
```

This way:
- FFmpeg binds to specific ports (e.g., 60000, 60001) from `RECORDING_PORT_MIN/MAX`
- mediasoup PlainTransport sends RTP to those FFmpeg ports
- mediasoup uses its own RTC range ports for its internal operations
- No port conflicts between FFmpeg and mediasoup

### 3. Prevent FFmpeg Restart Loops
Added guards to prevent FFmpeg from restarting after failure:

```typescript
// In startFfmpegIfNeeded():
if (state.stopRequested || state.status === RecordingStatus.FAILED) {
  logger.debug(`Skipping FFmpeg start - recording is stopping or failed`);
  return;
}

// In FFmpeg exit handler:
if (!state.stopRequested && code !== 0) {
  state.status = RecordingStatus.FAILED;  // Mark immediately
  // ... trigger stopRecording
}

// In handleProducerAdded():
if (state.stopRequested || state.status === RecordingStatus.FAILED) {
  logger.debug(`Skipping producer attachment - recording is stopping or failed`);
  return;
}
```

### 4. Better Logging and Diagnostics
- Added detailed logging for transport creation (IP, port, transport ID)
- Log FFmpeg command line and stdout in addition to stderr
- Added `process.on('error')` handler to catch spawn failures
- Created `test-ffmpeg.js` diagnostic script to verify FFmpeg installation

## Testing

Run the diagnostic script to verify FFmpeg works:

```bash
cd apps/backend
node test-ffmpeg.js
```

Expected output:
```
============================================================
FFmpeg Diagnostic Test
============================================================
FFmpeg path: ffmpeg

[1/3] Checking FFmpeg installation...
✓ FFmpeg found: ffmpeg version 8.0...

[2/3] Checking required codecs...
  ✓ OPUS
  ✓ VP8
  ✓ H264
  ✓ AAC

[3/3] Testing SDP file processing...
✓ FFmpeg can process SDP files

============================================================
✓ All tests passed! FFmpeg is properly configured.
============================================================
```

## Key Changes

- **Added** sequential FFmpeg port allocation (`allocateFfmpegPort()`, `releaseFfmpegPort()`)
- **Changed** PlainTransport creation to accept FFmpeg port and configure `transport.connect()`
- **Set** `comedia: false` so mediasoup sends to explicit FFmpeg ports
- **Kept** `a=recvonly` in SDP since FFmpeg is the receiver
- **Use** `RECORDING_PORT_MIN/MAX` for FFmpeg's listening ports
- **mediasoup RTC ports** (`MEDIASOUP_RTC_MIN_PORT/MAX`) remain separate for internal use

## Configuration

The recording now only needs:

```env
RECORDING_ENABLED=true
RECORDING_TMP_DIR=./tmp/recordings
RECORDING_FFMPEG_PATH=ffmpeg
RECORDING_LAYOUT=pip
RECORDING_BIND_IP=127.0.0.1

# Ports are now allocated from mediasoup's RTC range:
MEDIASOUP_RTC_MIN_PORT=2000
MEDIASOUP_RTC_MAX_PORT=2420
```

## Benefits

1. **Clear separation**: FFmpeg uses ports 60000-60010, mediasoup uses 2000-2420
2. **No port conflicts**: Each component has its own dedicated port range
3. **No race conditions**: Sequential port allocation for FFmpeg
4. **No restart loops**: Failed recordings stay failed and don't retry
5. **Explicit flow**: mediasoup explicitly configured to send to FFmpeg ports
6. **Better diagnostics**: Clear logging and diagnostic tools

## Next Steps

1. Restart the backend to load the fixed code
2. Test recording with multiple participants
3. Verify screen share + camera PiP layout works correctly
4. Monitor logs for any remaining issues
5. Test S3 upload after successful recording

## Files Changed

- `apps/backend/src/media/RecordingManager.ts` - Main fixes
- `apps/backend/test-ffmpeg.js` - New diagnostic script (can be deleted after testing)
- `apps/backend/RECORDING_FIXES.md` - This document

