import { z } from 'zod';

/**
 * Validation schemas for socket.io media events
 */

// Create Transport event
export const createTransportSchema = z.object({
  isProducer: z.boolean(),
});

// Connect Transport event
// dtlsParameters is a complex Mediasoup object, we validate structure
export const connectTransportSchema = z.object({
  transportId: z.string().min(1, 'Transport ID is required'),
  dtlsParameters: z.object({
    role: z.enum(['auto', 'client', 'server']),
    fingerprints: z.array(z.object({
      algorithm: z.string(),
      value: z.string(),
    })),
  }).passthrough(), // Allow additional fields
});

// Produce event
// rtpParameters is a complex Mediasoup object
export const produceSchema = z.object({
  transportId: z.string().min(1, 'Transport ID is required'),
  kind: z.enum(['audio', 'video'], {
    errorMap: () => ({ message: 'Kind must be either "audio" or "video"' }),
  }),
  rtpParameters: z.object({
    mid: z.string().optional(),
    codecs: z.array(z.any()),
    headerExtensions: z.array(z.any()).optional(),
    encodings: z.array(z.any()).optional(),
    rtcp: z.object({
      cname: z.string().optional(),
      reducedSize: z.boolean().optional(),
    }).optional(),
  }).passthrough(), // Allow additional Mediasoup-specific fields
  appData: z.record(z.any()).optional(), // Optional metadata
});

// Consume event
// rtpCapabilities is a complex Mediasoup object
export const consumeSchema = z.object({
  transportId: z.string().min(1, 'Transport ID is required'),
  producerId: z.string().min(1, 'Producer ID is required'),
  rtpCapabilities: z.object({
    codecs: z.array(z.any()),
    headerExtensions: z.array(z.any()).optional(),
  }).passthrough(), // Allow additional Mediasoup-specific fields
});

// Close Producer event
export const closeProducerSchema = z.object({
  producerId: z.string().min(1, 'Producer ID is required'),
});

// Pause Producer event
export const pauseProducerSchema = z.object({
  producerId: z.string().min(1, 'Producer ID is required'),
});

// Resume Producer event
export const resumeProducerSchema = z.object({
  producerId: z.string().min(1, 'Producer ID is required'),
});

// Replace Track event
export const replaceTrackSchema = z.object({
  producerId: z.string().min(1, 'Producer ID is required'),
});

