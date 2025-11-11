# Recording Architecture - Final Correct Implementation

## Overview

The recording system uses mediasoup PlainTransports to send RTP streams to FFmpeg, which processes and muxes them into an MP4 file.

## Architecture Diagram

```
┌─────────────────┐
│   Participants  │
│  (Audio/Video)  │
└────────┬────────┘
         │ WebRTC
         ▼
┌─────────────────┐
│  mediasoup SFU  │
│    (Router)     │
└────────┬────────┘
         │ Internal
         ▼
┌─────────────────┐      RTP over UDP
│  PlainTransport │ ─────────────────┐
│  Audio Consumer │                  │
│                 │                  │
│  Port: 2000-    │                  │
│  2420 (RTC)     │                  │
└─────────────────┘                  │
                                     │
┌─────────────────┐                  │
│  PlainTransport │ ─────────────────┤
│  Video Consumer │                  │
│                 │                  │
│  Port: 2000-    │                  │
│  2420 (RTC)     │                  │
└─────────────────┘                  │
                                     ▼
                            ┌─────────────────┐
                            │     FFmpeg      │
                            │                 │
                            │  Audio: 60000   │ ◄─ Listens
                            │  Video: 60001   │ ◄─ Listens
                            │                 │
                            │  Port: 60000-   │
                            │  60010 (Record) │
                            └────────┬────────┘
                                     │ Mux & Encode
                                     ▼
                            ┌─────────────────┐
                            │   recording.mp4 │
                            └─────────────────┘
```

## Key Concepts

### Port Allocation Strategy

We use **two separate port ranges** to avoid conflicts:

1. **mediasoup RTC Range** (`MEDIASOUP_RTC_MIN_PORT` - `MEDIASOUP_RTC_MAX_PORT`)
   - Default: 2000-2420
   - Used by mediasoup for ALL transports (WebRTC, Plain, Pipe, etc.)
   - mediasoup PlainTransports bind ports from this range to **send** RTP

2. **FFmpeg Recording Range** (`RECORDING_PORT_MIN` - `RECORDING_PORT_MAX`)
   - Default: 60000-60010
   - Used exclusively for FFmpeg to **receive** RTP
   - FFmpeg binds these ports and listens for incoming RTP from mediasoup

### RTP Flow

```
mediasoup PlainTransport (Port 2xyz) ──sends RTP to──> FFmpeg (Port 60000)
                        │                                  │
                        └─ Binds & Sends                  └─ Binds & Receives
```

- **mediasoup** binds a port (e.g., 2264) from its RTC range
- **mediasoup** is told to send TO port 60000 via `transport.connect({ port: 60000 })`
- **FFmpeg** binds port 60000 and listens for incoming UDP packets
- **mediasoup** sends RTP FROM 2264 TO 60000
- **FFmpeg** receives RTP AT 60000

### No Port Conflicts

- **mediasoup** uses 2000-2420 for binding
- **FFmpeg** uses 60000-60010 for binding
- **Ranges don't overlap** → No conflicts!

## Implementation Details

### 1. Port Allocation

```typescript
// Allocate FFmpeg ports from recording range
const audioFfmpegPort = await this.allocateFfmpegPort();  // e.g., 60000
const videoFfmpegPort = await this.allocateFfmpegPort();  // e.g., 60001
```

### 2. PlainTransport Creation

```typescript
// mediasoup binds a port from RTC range (e.g., 2264)
const audioTransport = await router.createPlainTransport({
  listenIp: { ip: '127.0.0.1' },
  rtcpMux: true,
  comedia: false,  // We explicitly configure destination
  enableSrtp: false,
});
```

### 3. Configure Destination

```typescript
// Tell mediasoup to send TO FFmpeg's port
await audioTransport.connect({
  ip: '127.0.0.1',
  port: audioFfmpegPort,  // 60000
});
```

Now mediasoup knows:
- **Local binding**: `audioTransport.tuple.localPort` (e.g., 2264)
- **Remote destination**: `127.0.0.1:60000`

