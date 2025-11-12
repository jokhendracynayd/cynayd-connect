import { EventEmitter } from 'events';
import * as mediasoup from 'mediasoup';
import type { Router, PlainTransport, Consumer, Producer } from 'mediasoup/node/lib/types';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { config } from '../shared/config';
import { mediasoupConfig } from '../shared/config/mediasoup.config';
import { logger } from '../shared/utils/logger';
import {
  RecordingAssetType,
  RecordingStatus,
  RoomService,
  RecordingAssetCreateOptions,
  RecordingSessionCreateOptions,
  RecordingAssetRecord,
  RecordingSessionRecord,
} from '../shared/services/rooms.service';
import { RedisStateService } from '../shared/services/state.redis';
import RecordingStorageService from '../shared/services/storage.s3';

type PlainTransportTuple = mediasoup.types.PlainTransport['tuple'];

interface RecordingTransportInfo {
  transport: PlainTransport;
  port: number;
  tuple?: PlainTransportTuple;
}

type VideoRole = 'primary' | 'pip';

interface TrackedConsumer {
  consumer: Consumer;
  producerId: string;
  source: string;
  kind: 'audio' | 'video';
  role?: VideoRole;
}

interface RecordingFiles {
  sdpPath: string;
  rawOutputPath: string;
  compositeOutputPath: string;
  logPath: string;
}

interface RecordingState {
  session: RecordingSessionRecord;
  roomId: string;
  roomCode?: string;
  hostId: string;
  router: Router;
  transports: {
    audio: RecordingTransportInfo;
    video: RecordingTransportInfo;
  };
  consumers: Map<string, TrackedConsumer>;
  ffmpeg?: ChildProcessWithoutNullStreams;
  files: RecordingFiles;
  status: RecordingStatus;
  startedAt: Date;
  stopRequested: boolean;
  uploadQueued: boolean;
}

interface StartRecordingParams {
  roomId: string;
  hostId: string;
  router: Router;
  roomCode?: string;
}

interface StopRecordingParams {
  roomId: string;
  roomCode?: string;
  reason?: string;
  failure?: boolean;
}

interface ProducerMetadata {
  source?: string;
}

interface RecordingStartCleanupContext {
  roomId: string;
  audioTransport?: PlainTransport;
  videoTransport?: PlainTransport;
  allocatedPorts: number[];
  session?: RecordingSessionRecord;
  state?: RecordingState;
  stateRegistered: boolean;
  redisEntryCreated: boolean;
}

interface RecordingPersistenceResult {
  asset: RecordingAssetRecord | null;
  uploaded: boolean;
  error?: Error;
}

type RecordingEventPayloads = {
  'recording-started': { roomId: string; roomCode?: string; session: RecordingSessionRecord };
  'recording-stopped': {
    roomId: string;
    roomCode?: string;
    session: RecordingSessionRecord;
    asset?: RecordingAssetRecord | null;
    error?: Error;
  };
  'recording-error': { roomId: string; sessionId: string; error: Error };
  'track-attached': { roomId: string; producerId: string; source?: string; kind: 'audio' | 'video' };
};

/**
 * RecordingManager centralises mediasoup plain transports, FFmpeg process lifecycle,
 * and persistence hooks for server-side session recording.
 *
 * Responsibilities:
 *  - Provision recording plain transports (audio/video)
 *  - Attach producer consumers for each track and forward RTP to FFmpeg
 *  - Spawn/monitor FFmpeg composite pipeline (screen-share dominant + PiP overlay)
 *  - Persist session status/metadata via RoomService
 *  - Emit structured events for downstream automation (upload, analytics, UI sync)
 */
export class RecordingManager {
  private static readonly recorderEmitter = new EventEmitter();
  private static readonly recordings = new Map<string, RecordingState>();
  private static readonly allocatedFfmpegPorts = new Set<number>();

  static on<K extends keyof RecordingEventPayloads>(
    event: K,
    listener: (payload: RecordingEventPayloads[K]) => void
  ) {
    this.recorderEmitter.on(event, listener);
  }

  static once<K extends keyof RecordingEventPayloads>(
    event: K,
    listener: (payload: RecordingEventPayloads[K]) => void
  ) {
    this.recorderEmitter.once(event, listener);
  }

