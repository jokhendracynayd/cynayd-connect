import { config } from './index';
import { getAnnouncedIP } from '../utils/network';

export const mediasoupConfig = {
  // Worker settings
  // Optimized for scale: Multiple workers for better CPU utilization
  // Each worker handles a subset of media processing
  worker: {
    rtcMinPort: config.mediasoup.rtcMinPort,
    rtcMaxPort: config.mediasoup.rtcMaxPort,
    logLevel: config.mediasoup.logLevel,
    logTags: config.mediasoup.logTags,
    // Additional worker optimizations:
    // - Workers are created per CPU core (handled in WorkerManager)
    // - Each worker gets equal port range allocation
    // - Port range per worker = (rtcMaxPort - rtcMinPort + 1) / numWorkers
  },

  // Router settings
  // Optimized codec selection for better compatibility and performance
  router: {
    mediaCodecs: [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
        parameters: {
          minptime: 10,        // Minimum packet time (ms)
          useinbandfec: 1,     // Forward Error Correction for better quality
          // Opus-specific optimizations for WebRTC
          maxplaybackrate: 48000,
          sprop_stereo: 1,
        },
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        // VP8: Good for older clients, lower CPU usage
      },
      {
        kind: 'video',
        mimeType: 'video/VP9',
        clockRate: 90000,
        // VP9: Better compression than VP8, but higher CPU usage
        // Good for modern clients with good bandwidth
      },
      {
        kind: 'video',
        mimeType: 'video/H264',
        clockRate: 90000,
        parameters: {
          'packetization-mode': 1,  // Non-interleaved mode
          'profile-level-id': '42e01f',  // Baseline profile, Level 3.1
          'level-asymmetry-allowed': 1,
          // H.264: Best compatibility, hardware accelerated on many devices
        },
      },
      {
        kind: 'video',
        mimeType: 'video/AV1',
        clockRate: 90000,
        // AV1: Best compression, but higher CPU and newer standard
        // Optional: Only include if clients support it
      },
    ],
  },

  // WebRTC transport settings
  // Optimized for scale: Higher bitrates, better resource allocation
  webRtcTransport: {
    listenIps: [
      {
        ip: '0.0.0.0',
        // Auto-detect IP if not set in environment
        // Priority: MEDIASOUP_ANNOUNCED_IP env var > auto-detected local IP > undefined
        announcedIp: getAnnouncedIP(),
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    // Optimized bitrate settings for scale:
    // - Initial: 2.5 Mbps (good for HD video)
    // - Minimum: 1.5 Mbps (ensures acceptable quality)
    // - Max Incoming: 2.5 Mbps (per producer)
    // For larger deployments, these can be adjusted per-room or per-user
    initialAvailableOutgoingBitrate: 2500000,  // 2.5 Mbps (increased from 1 Mbps)
    minimumAvailableOutgoingBitrate: 1500000,   // 1.5 Mbps (increased from 600 Kbps)
    maxSctpMessageSize: 262144,                 // 256 KB (data channels)
    maxIncomingBitrate: 2500000,               // 2.5 Mbps per producer (increased from 1.5 Mbps)
  },
};

export type MediasoupConfig = typeof mediasoupConfig;