### 4. Generate SDP for FFmpeg

```sdp
v=0
o=- 0 0 IN IP4 127.0.0.1
s=connect-sdk-recording
t=0 0
m=audio 60000 RTP/AVP 100
c=IN IP4 127.0.0.1
a=rtcp-mux
a=recvonly
a=rtpmap:100 opus/48000/2
```

This tells FFmpeg:
- **Bind** port 60000
- **Listen** for incoming RTP
- **Receive** Opus audio

### 5. Start FFmpeg

```bash
ffmpeg -protocol_whitelist file,udp,rtp \
       -i recording.sdp \
       -c:a aac \
       -c:v libx264 \
       output.mp4
```

FFmpeg:
1. Reads SDP file
2. Binds UDP socket to 127.0.0.1:60000
3. Waits for incoming RTP packets
4. Receives RTP from mediasoup
5. Decodes, processes, and muxes to MP4

### 6. Start Consumers

```typescript
const consumer = await audioTransport.consume({
  producerId: producer.id,
  rtpCapabilities: router.rtpCapabilities,
  paused: true,
});

await consumer.resume();  // Start sending RTP
```

When resumed:
- mediasoup sends RTP packets FROM `tuple.localPort` TO `60000`
- FFmpeg receives those packets AT `60000`

## Configuration

### Required Environment Variables

```env
# mediasoup RTC ports
MEDIASOUP_RTC_MIN_PORT=2000
MEDIASOUP_RTC_MAX_PORT=2420

# FFmpeg recording ports
RECORDING_PORT_MIN=60000
RECORDING_PORT_MAX=60010
RECORDING_BIND_IP=127.0.0.1

# FFmpeg path
RECORDING_FFMPEG_PATH=ffmpeg
```

## Why This Works

### Previous Issues

**Problem 1**: Tried to make FFmpeg and mediasoup share the same ports
- Both tried to bind 60000 → conflict → "bind failed"

**Problem 2**: Used `comedia: true` without FFmpeg sending first
- mediasoup waited to learn destination
- FFmpeg only received, never sent
- mediasoup never learned where to send → no RTP flow

### Current Solution

✅ **Separate port ranges**: No binding conflicts  
✅ **Explicit `transport.connect()`**: mediasoup knows where to send  
✅ **`comedia: false`**: Destination configured, not learned  
✅ **`a=recvonly` in SDP**: FFmpeg correctly configured as receiver  

## Troubleshooting

### If FFmpeg shows "bind failed"

1. **Check port ranges don't overlap**: RTC and Recording ranges must be separate
2. **Check ports aren't in use**: `netstat -ano | findstr ":60000"`
3. **Check logs**: mediasoup tuple should show different port than FFmpeg port

### If no RTP received

1. **Check `transport.connect()` was called**: Logs should show "Connected PlainTransports"
2. **Check consumers are resumed**: `await consumer.resume()`
3. **Check firewall**: Localhost should be allowed, but verify
4. **Check FFmpeg logs**: Look for "Invalid data" errors

### Expected Log Flow

```
1. Allocated FFmpeg listening ports: { audioPort: 60000, videoPort: 60001 }
2. Created PlainTransports: { audioPort: 2264, videoPort: 2300 }
3. Connected PlainTransports to FFmpeg ports
4. Starting FFmpeg...
5. FFmpeg process started
6. Attached producer (audio) to recording
7. Attached producer (video) to recording
8. [FFmpeg receives RTP and processes]
```

## Summary

- **mediasoup** binds RTC ports (2000-2420) to send FROM
- **FFmpeg** binds recording ports (60000-60010) to receive AT
- **mediasoup** explicitly told to send TO FFmpeg ports
- **No port conflicts** because ranges are separate
- **RTP flows** from mediasoup → FFmpeg successfully

This is the correct and robust architecture for mediasoup + FFmpeg recording!

