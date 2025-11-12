import { webrtcManager } from './webrtc';

export type NetworkQualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'unknown';

export interface NetworkSample {
  userId: string;
  direction: 'upstream' | 'downstream';
  kind: 'audio' | 'video' | 'screen';
  bitrateKbps: number;
  packetLoss: number;
  jitter: number;
  rtt: number;
  quality: NetworkQualityLevel;
  timestamp: number;
  
}

export interface NetworkMonitorConfig {
  intervalMs?: number;
  onSamples: (samples: NetworkSample[]) => void;
  resolveProducerMeta: (producerId: string) => { userId?: string | undefined; kind?: 'audio' | 'video' | 'screen' | undefined } | undefined;
  localUserId: string;
}

type StatsSnapshot = {
  bytes: number;
  packets: number;
  packetsLost: number;
  timestamp: number;
  jitter?: number;
  rtt?: number;
};

const DEFAULT_INTERVAL = 4000;

export class NetworkMonitor {
  private readonly intervalMs: number;
  private readonly onSamples: NetworkMonitorConfig['onSamples'];
  private readonly resolveProducerMeta: NetworkMonitorConfig['resolveProducerMeta'];
  private readonly localUserId: string;

  private timer: number | null = null;
  private disposed = false;

  private producerSnapshots = new Map<string, StatsSnapshot>();
  private consumerSnapshots = new Map<string, StatsSnapshot>();

  constructor(config: NetworkMonitorConfig) {
    this.intervalMs = config.intervalMs ?? DEFAULT_INTERVAL;
    this.onSamples = config.onSamples;
    this.resolveProducerMeta = config.resolveProducerMeta;
    this.localUserId = config.localUserId;
  }

  start() {
    if (this.timer !== null) {
      return;
    }
    this.disposed = false;
    console.log('[NetworkMonitor] Starting with interval', this.intervalMs);
    void this.poll();
    this.timer = window.setInterval(() => {
      void this.poll();
    }, this.intervalMs);
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[NetworkMonitor] Stopped');
    this.disposed = true;
    this.producerSnapshots.clear();
    this.consumerSnapshots.clear();
  }

  private async poll() {
    if (this.disposed) {
      return;
    }

    const samples: NetworkSample[] = [];
    const now = Date.now();

    await Promise.all([
      this.collectProducerSamples(samples, now),
      this.collectConsumerSamples(samples, now),
    ]);

    if (samples.length > 0) {
      console.log('[NetworkMonitor] Samples collected', samples);
      this.onSamples(samples);
    } else {
      console.log('[NetworkMonitor] No stats collected this cycle');
    }
  }

  private async collectProducerSamples(samples: NetworkSample[], timestamp: number) {
    const entries = webrtcManager.getProducerEntries();

    await Promise.all(entries.map(async ({ producerId, producer }) => {
      try {
        const statsResult: any = await producer.getStats();
        const statsArray: any[] = Array.isArray(statsResult)
          ? statsResult
          : Array.from((statsResult?.values?.() ?? []) as Iterable<any>);
        const aggregate = this.aggregateStats(statsArray, this.producerSnapshots.get(producerId));
        if (!aggregate) {
          return;
        }

        this.producerSnapshots.set(producerId, aggregate.snapshot);

        const meta =
          this.resolveProducerMeta(producerId) ??
          this.deriveMetaFromAppData(producer?.appData, this.localUserId);
        const kind = meta.kind ?? 'video';

        samples.push({
          userId: meta.userId ?? this.localUserId,
          direction: 'upstream',
          kind,
          bitrateKbps: aggregate.bitrateKbps,
          packetLoss: aggregate.packetLoss,
          jitter: aggregate.jitter,
          rtt: aggregate.rtt,
          quality: this.getQualityLevel(aggregate),
          timestamp,
        });
      } catch (error) {
        console.warn('Failed to read producer stats', producerId, error);
      }
    }));
  }

