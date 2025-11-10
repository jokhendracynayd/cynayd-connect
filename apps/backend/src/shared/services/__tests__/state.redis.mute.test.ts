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
    setex: vi.fn(),
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

let clientPipelineSpy: ReturnType<typeof vi.fn>;

describe('RedisStateService mute state helpers', () => {
  beforeEach(() => {
    setPipeline(createPipeline());
    redisMock.pipeline.mockClear();
    redisMock.get.mockReset();
    redisMock.smembers.mockReset();
    redisMock.mget.mockReset();
    redisMock.del.mockReset();
    redisMock.srem.mockReset();
    redisMock.setex.mockReset();
    clientPipelineSpy = vi.fn(() => getPipeline());
    redisMock._client = {
      pipeline: clientPipelineSpy,
      mget: (...args: string[]) => redisMock.mget(...args),
    };
  });

  it('persists participant mute state with TTL and set membership', async () => {
    const pipeline = getPipeline();

    await RedisStateService.setParticipantMuteState('room-code', 'user-123', {
      isAudioMuted: true,
      isVideoMuted: false,
      audioMutedAt: 123,
      videoMutedAt: 456,
    });

    expect(clientPipelineSpy).toHaveBeenCalledTimes(1);
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

  it('persists forced mute metadata when provided', async () => {
    const pipeline = getPipeline();

    await RedisStateService.setParticipantMuteState('room-code', 'user-forced', {
      isAudioMuted: true,
      isVideoMuted: false,
      forcedAudio: true,
      forcedAudioAt: 111,
      forcedBy: 'host-1',
      forcedReason: 'background noise',
    });

    const payload = JSON.parse(pipeline.set.mock.calls[0][1]);
    expect(payload.forcedAudio).toBe(true);
    expect(payload.forcedAudioAt).toBe(111);
    expect(payload.forcedBy).toBe('host-1');
    expect(payload.forcedReason).toBe('background noise');
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
        forcedAudio: true,
        forcedVideo: false,
        forcedAudioAt: 10,
        forcedVideoAt: null,
        forcedBy: 'host-1',
        forcedReason: 'test',
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
      forcedAudio: true,
      forcedVideo: false,
      forcedAudioAt: 10,
      forcedVideoAt: undefined,
      forcedBy: 'host-1',
      forcedReason: 'test',
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
        forcedAudio: true,
        forcedVideo: false,
        forcedAudioAt: 150,
        forcedBy: 'host-2',
        forcedReason: 'global mute',
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
        roomCode: 'room-code',
        userId: 'user-1',
        isAudioMuted: true,
        isVideoMuted: false,
        audioMutedAt: 100,
        videoMutedAt: 200,
        updatedAt: 300,
        forcedAudio: true,
        forcedVideo: false,
        forcedAudioAt: 150,
        forcedVideoAt: undefined,
        forcedBy: 'host-2',
        forcedReason: 'global mute',
      },
    });
  });

  it('clears participant mute state and membership', async () => {
    const pipeline = getPipeline();

    await RedisStateService.clearParticipantMuteState('room-code', 'user-123');

    expect(clientPipelineSpy).toHaveBeenCalledTimes(1);
    expect(pipeline.del).toHaveBeenCalledWith('connect:state:room:room-code:mute:user-123');
    expect(pipeline.srem).toHaveBeenCalledWith(
      'connect:state:room:room-code:mute:participants',
      'user-123'
    );
    expect(pipeline.exec).toHaveBeenCalled();
  });

  describe('room control state helpers', () => {
    it('persists room control state with TTL', async () => {
      await RedisStateService.setRoomControlState('room-code', {
        locked: true,
        lockedBy: 'host-1',
        lockedReason: 'security',
      });

      expect(redisMock.setex).toHaveBeenCalledWith(
        'connect:state:room:room-code:control',
        3600,
        expect.stringContaining('"locked":true')
      );
    });

    it('deserializes room control state from Redis', async () => {
      redisMock.get.mockResolvedValueOnce(
        JSON.stringify({
          roomCode: 'room-code',
          locked: true,
          lockedBy: 'host-1',
          lockedAt: 123,
          lockedReason: 'security',
          audioForceAll: true,
          audioForcedBy: 'host-1',
          audioForcedAt: 456,
          audioForceReason: 'noise',
          videoForceAll: false,
          videoForcedBy: null,
          videoForcedAt: null,
          videoForceReason: null,
          chatForceAll: true,
          chatForcedBy: 'host-2',
          chatForcedAt: 987,
          chatForceReason: 'spam',
          updatedAt: 789,
        })
      );

      const state = await RedisStateService.getRoomControlState('room-code');

      expect(state).toEqual({
        roomCode: 'room-code',
        locked: true,
        lockedBy: 'host-1',
        lockedAt: 123,
        lockedReason: 'security',
        audioForceAll: true,
        audioForcedBy: 'host-1',
        audioForcedAt: 456,
        audioForceReason: 'noise',
        videoForceAll: false,
        videoForcedBy: null,
        videoForcedAt: null,
        videoForceReason: null,
        chatForceAll: true,
        chatForcedBy: 'host-2',
        chatForcedAt: 987,
        chatForceReason: 'spam',
        updatedAt: 789,
      });
    });

    it('clears room control state', async () => {
      await RedisStateService.clearRoomControlState('room-code');
      expect(redisMock.del).toHaveBeenCalledWith('connect:state:room:room-code:control');
    });
  });
});
