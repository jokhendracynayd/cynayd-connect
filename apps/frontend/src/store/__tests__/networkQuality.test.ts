import { beforeEach, describe, expect, it } from 'vitest';
import { useCallStore, type NetworkQualityAggregate } from '../callStore';
import type { NetworkSample } from '../../lib/networkMonitor';

describe('network quality store updates', () => {
  beforeEach(() => {
    useCallStore.getState().clearNetworkQuality();
  });

  it('records downstream quality samples', () => {
    const sample: NetworkSample = {
      userId: 'user-1',
      direction: 'downstream',
      kind: 'video',
      bitrateKbps: 1200,
      packetLoss: 0.5,
      jitter: 12,
      rtt: 80,
      quality: 'good',
      timestamp: 1000,
    };

    useCallStore.getState().updateNetworkQuality([sample]);

    const entry = useCallStore.getState().networkQuality.get('user-1') as NetworkQualityAggregate | undefined;
    expect(entry).toBeDefined();
    expect(entry?.downstream?.level).toBe('good');
    expect(entry?.downstream?.bitrateKbps).toBe(1200);
    expect(entry?.downstream?.packetLoss).toBeCloseTo(0.5);
    expect(entry?.upstream).toBeNull();
  });

  it('keeps the worse quality level when multiple samples arrive', () => {
    const baseSample: NetworkSample = {
      userId: 'user-1',
      direction: 'downstream',
      kind: 'video',
      bitrateKbps: 1200,
      packetLoss: 0.5,
      jitter: 12,
      rtt: 80,
      quality: 'good',
      timestamp: 1000,
    };

    const degradedSample: NetworkSample = {
      ...baseSample,
      quality: 'poor',
      packetLoss: 8,
      bitrateKbps: 180,
      timestamp: 2000,
    };

    useCallStore.getState().updateNetworkQuality([baseSample]);
    useCallStore.getState().updateNetworkQuality([degradedSample]);

    const entry = useCallStore.getState().networkQuality.get('user-1');
    expect(entry?.downstream?.level).toBe('poor');
    expect(entry?.downstream?.packetLoss).toBe(8);
  });

  it('clears quality data', () => {
    const sample: NetworkSample = {
      userId: 'user-1',
      direction: 'downstream',
      kind: 'video',
      bitrateKbps: 1200,
      packetLoss: 0.5,
      jitter: 12,
      rtt: 80,
      quality: 'good',
      timestamp: 1000,
    };

    useCallStore.getState().updateNetworkQuality([sample]);
    expect(useCallStore.getState().networkQuality.size).toBeGreaterThan(0);

    useCallStore.getState().clearNetworkQuality();
    expect(useCallStore.getState().networkQuality.size).toBe(0);
  });
});


