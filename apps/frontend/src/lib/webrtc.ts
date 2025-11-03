import { Device } from 'mediasoup-client';
import { socketManager } from './socket';

class WebRTCManager {
  private device: Device | null = null;
  private sendTransport: any = null;
  private recvTransport: any = null;
  private producers: Map<string, any> = new Map(); // producerId -> producer
  private producersByKind: Map<'audio' | 'video', any> = new Map(); // kind -> producer
  private consumers: Map<string, any> = new Map();

  async initialize(rtpCapabilities: any) {
    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
    console.log('Device initialized');
  }

  async createSendTransport(): Promise<any> {
    const params = await socketManager.createTransport(true);
    
    const transport = this.device!.createSendTransport(params);

    // Debug: Log transport events
    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await socketManager.connectTransport(params.id, dtlsParameters);
        console.log('Send transport connected');
        callback();
      } catch (error) {
        console.error('Error connecting send transport:', error);
        errback(error as Error);
      }
    });

    transport.on('icestatechange', (state) => {
      console.log('Send transport ICE state:', state);
      if (state === 'failed' || state === 'disconnected') {
        console.error('❌ Send transport ICE connection failed or disconnected!');
      }
    });

    transport.on('connectionstatechange', (state) => {
      console.log('Send transport connection state:', state);
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        console.error('❌ Send transport connection failed! State:', state);
      } else if (state === 'connected') {
        console.log('✅ Send transport connected successfully');
      }
    });

    // Track DTLS state
    transport.on('dtlsstatechange', (state) => {
      console.log('Send transport DTLS state:', state);
      if (state === 'failed' || state === 'closed') {
        console.error('❌ Send transport DTLS failed!');
      }
    });

    transport.on('produce', async (parameters, callback, errback) => {
      try {
        const response = await socketManager.produce(
          params.id,
          parameters.kind,
          parameters.rtpParameters
        );
        callback({ id: response.id });
      } catch (error) {
        errback(error as Error);
      }
    });

    this.sendTransport = transport;
    console.log('Send transport created');
    return transport;
  }

  async createRecvTransport(): Promise<any> {
    const params = await socketManager.createTransport(false);
    
    const transport = this.device!.createRecvTransport(params);

    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await socketManager.connectTransport(params.id, dtlsParameters);
        console.log('Recv transport connected');
        callback();
      } catch (error) {
        console.error('Error connecting recv transport:', error);
        errback(error as Error);
      }
    });

    transport.on('icestatechange', (state) => {
      console.log('Recv transport ICE state:', state);
      if (state === 'failed' || state === 'disconnected') {
        console.error('❌ Recv transport ICE connection failed or disconnected!');
      }
    });

    transport.on('connectionstatechange', (state) => {
      console.log('Recv transport connection state:', state);
      if (state === 'failed' || state === 'disconnected' || state === 'closed') {
        console.error('❌ Recv transport connection failed! State:', state);
      } else if (state === 'connected') {
        console.log('✅ Recv transport connected successfully');
      }
    });

    // Track DTLS state
    transport.on('dtlsstatechange', (state) => {
      console.log('Recv transport DTLS state:', state);
      if (state === 'failed' || state === 'closed') {
        console.error('❌ Recv transport DTLS failed!');
      }
    });

    this.recvTransport = transport;
    console.log('Recv transport created');
    return transport;
  }

  async produceAudio(track: MediaStreamTrack): Promise<any> {
    if (!this.sendTransport) {
      throw new Error('Send transport not created');
    }

    const producer = await this.sendTransport.produce({ track });
    this.producers.set(producer.id, producer);
    this.producersByKind.set('audio', producer);
    console.log('Audio producer created:', producer.id);
    return producer;
  }

  async produceVideo(track: MediaStreamTrack): Promise<any> {
    if (!this.sendTransport) {
      throw new Error('Send transport not created');
    }

    const producer = await this.sendTransport.produce({
      track,
      encodings: [
        { maxBitrate: 100000 },
        { maxBitrate: 300000 },
        { maxBitrate: 900000 },
      ],
    });
    this.producers.set(producer.id, producer);
    this.producersByKind.set('video', producer);
    console.log('Video producer created:', producer.id);
    return producer;
  }

  async consumeProducer(producerId: string): Promise<MediaStreamTrack | null> {
    try {
      // Check if already consuming this producer
      if (this.consumers.has(producerId)) {
        const existingConsumer = this.consumers.get(producerId);
        console.log('Already consuming producer:', producerId, 'track state:', existingConsumer?.track?.readyState);
        return existingConsumer?.track || null;
      }

      if (!this.recvTransport) {
        console.log('Creating recv transport for consumer...');
        await this.createRecvTransport();
      }

      console.log('Consuming producer:', producerId, 'transport:', this.recvTransport?.id);
      
      const params = await socketManager.consume(
        this.recvTransport!.id,
        producerId,
        this.device!.rtpCapabilities
      );

      console.log('Consume params received:', { 
        id: params.id, 
        producerId: params.producerId, 
        kind: params.kind 
      });

      const consumer = await this.recvTransport!.consume({
        id: params.id,
        producerId: params.producerId,
        kind: params.kind,
        rtpParameters: params.rtpParameters,
      });

      this.consumers.set(producerId, consumer);
      
      const trackInfo = {
        id: consumer.track.id,
        kind: consumer.track.kind,
        enabled: consumer.track.enabled,
        readyState: consumer.track.readyState,
        muted: consumer.track.muted,
      };
      
      console.log('Consumer created:', consumer.id, 'track:', trackInfo);
      
      // Verify track is actually live
      if (consumer.track.readyState !== 'live') {
        console.error('❌ WARNING: Track is not live! State:', consumer.track.readyState);
      } else {
        console.log('✅ Track is LIVE');
      }
      
      if (consumer.track.muted) {
        console.warn('⚠️ Track is muted:', producerId);
      }

      // Enable track explicitly (sometimes needed)
      if (!consumer.track.enabled) {
        consumer.track.enabled = true;
        console.log('✅ Enabled track explicitly');
      }

      // Listen to track events
      consumer.track.onended = () => {
        console.error('❌ Consumer track ended:', producerId);
      };

      consumer.track.onmute = () => {
        console.warn('⚠️ Consumer track muted:', producerId);
      };

      consumer.track.onunmute = () => {
        console.log('✅ Consumer track unmuted:', producerId);
      };
      
      // Monitor readyState changes
      const checkReadyState = () => {
        if (consumer.track.readyState === 'ended') {
          console.error('❌ Track readyState changed to ended:', producerId);
        } else if (consumer.track.readyState === 'live') {
          console.log('✅ Track readyState is live:', producerId);
        }
      };
      
      // Monitor readyState (note: readyState is not directly observable, so we check periodically)
      setTimeout(checkReadyState, 1000);
      setTimeout(checkReadyState, 3000);

      // Listen to consumer events
      consumer.on('transportclose', () => {
        console.error('❌ Consumer transport closed:', producerId);
      });

      return consumer.track;
    } catch (error) {
      console.error('Error consuming producer:', producerId, error);
      throw error;
    }
  }

  closeProducers() {
    this.producers.forEach(producer => producer.close());
    this.producers.clear();
    this.producersByKind.clear();
  }

  closeConsumers() {
    this.consumers.forEach(consumer => consumer.close());
    this.consumers.clear();
  }

  closeTransports() {
    if (this.sendTransport) this.sendTransport.close();
    if (this.recvTransport) this.recvTransport.close();
    this.sendTransport = null;
    this.recvTransport = null;
  }

  cleanup() {
    this.closeProducers();
    this.closeConsumers();
    this.closeTransports();
    this.device = null;
  }

  getDevice() {
    return this.device;
  }

  getSendTransport() {
    return this.sendTransport;
  }

  getRecvTransport() {
    return this.recvTransport;
  }

  getProducer(kind: 'audio' | 'video'): any {
    return this.producersByKind.get(kind) || null;
  }

  async pauseProducer(kind: 'audio' | 'video'): Promise<void> {
    const producer = this.producersByKind.get(kind);
    if (!producer) {
      console.warn(`No ${kind} producer to pause`);
      return;
    }

    try {
      producer.pause();
      await socketManager.pauseProducer(producer.id);
      console.log(`${kind} producer paused:`, producer.id);
    } catch (error) {
      console.error(`Error pausing ${kind} producer:`, error);
      throw error;
    }
  }

  async resumeProducer(kind: 'audio' | 'video'): Promise<void> {
    const producer = this.producersByKind.get(kind);
    if (!producer) {
      console.warn(`No ${kind} producer to resume`);
      return;
    }

    try {
      producer.resume();
      await socketManager.resumeProducer(producer.id);
      console.log(`${kind} producer resumed:`, producer.id);
    } catch (error) {
      console.error(`Error resuming ${kind} producer:`, error);
      throw error;
    }
  }

  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    const producer = this.producersByKind.get('video');
    if (!producer) {
      throw new Error('No video producer to replace track');
    }

    try {
      await producer.replaceTrack({ track });
      await socketManager.notifyTrackReplaced(producer.id);
      console.log('Video track replaced in producer:', producer.id);
    } catch (error) {
      console.error('Error replacing video track:', error);
      throw error;
    }
  }

  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    const producer = this.producersByKind.get('audio');
    if (!producer) {
      throw new Error('No audio producer to replace track');
    }

    try {
      await producer.replaceTrack({ track });
      await socketManager.notifyTrackReplaced(producer.id);
      console.log('Audio track replaced in producer:', producer.id);
    } catch (error) {
      console.error('Error replacing audio track:', error);
      throw error;
    }
  }
}

export const webrtcManager = new WebRTCManager();