  static off<K extends keyof RecordingEventPayloads>(
    event: K,
    listener: (payload: RecordingEventPayloads[K]) => void
  ) {
    this.recorderEmitter.off(event, listener);
  }

  static getState(roomId: string): RecordingState | undefined {
    return this.recordings.get(roomId);
  }

  static isRecording(roomId: string): boolean {
    const state = this.recordings.get(roomId);
    return !!state && !state.stopRequested;
  }

  static getActiveRecordingCount(): number {
    let count = 0;
    this.recordings.forEach(state => {
      if (!state.stopRequested) {
        count += 1;
      }
    });
    return count;
  }

  static async startRecording(params: StartRecordingParams): Promise<RecordingSessionRecord> {
    const { roomId, hostId, router, roomCode } = params;

    if (!config.recording.enabled) {
      throw new Error('Server-side recording is disabled via configuration');
    }

    if (this.recordings.has(roomId)) {
      throw new Error(`Recording already active for room ${roomId}`);
    }

    await this.ensureTmpDir();

    // Allocate dedicated ports for FFmpeg to listen on
    const allocatedPorts: number[] = [];
    let audioFfmpegPort: number | undefined;
    let videoFfmpegPort: number | undefined;
    let audioTransport: PlainTransport | undefined;
    let videoTransport: PlainTransport | undefined;
    let session: RecordingSessionRecord | undefined;
    let state: RecordingState | undefined;
    let stateRegistered = false;
    let redisEntryCreated = false;

    try {
      audioFfmpegPort = await this.allocateFfmpegPort();
      allocatedPorts.push(audioFfmpegPort);
      videoFfmpegPort = await this.allocateFfmpegPort();
      allocatedPorts.push(videoFfmpegPort);

      logger.info(`Allocated FFmpeg listening ports for room ${roomId}`, {
        audioPort: audioFfmpegPort,
        videoPort: videoFfmpegPort,
        roomId,
      });

      // Create PlainTransports and configure them to send to FFmpeg
      audioTransport = await this.createPlainTransport(router);
      videoTransport = await this.createPlainTransport(router);

      // Tell mediasoup where to send RTP (to FFmpeg's listening ports)
      await audioTransport.connect({
        ip: config.recording.network.ip,
        port: audioFfmpegPort,
      });

      await videoTransport.connect({
        ip: config.recording.network.ip,
        port: videoFfmpegPort,
      });

      logger.info(`Connected PlainTransports to FFmpeg ports for room ${roomId}`, {
        audio: {
          mediasoupPort: audioTransport.tuple.localPort,
          ffmpegPort: audioFfmpegPort,
        },
        video: {
          mediasoupPort: videoTransport.tuple.localPort,
          ffmpegPort: videoFfmpegPort,
        },
        roomId,
      });

      // Use FFmpeg ports for the SDP (where FFmpeg will listen)
      const audioPort = audioFfmpegPort;
      const videoPort = videoFfmpegPort;

      const sessionOptions: RecordingSessionCreateOptions = {
        roomId,
        hostId,
        status: RecordingStatus.STARTING,
      };

      session = await RoomService.createRecordingSession(sessionOptions);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const baseName = `${roomId}-${session.id}-${timestamp}`;
      const files: RecordingFiles = {
        sdpPath: path.join(config.recording.tmpDir, `${baseName}.sdp`),
        rawOutputPath: path.join(config.recording.tmpDir, `${baseName}.webm`),
        compositeOutputPath: path.join(config.recording.tmpDir, `${baseName}.mp4`),
        logPath: path.join(config.recording.tmpDir, `${baseName}.log`),
      };

      state = {
        session,
        roomId,
        roomCode,
        hostId,
        router,
        transports: {
          audio: { transport: audioTransport, port: audioPort, tuple: audioTransport.tuple },
          video: { transport: videoTransport, port: videoPort, tuple: videoTransport.tuple },
        },
        consumers: new Map(),
        files,
        status: RecordingStatus.STARTING,
        startedAt: new Date(),
        stopRequested: false,
        uploadQueued: false,
      };

      this.recordings.set(roomId, state);
      stateRegistered = true;

      await RedisStateService.storeRecordingState({
        roomId,
        sessionId: session.id,
        status: RecordingStatus.STARTING,
        startedAt: state.startedAt.getTime(),
        updatedAt: Date.now(),
        hostId,
      });
      redisEntryCreated = true;

      this.recorderEmitter.emit('recording-started', { roomId, roomCode, session });

      logger.info(`Recording session ${session.id} initialised for room ${roomId}`, {
        roomId,
        sessionId: session.id,
        audioPort,
        videoPort,
        tmpDir: config.recording.tmpDir,
      });

      return session;
    } catch (error) {
      await this.rollbackFailedStart(
        {
          roomId,
          audioTransport,
          videoTransport,
          allocatedPorts,
          session,
          state,
          stateRegistered,
          redisEntryCreated,
        },
        error as Error
      );
      throw error;
    }
  }