  private async collectConsumerSamples(samples: NetworkSample[], timestamp: number) {
    const entries = webrtcManager.getConsumerEntries();

    await Promise.all(entries.map(async ({ producerId, consumer }) => {
      try {
        if (typeof consumer.getStats !== 'function') {
          return;
        }
        const statsResult: any = await consumer.getStats();
        const statsArray: any[] = Array.isArray(statsResult)
          ? statsResult
          : Array.from((statsResult?.values?.() ?? []) as Iterable<any>);
        const aggregate = this.aggregateStats(statsArray, this.consumerSnapshots.get(producerId));
        if (!aggregate) {
          return;
        }

        this.consumerSnapshots.set(producerId, aggregate.snapshot);

        const meta =
          this.resolveProducerMeta(producerId) ??
          this.deriveMetaFromAppData(consumer?.appData, undefined, producerId);
        const kind = meta.kind ?? 'video';
        const userId = meta.userId ?? producerId;

        samples.push({
          userId,
          direction: 'downstream',
          kind,
          bitrateKbps: aggregate.bitrateKbps,
          packetLoss: aggregate.packetLoss,
          jitter: aggregate.jitter,
          rtt: aggregate.rtt,
          quality: this.getQualityLevel(aggregate),
          timestamp,
        });
      } catch (error) {
        console.warn('Failed to read consumer stats', producerId, error);
      }
    }));
  }

  private aggregateStats(statsArray: any[], previous?: StatsSnapshot) {
    if (!Array.isArray(statsArray) || statsArray.length === 0) {
      return null;
    }

    const sample = statsArray.find(stat => stat.type === 'outbound-rtp' || stat.type === 'inbound-rtp');
    if (!sample) {
      return null;
    }

    const bytes = typeof sample.bytesSent === 'number' ? sample.bytesSent :
      (typeof sample.bytesReceived === 'number' ? sample.bytesReceived : undefined);
    const packets = typeof sample.packetsSent === 'number' ? sample.packetsSent :
      (typeof sample.packetsReceived === 'number' ? sample.packetsReceived : undefined);

    if (bytes === undefined || packets === undefined) {
      return null;
    }

    const timestamp = typeof sample.timestamp === 'number' ? sample.timestamp : Date.now();
    const packetsLost = typeof sample.packetsLost === 'number' ? sample.packetsLost : 0;
    const jitter = typeof sample.jitter === 'number' ? sample.jitter : (typeof sample.jitterMeasured === 'number' ? sample.jitterMeasured : 0);
    const rtt = typeof sample.roundTripTime === 'number' ? sample.roundTripTime : (typeof sample.rtt === 'number' ? sample.rtt : 0);

    if (!previous) {
      return {
        snapshot: {
          bytes,
          packets,
          packetsLost,
          timestamp,
          jitter,
          rtt,
        },
        bitrateKbps: 0,
        packetLoss: 0,
        jitter,
        rtt: rtt * 1000,
      };
    }

    const elapsedMs = Math.max(1, timestamp - previous.timestamp);
    const bytesDelta = Math.max(0, bytes - previous.bytes);
    const packetsDelta = Math.max(0, packets - previous.packets);
    const lostDelta = Math.max(0, packetsLost - previous.packetsLost);

    const bitrateKbps = (bytesDelta * 8) / elapsedMs;
    const packetLoss = packetsDelta > 0 ? (lostDelta / packetsDelta) * 100 : 0;

    return {
      snapshot: {
        bytes,
        packets,
        packetsLost,
        timestamp,
        jitter,
        rtt,
      },
      bitrateKbps,
      packetLoss,
      jitter,
      rtt: rtt * 1000,
    };
  }

  private getQualityLevel(sample: { bitrateKbps: number; packetLoss: number; jitter: number; rtt: number }): NetworkQualityLevel {
    if (!Number.isFinite(sample.bitrateKbps)) {
      return 'unknown';
    }

    const { bitrateKbps, packetLoss, jitter, rtt } = sample;

    if (packetLoss > 5 || jitter > 50 || rtt > 400) {
      return 'poor';
    }
    if (packetLoss > 2 || jitter > 30 || rtt > 250 || bitrateKbps < 200) {
      return 'fair';
    }
    if (packetLoss > 1 || jitter > 15 || rtt > 150 || bitrateKbps < 500) {
      return 'good';
    }
    if (packetLoss >= 0) {
      return 'excellent';
    }
    return 'unknown';
  }

  private deriveMetaFromAppData(
    appData: any,
    fallbackUserId?: string,
    fallbackProducerId?: string
  ): { userId?: string; kind?: 'audio' | 'video' | 'screen' } {
    if (!appData || typeof appData !== 'object') {
      return {
        userId: fallbackUserId ?? fallbackProducerId,
        kind: 'video',
      };
    }

    const source = typeof appData.source === 'string' ? appData.source : undefined;
    const kind =
      source === 'screen'
        ? 'screen'
        : source === 'microphone'
          ? 'audio'
          : source === 'camera'
            ? 'video'
            : (appData.kind === 'audio' || appData.kind === 'video' ? appData.kind : 'video');

    return {
      userId: appData.userId ?? fallbackUserId ?? fallbackProducerId,
      kind,
    };
  }
}


