import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../database/redis', () => {
  const createPipeline = () => ({
    sadd: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  });

  let pipelineInstance = createPipeline();

  const redisMock = {
    pipeline: vi.fn(() => pipelineInstance),
    get: vi.fn(),
    smembers: vi.fn(),
    mget: vi.fn(),
    del: vi.fn(),
    srem: vi.fn(),
  };

  return {
    redisWithCircuitBreaker: new Proxy(redisMock, {
      get(target, prop) {
        if (prop === '__setPipeline') {
          return (pipeline: typeof pipelineInstance) => {
            pipelineInstance = pipeline;
          };
        }
        if (prop === '__getPipeline') {
          return () => pipelineInstance;
        }
        return target[prop as keyof typeof target];
      },
    }),
  };
});

import { redisWithCircuitBreaker } from '../../database/redis';
import { RedisStateService } from '../state.redis';

const redisMock = redisWithCircuitBreaker as any;
const setPipeline = redisMock.__setPipeline as (pipeline: any) => void;
const getPipeline = redisMock.__getPipeline as () => any;

const createPipeline = () => ({
  sadd: vi.fn().mockReturnThis(),
  set: vi.fn().mockReturnThis(),
  del: vi.fn().mockReturnThis(),
  srem: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([]),
});

describe('RedisStateService mute state helpers', () => {
  beforeEach(() => {
    setPipeline(createPipeline());
    redisMock.pipeline.mockClear();
    redisMock.get.mockReset();
    redisMock.smembers.mockReset();
    redisMock.mget.mockReset();
    redisMock.del.mockReset();
    redisMock.srem.mockReset();
  });

  it('persists participant mute state with TTL and set membership', async () => {
    const pipeline = getPipeline();

    await RedisStateService.setParticipantMuteState('room-code', 'user-123', {
      isAudioMuted: true,
      isVideoMuted: false,
      audioMutedAt: 123,
      videoMutedAt: 456,
    });

    expect(redisMock.pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.sadd).toHaveBeenCalledWith(
      'connect:state:room:room-code:mute:participants',
      'user-123'
    );
    expect(pipeline.set).toHaveBeenCalledWith(
      'connect:state:room:room-code:mute:user-123',
      expect.stringContaining('"isAudioMuted":true'),
      'EX',
      3600
    );
    expect(pipeline.exec).toHaveBeenCalled();
  });

  it('deserializes participant mute state from Redis', async () => {
    redisMock.get.mockResolvedValueOnce(
      JSON.stringify({
        roomCode: 'room-code',
        userId: 'user-123',
        isAudioMuted: false,
        isVideoMuted: true,
        audioMutedAt: 1,
        videoMutedAt: 2,
        updatedAt: 3,
      })
    );

    const state = await RedisStateService.getParticipantMuteState('room-code', 'user-123');

    expect(redisMock.get).toHaveBeenCalledWith(
      'connect:state:room:room-code:mute:user-123'
    );
    expect(state).toEqual({
      roomCode: 'room-code',
      userId: 'user-123',
      isAudioMuted: false,
      isVideoMuted: true,
      audioMutedAt: 1,
      videoMutedAt: 2,
      updatedAt: 3,
    });
  });

  it('returns aggregated room mute states', async () => {
    redisMock.smembers.mockResolvedValueOnce(['user-1', 'user-2']);
    redisMock.mget.mockResolvedValueOnce([
      JSON.stringify({
        isAudioMuted: true,
        isVideoMuted: false,
        audioMutedAt: 100,
        videoMutedAt: 200,
        updatedAt: 300,
      }),
      null,
    ]);

    const result = await RedisStateService.getRoomMuteStates('room-code');

    expect(redisMock.smembers).toHaveBeenCalledWith(
      'connect:state:room:room-code:mute:participants'
    );
    expect(redisMock.mget).toHaveBeenCalledWith(
      'connect:state:room:room-code:mute:user-1',
      'connect:state:room:room-code:mute:user-2'
    );
    expect(result).toEqual({
      'user-1': {
        isAudioMuted: true,
        isVideoMuted: false,
        audioMutedAt: 100,
        videoMutedAt: 200,
        updatedAt: 300,
      },
    });
  });

  it('clears participant mute state and membership', async () => {
    const pipeline = getPipeline();

    await RedisStateService.clearParticipantMuteState('room-code', 'user-123');

    expect(redisMock.pipeline).toHaveBeenCalledTimes(1);
    expect(pipeline.del).toHaveBeenCalledWith('connect:state:room:room-code:mute:user-123');
    expect(pipeline.srem).toHaveBeenCalledWith(
      'connect:state:room:room-code:mute:participants',
      'user-123'
    );
    expect(pipeline.exec).toHaveBeenCalled();
  });
});