  static async stopRecording(params: StopRecordingParams): Promise<void> {
    const { roomId, reason, failure, roomCode } = params;
    const state = this.recordings.get(roomId);

    if (!state) {
      logger.warn(`Stop recording requested for non-active room ${roomId}`);
      return;
    }

    if (state.stopRequested) {
      logger.debug(`Stop recording already in progress for room ${roomId}`);
      return;
    }

    state.stopRequested = true;

    const teardownTasks: Promise<unknown>[] = [];

    // Stop consumers first to avoid new RTP
    for (const tracked of state.consumers.values()) {
      teardownTasks.push(
        (async () => {
          try {
            tracked.consumer.close();
          } catch (error) {
            logger.error(`Failed to close consumer ${tracked.consumer.id}`, { error });
          }
        })()
      );
    }

    // Stop FFmpeg
    if (state.ffmpeg) {
      teardownTasks.push(this.terminateFfmpeg(state));
    }

    // Close transports
    teardownTasks.push(
      (async () => {
        try {
          state.transports.audio.transport.close();
        } catch (error) {
          logger.warn('Failed to close audio recording transport', { error });
        }
      })(),
      (async () => {
        try {
          state.transports.video.transport.close();
        } catch (error) {
          logger.warn('Failed to close video recording transport', { error });
        }
      })()
    );

    await Promise.allSettled(teardownTasks);

    // Release FFmpeg ports
    this.releaseFfmpegPort(state.transports.audio.port);
    this.releaseFfmpegPort(state.transports.video.port);

    const endedAt = new Date();
    const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - state.startedAt.getTime()) / 1000));
    let finalFailure = failure ?? false;
    let finalFailureReason =
      finalFailure && reason ? reason : finalFailure ? 'Recording stopped due to failure' : null;
    const nextStatus = finalFailure ? RecordingStatus.FAILED : RecordingStatus.UPLOADING;

    const updates = {
      status: nextStatus,
      endedAt,
      durationSeconds,
      failureReason: failure ? reason ?? 'Recording stopped due to failure' : reason ?? null,
    };

    let session = await RoomService.updateRecordingSession(state.session.id, updates);

    await RedisStateService.storeRecordingState({
      roomId,
      sessionId: session.id,
      status: nextStatus,
      startedAt: state.startedAt.getTime(),
      updatedAt: Date.now(),
      hostId: state.hostId,
    });
    const {
      asset: assetRecord,
      uploaded,
      error: persistenceError,
    } = await this.persistCompositeAsset(
      state,
      finalFailure
    );

    if (uploaded) {
      session = await RoomService.updateRecordingSession(state.session.id, {
        status: RecordingStatus.COMPLETED,
      });
      await RedisStateService.storeRecordingState({
        roomId,
        sessionId: session.id,
        status: RecordingStatus.COMPLETED,
        startedAt: state.startedAt.getTime(),
        updatedAt: Date.now(),
        hostId: state.hostId,
      });
    }
    if (!uploaded && !finalFailure) {
      if (config.recording.s3.bucket && persistenceError) {
        finalFailure = true;
        finalFailureReason = persistenceError.message || 'Recording upload failed';
        session = await RoomService.updateRecordingSession(state.session.id, {
          status: RecordingStatus.FAILED,
          failureReason: finalFailureReason,
        });
        await RedisStateService.storeRecordingState({
          roomId,
          sessionId: session.id,
          status: RecordingStatus.FAILED,
          startedAt: state.startedAt.getTime(),
          updatedAt: Date.now(),
          hostId: state.hostId,
        });
      } else {
        session = await RoomService.updateRecordingSession(state.session.id, {
          status: RecordingStatus.COMPLETED,
          failureReason: null,
        });
        await RedisStateService.storeRecordingState({
          roomId,
          sessionId: session.id,
          status: RecordingStatus.COMPLETED,
          startedAt: state.startedAt.getTime(),
          updatedAt: Date.now(),
          hostId: state.hostId,
        });
      }
    }

    this.recordings.delete(roomId);
    await RedisStateService.removeRecordingState(roomId);

    const error = finalFailureReason ? new Error(finalFailureReason) : undefined;
    this.recorderEmitter.emit('recording-stopped', {
      roomId,
      roomCode: roomCode ?? state.roomCode,
      session,
      asset: assetRecord ?? undefined,
      error,
    });
  }

  static async handleProducerAdded(
    roomId: string,
    producer: Producer,
    metadata: ProducerMetadata = {}
  ): Promise<void> {
    const state = this.recordings.get(roomId);
    if (!state) {
      return;
    }

    // Don't attach new producers if recording is stopping or failed
    if (state.stopRequested || state.status === RecordingStatus.FAILED) {
      logger.debug(`Skipping producer attachment - recording is stopping or failed`, {
        roomId,
        producerId: producer.id,
        status: state.status,
        stopRequested: state.stopRequested,
      });
      return;
    }

    const source = metadata.source || (producer.appData?.source as string) || producer.kind;
    const kind = producer.kind as 'audio' | 'video';

    if (state.consumers.has(producer.id)) {
      logger.debug(`Producer ${producer.id} already attached to recording`, { roomId, source });
      return;
    }

    const transportInfo =
      kind === 'audio' ? state.transports.audio : state.transports.video;

    try {
      const consumer = await (transportInfo.transport as any).consume({
        producerId: producer.id,
        rtpCapabilities: state.router.rtpCapabilities,
        paused: true,
      });

      const tracked: TrackedConsumer = {
        consumer,
        producerId: producer.id,
        source,
        kind,
      };

      if (kind === 'video') {
        tracked.role = this.assignVideoRole(state, source);
      }

      state.consumers.set(producer.id, tracked);

      consumer.on('transportclose', () => {
        logger.warn(`Recording consumer transport closed for producer ${producer.id}`, { roomId });
        this.handleProducerRemoved(roomId, producer.id).catch(error =>
          logger.error('Error removing producer after transport close', { error })
        );
      });

      consumer.on('producerclose', () => {
        logger.info(`Producer ${producer.id} closed during recording`, { roomId });
        this.handleProducerRemoved(roomId, producer.id).catch(error =>
          logger.error('Error handling producer close for recording', { error })
        );
      });

      // Resume consumer once ffmpeg ready
      await this.startFfmpegIfNeeded(state);

      await consumer.resume();

      this.recorderEmitter.emit('track-attached', {
        roomId,
        producerId: producer.id,
        source,
        kind,
      });

      logger.info(`Attached producer ${producer.id} (${kind}/${source}) to recording`, {
        roomId,
        sessionId: state.session.id,
        consumerId: consumer.id,
      });
    } catch (error) {
      logger.error(`Failed to attach producer ${producer.id} to recording`, { roomId, error });
    }
  }

  static async handleProducerRemoved(roomId: string, producerId: string): Promise<void> {
    const state = this.recordings.get(roomId);
    if (!state) return;

    const tracked = state.consumers.get(producerId);
    if (!tracked) return;

    try {
      state.consumers.delete(producerId);
      await tracked.consumer.close();
      logger.info(`Detached producer ${producerId} from recording`, { roomId });
    } catch (error) {
      logger.error(`Failed to detach producer ${producerId}`, { roomId, error });
    }

    if (tracked.kind === 'video' && state.ffmpeg) {
      logger.warn(
        `Video track ${producerId} removed while recording; composite may be degraded (restart recommended)`,
        { roomId }
      );
    }
  }

  private static async createPlainTransport(
    router: Router
  ): Promise<PlainTransport> {
    const listenIp = mediasoupConfig.plainTransport?.listenIp ?? {
      ip: config.recording.network.ip,
      announcedIp:
        config.recording.network.ip === '127.0.0.1' ? undefined : config.recording.network.ip,
    };

    // Create PlainTransport - mediasoup binds a local port to send RTP from
    // With rtcpMux, it uses the same port for RTCP
    const transport = await router.createPlainTransport({
      listenIp,
      rtcpMux: true,
      comedia: false,  // We'll configure the destination explicitly later if needed
      enableSrtp: false,
    });

    logger.debug(`Created PlainTransport for recording`, {
      localPort: transport.tuple.localPort,
      localIp: transport.tuple.localIp,
      transportId: transport.id,
    });

    return transport;
  }

  private static assignVideoRole(state: RecordingState, source: string): VideoRole {
    if (!Array.from(state.consumers.values()).some(c => c.kind === 'video' && c.role === 'primary')) {
      return 'primary';
    }
    if (
      source === 'screen' &&
      !Array.from(state.consumers.values()).some(c => c.kind === 'video' && c.source === 'screen')
    ) {
      return 'primary';
    }
    if (
      !Array.from(state.consumers.values()).some(c => c.kind === 'video' && c.role === 'pip')
    ) {
      return 'pip';
    }
    return 'pip';
  }

  private static async startFfmpegIfNeeded(state: RecordingState): Promise<void> {
    if (state.ffmpeg) {
      return;
    }

    // Prevent restart if already failed or stopping
    if (state.stopRequested || state.status === RecordingStatus.FAILED) {
      logger.debug(`Skipping FFmpeg start - recording is stopping or failed`, {
        roomId: state.roomId,
        status: state.status,
        stopRequested: state.stopRequested,
      });
      return;
    }

    const audioConsumers = Array.from(state.consumers.values()).filter(
      c => c.kind === 'audio'
    );
    const videoConsumers = Array.from(state.consumers.values()).filter(
      c => c.kind === 'video'
    );

    if (videoConsumers.length === 0) {
      logger.debug(`Waiting for at least one video track before starting FFmpeg`, {
        roomId: state.roomId,
      });
      return;
    }

    try {
      const sdpContent = this.buildSdp(state, audioConsumers, videoConsumers);
      await fs.writeFile(state.files.sdpPath, sdpContent, 'utf-8');

      const ffmpegArgs = this.buildFfmpegArgs(state, audioConsumers, videoConsumers);
      await this.ensureFileDirectory(state.files.compositeOutputPath);

      logger.info(`Starting FFmpeg for room ${state.roomId}`, {
        roomId: state.roomId,
        ffmpegPath: config.recording.ffmpegPath,
        args: ffmpegArgs.join(' '),
        sdpContent,
      });

      // Small delay to ensure PlainTransports are fully established
      await new Promise(resolve => setTimeout(resolve, 100));

      const ffmpegProcess = spawn(config.recording.ffmpegPath, ffmpegArgs, {
        windowsHide: true,
      });

      state.ffmpeg = ffmpegProcess;
      state.status = RecordingStatus.RECORDING;
      await RoomService.updateRecordingSession(state.session.id, {
        status: RecordingStatus.RECORDING,
        failureReason: null,
      });
      await RedisStateService.storeRecordingState({
        roomId: state.roomId,
        sessionId: state.session.id,
        status: RecordingStatus.RECORDING,
        startedAt: state.startedAt.getTime(),
        updatedAt: Date.now(),
        hostId: state.hostId,
      });

      ffmpegProcess.stdout?.on('data', data => {
        fs.appendFile(state.files.logPath, `[stdout] ${data.toString()}`).catch(() => undefined);
      });

      ffmpegProcess.stderr?.on('data', data => {
        fs.appendFile(state.files.logPath, data.toString()).catch(() => undefined);
      });

      ffmpegProcess.on('error', (error) => {
        logger.error(`FFmpeg process error for room ${state.roomId}`, {
          roomId: state.roomId,
          error: error.message,
        });
        fs.appendFile(state.files.logPath, `[error] ${error.message}\n`).catch(() => undefined);
      });

      ffmpegProcess.on('exit', (code, signal) => {
        logger.info(`FFmpeg exited for room ${state.roomId}`, {
          roomId: state.roomId,
          code,
          signal,
        });

        state.ffmpeg = undefined;

        if (!state.stopRequested && code !== 0) {
          // Mark as failed immediately to prevent restart attempts
          state.status = RecordingStatus.FAILED;
          
          const error = new Error(`FFmpeg exited unexpectedly with code ${code}, signal ${signal}`);
          this.recorderEmitter.emit('recording-error', {
            roomId: state.roomId,
            sessionId: state.session.id,
            error,
          });
          this.stopRecording({
            roomId: state.roomId,
            reason: error.message,
            failure: true,
          }).catch(err => logger.error('Failed to stop recording after FFmpeg error', { err }));
        }
      });

      for (const consumer of state.consumers.values()) {
        await consumer.consumer.resume();
      }

      logger.info(`FFmpeg process started for room ${state.roomId}`, {
        roomId: state.roomId,
        sessionId: state.session.id,
        sdpPath: state.files.sdpPath,
        compositeOutputPath: state.files.compositeOutputPath,
      });
    } catch (error) {
      logger.error(`Failed to start FFmpeg for room ${state.roomId}`, { error });
      await RoomService.updateRecordingSession(state.session.id, {
        status: RecordingStatus.FAILED,
        failureReason: (error as Error).message,
      });
      await RedisStateService.storeRecordingState({
        roomId: state.roomId,
        sessionId: state.session.id,
        status: RecordingStatus.FAILED,
        startedAt: state.startedAt.getTime(),
        updatedAt: Date.now(),
        hostId: state.hostId,
      });
      throw error;
    }
  }

  private static buildSdp(
    state: RecordingState,
    audioConsumers: TrackedConsumer[],
    videoConsumers: TrackedConsumer[]
  ): string {
    const lines: string[] = [
      'v=0',
      `o=- 0 0 IN IP4 ${config.recording.network.ip}`,
      's=connect-sdk-recording',
      't=0 0',
    ];

    const appendCodecAttributes = (codec: mediasoup.types.RtpCodecParameters) => {
      const subLines: string[] = [];
      const codecName = codec.mimeType.split('/')[1];
      const channelsPart =
        typeof codec.channels === 'number' && codec.channels > 1 ? `/${codec.channels}` : '';
      subLines.push(`a=rtpmap:${codec.payloadType} ${codecName}/${codec.clockRate}${channelsPart}`);
      if (codec.parameters && Object.keys(codec.parameters).length > 0) {
        const params = Object.entries(codec.parameters)
          .map(([key, value]) => `${key}=${value}`)
          .join(';');
        subLines.push(`a=fmtp:${codec.payloadType} ${params}`);
      }
      if (codec.rtcpFeedback && codec.rtcpFeedback.length > 0) {
        for (const fb of codec.rtcpFeedback) {
          subLines.push(
            `a=rtcp-fb:${codec.payloadType} ${fb.type}${fb.parameter ? ` ${fb.parameter}` : ''}`
          );
        }
      }
      return subLines;
    };

    const addMediaSection = (
      mediaType: 'audio' | 'video',
      transport: RecordingTransportInfo,
      consumersForType: TrackedConsumer[]
    ) => {
      if (consumersForType.length === 0) {
        return;
      }

      const codecFilter = mediaType === 'audio' ? 'audio/' : 'video/';
      const codecs: mediasoup.types.RtpCodecParameters[] = [];

      consumersForType.forEach(({ consumer }) => {
        consumer.rtpParameters.codecs
          .filter(codec => codec.mimeType.toLowerCase().startsWith(codecFilter))
          .forEach(codec => {
            if (!codecs.some(existing => existing.payloadType === codec.payloadType)) {
              codecs.push(codec);
            }
          });
      });

      if (codecs.length === 0) {
        return;
      }

      const payloadList = codecs.map(codec => codec.payloadType).join(' ');
      lines.push(`m=${mediaType} ${transport.port} RTP/AVP ${payloadList}`);
      lines.push(`c=IN IP4 ${config.recording.network.ip}`);
      lines.push('a=rtcp-mux');
      lines.push('a=recvonly');

      codecs.forEach(codec => {
        lines.push(...appendCodecAttributes(codec));
      });

      consumersForType.forEach(({ consumer }) => {
        const encodings = consumer.rtpParameters.encodings ?? [];
        encodings.forEach(encoding => {
          if (encoding?.ssrc) {
            lines.push(`a=ssrc:${encoding.ssrc} cname:connect-sdk-recorder`);
          }
        });
      });
    };

    addMediaSection('audio', state.transports.audio, audioConsumers);
    addMediaSection('video', state.transports.video, videoConsumers);

    return `${lines.join(os.EOL)}${os.EOL}`;
  }

  private static buildFfmpegArgs(
    state: RecordingState,
    audioConsumers: TrackedConsumer[],
    videoConsumers: TrackedConsumer[]
  ): string[] {
    const args: string[] = [
      '-re',  // Read input at native frame rate
      '-protocol_whitelist',
      'file,udp,rtp',
      '-fflags',
      '+genpts',
      '-loglevel',
      'verbose',  // More detailed logging for debugging
      '-nostdin',
      '-i',
      state.files.sdpPath,
    ];

    const hasAudio = audioConsumers.length > 0;
    const primaryVideoIndex = this.selectPrimaryVideoIndex(videoConsumers);
    const pipVideoIndex = this.selectPipVideoIndex(videoConsumers, primaryVideoIndex);

    if (hasAudio) {
      args.push('-map', '0:a:0');
      args.push('-c:a', 'aac', '-b:a', '128k');
    }

    if (primaryVideoIndex !== null) {
      if (pipVideoIndex !== null) {
        const filter = `[0:v:${primaryVideoIndex}]scale=iw:-1[base];` +
          `[0:v:${pipVideoIndex}]scale=iw*0.25:-1[pip];` +
          `[base][pip]overlay=W-w-40:H-h-40:format=auto[vout]`;
        args.push('-filter_complex', filter, '-map', '[vout]');
      } else {
        args.push('-map', `0:v:${primaryVideoIndex}`);
      }
      args.push(
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-profile:v',
        'high',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart'
      );
    }

    args.push(state.files.compositeOutputPath);
    return args;
  }

  private static selectPrimaryVideoIndex(videoConsumers: TrackedConsumer[]): number | null {
    if (videoConsumers.length === 0) return null;
    const primary = videoConsumers.findIndex(c => c.role === 'primary' || c.source === 'screen');
    if (primary >= 0) return primary;
    return 0;
  }

  private static selectPipVideoIndex(
    videoConsumers: TrackedConsumer[],
    primaryIndex: number | null
  ): number | null {
    if (videoConsumers.length < 2) return null;
    const pip = videoConsumers.findIndex(
      (c, idx) => idx !== primaryIndex && (c.role === 'pip' || c.source === 'camera')
    );
    return pip >= 0 ? pip : null;
  }

  private static async ensureTmpDir(): Promise<void> {
    await fs.mkdir(config.recording.tmpDir, { recursive: true });
  }

  private static async ensureFileDirectory(filePath: string): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
  }

  private static async allocateFfmpegPort(): Promise<number> {
    const { min, max } = config.recording.network.portRange;

    // Try to find an available port in the configured range
    for (let port = min; port <= max; port++) {
      if (this.allocatedFfmpegPorts.has(port)) {
        continue;
      }

      // Mark as allocated immediately to prevent race conditions
      this.allocatedFfmpegPorts.add(port);
      return port;
    }

    throw new Error('No available UDP ports for FFmpeg within configured range');
  }

  private static releaseFfmpegPort(port: number): void {
    this.allocatedFfmpegPorts.delete(port);
  }

  private static async terminateFfmpeg(state: RecordingState): Promise<void> {
    if (!state.ffmpeg) return;

    return new Promise(resolve => {
      const ffmpeg = state.ffmpeg!;
      const timeout = setTimeout(() => {
        if (!ffmpeg.killed) {
          ffmpeg.kill('SIGKILL');
        }
      }, 5_000);

      ffmpeg.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });

      ffmpeg.kill('SIGINT');
    });
  }

  private static async persistCompositeAsset(
    state: RecordingState,
    failed: boolean
  ): Promise<RecordingPersistenceResult> {
    if (failed) {
      return { asset: null, uploaded: false };
    }

    try {
      const stats = await fs.stat(state.files.compositeOutputPath);

      const assetOptions: RecordingAssetCreateOptions = {
        sessionId: state.session.id,
        type: RecordingAssetType.COMPOSITE,
        storageBucket: config.recording.s3.bucket || 'pending',
        storageKey: path.basename(state.files.compositeOutputPath),
        storageRegion: config.recording.s3.region,
        sizeBytes: BigInt(stats.size),
        durationSeconds: Math.max(
          0,
          Math.round((stats.mtime.getTime() - state.startedAt.getTime()) / 1000)
        ),
        format: 'mp4',
        metadata: {
          layout: config.recording.layout,
          participants: Array.from(state.consumers.values()).map(c => ({
            producerId: c.producerId,
            source: c.source,
            kind: c.kind,
          })),
        },
      };

      const asset = await RoomService.createRecordingAsset(assetOptions);

      if (config.recording.s3.bucket) {
        try {
          const targetKey =
            config.recording.s3.prefix + `${state.session.id}/composite.mp4`;

          const uploadResult = await RecordingStorageService.uploadCompositeRecording({
            localPath: state.files.compositeOutputPath,
            sessionId: state.session.id,
            bucket: config.recording.s3.bucket,
            objectKey: targetKey,
            contentType: 'video/mp4',
            metadata: {
              roomId: state.roomId,
              sessionId: state.session.id,
            },
            tags: {
              roomId: state.roomId,
              sessionId: state.session.id,
            },
          });

          const updated = await RoomService.updateRecordingAsset(asset.id, {
            storageBucket: uploadResult.bucket,
            storageKey: uploadResult.key,
            sizeBytes: uploadResult.sizeBytes ?? stats.size,
            uploadedAt: new Date(),
          });

          return { asset: updated, uploaded: true };
        } catch (uploadError) {
          logger.error('Failed to upload recording artifact to S3', {
            roomId: state.roomId,
            sessionId: state.session.id,
            error: uploadError,
          });
          const normalized =
            uploadError instanceof Error
              ? uploadError
              : new Error('Failed to upload recording artifact to S3');
          return { asset, uploaded: false, error: normalized };
        }
      }

      return { asset, uploaded: false };
    } catch (error) {
      logger.error('Failed to persist recording asset metadata', {
        roomId: state.roomId,
        sessionId: state.session.id,
        error,
      });
      const normalized = error instanceof Error ? error : new Error('Failed to persist recording asset metadata');
      return { asset: null, uploaded: false, error: normalized };
    }
  }

  private static async rollbackFailedStart(
    context: RecordingStartCleanupContext,
    error: Error
  ): Promise<void> {
    logger.error('Recording start failed, rolling back', {
      roomId: context.roomId,
      error: error.message,
    });

    if (context.stateRegistered) {
      this.recordings.delete(context.roomId);
    }

    const cleanupTasks: Promise<unknown>[] = [];

    if (context.audioTransport) {
      cleanupTasks.push(
        Promise.resolve().then(() => {
          try {
            context.audioTransport?.close();
          } catch (closeError) {
            logger.warn('Failed to close audio transport during rollback', {
              roomId: context.roomId,
              error: closeError,
            });
          }
        })
      );
    }

    if (context.videoTransport) {
      cleanupTasks.push(
        Promise.resolve().then(() => {
          try {
            context.videoTransport?.close();
          } catch (closeError) {
            logger.warn('Failed to close video transport during rollback', {
              roomId: context.roomId,
              error: closeError,
            });
          }
        })
      );
    }

    const portsToRelease = new Set<number>();
    context.allocatedPorts.forEach(port => portsToRelease.add(port));
    if (context.state) {
      portsToRelease.add(context.state.transports.audio.port);
      portsToRelease.add(context.state.transports.video.port);
    }
    portsToRelease.forEach(port => {
      if (typeof port === 'number' && Number.isFinite(port)) {
        this.releaseFfmpegPort(port);
      }
    });

    if (context.redisEntryCreated) {
      cleanupTasks.push(
        RedisStateService.removeRecordingState(context.roomId).catch(removeError => {
          logger.warn('Failed to remove Redis recording state during rollback', {
            roomId: context.roomId,
            error: removeError,
          });
        })
      );
    }

    if (context.session) {
      cleanupTasks.push(
        RoomService.updateRecordingSession(context.session.id, {
          status: RecordingStatus.FAILED,
          failureReason: error.message,
          endedAt: new Date(),
        }).catch(updateError => {
          logger.warn('Failed to update recording session during rollback', {
            roomId: context.roomId,
            error: updateError,
          });
        })
      );
    }

    if (context.state?.files) {
      const { sdpPath, rawOutputPath, compositeOutputPath, logPath } = context.state.files;
      const filePaths = [sdpPath, rawOutputPath, compositeOutputPath, logPath];
      for (const filePath of filePaths) {
        if (filePath) {
          cleanupTasks.push(
            fs.rm(filePath, { force: true }).catch(() => undefined)
          );
        }
      }
    }

    await Promise.allSettled(cleanupTasks);
  }
}

export default RecordingManager;

