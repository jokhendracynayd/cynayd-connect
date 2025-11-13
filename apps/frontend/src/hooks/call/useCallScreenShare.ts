import { useCallback, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../store/authStore';
import { useCallStore } from '../../store/callStore';
import { socketManager } from '../../lib/socket';
import { mediaManager } from '../../lib/media';
import { webrtcManager } from '../../lib/webrtc';

interface UseCallScreenShareProps {
  isScreenSharing: boolean;
  screenShareStreams: Map<string, MediaStream>;
  setScreenShareStreams: React.Dispatch<React.SetStateAction<Map<string, MediaStream>>>;
  setIsScreenSharing: (sharing: boolean) => void;
  addScreenShare: (share: { userId: string; producerId: string; name: string; stream?: MediaStream }) => void;
  removeScreenShare: (userId: string) => void;
  setPinnedScreenShare: (userId: string | null) => void;
  pinnedScreenShareUserId: string | null;
  screenShareProducersRef: React.MutableRefObject<Map<string, string>>;
  producerMetadataRef: React.MutableRefObject<Map<string, { source?: string; userId?: string; kind?: 'audio' | 'video' }>>;
  activeScreenShareProducersRef: React.MutableRefObject<Set<string>>;
  isStoppingScreenShareRef: React.MutableRefObject<boolean>;
}

export function useCallScreenShare({
  isScreenSharing,
  screenShareStreams,
  setScreenShareStreams,
  setIsScreenSharing,
  addScreenShare,
  removeScreenShare,
  setPinnedScreenShare,
  pinnedScreenShareUserId,
  screenShareProducersRef,
  producerMetadataRef,
  activeScreenShareProducersRef,
  isStoppingScreenShareRef,
}: UseCallScreenShareProps) {
  const { user } = useAuthStore();

  const cleanupScreenShare = useCallback((userId?: string, producerId?: string) => {
    console.log('cleanupScreenShare called:', { userId, producerId, localUserId: user?.id });

    if (!userId) {
      if (producerId) {
        const metadata = producerMetadataRef.current.get(producerId);
        if (metadata?.userId) {
          cleanupScreenShare(metadata.userId, producerId);
        } else {
          producerMetadataRef.current.delete(producerId);
          activeScreenShareProducersRef.current.delete(producerId);
        }
      }
      return;
    }

    const currentActiveId = screenShareProducersRef.current.get(userId);
    const targetProducerId = producerId ?? null;

    console.log('cleanupScreenShare - current state:', {
      currentActiveId,
      targetProducerId,
      isLocalUser: user?.id === userId,
      currentIsScreenSharing: isScreenSharing
    });

    // If a different screen share is currently active for this user, only clear metadata for the old producer
    if (currentActiveId && targetProducerId && currentActiveId !== targetProducerId) {
      console.log('Stale producer event detected, ignoring cleanup for active share');
      activeScreenShareProducersRef.current.delete(targetProducerId);
      producerMetadataRef.current.delete(targetProducerId);
      return;
    }

    const producerIds = new Set<string>();
    if (producerId) {
      producerIds.add(producerId);
    }

    const mappedId = screenShareProducersRef.current.get(userId);
    if (mappedId) {
      producerIds.add(mappedId);
    }

    producerMetadataRef.current.forEach((meta, id) => {
      if (meta.userId === userId && (meta.source === 'screen' || !meta.source)) {
        producerIds.add(id);
      }
    });

    console.log('Cleaning up producer IDs:', Array.from(producerIds));

    setScreenShareStreams(prev => {
      const next = new Map(prev);
      const stream = next.get(userId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
        next.delete(userId);
      }
      return next;
    });

    screenShareProducersRef.current.delete(userId);

    producerIds.forEach(id => {
      webrtcManager.closeConsumerByProducerId(id);
      activeScreenShareProducersRef.current.delete(id);
      producerMetadataRef.current.delete(id);
    });

    removeScreenShare(userId);

    const { pinnedScreenShareUserId: currentPinned, screenShares: updatedShares } = useCallStore.getState();
    if (currentPinned === userId) {
      const nextShare = Array.from(updatedShares.values()).find(share => share.userId !== userId);
      setPinnedScreenShare(nextShare?.userId || null);
    }

    // If cleaning up local user's screen share, update state
    if (user?.id === userId) {
      console.log('Setting isScreenSharing to false for local user');
      setIsScreenSharing(false);
    }

    console.log('cleanupScreenShare complete');
  }, [
    user?.id,
    isScreenSharing,
    screenShareProducersRef,
    producerMetadataRef,
    activeScreenShareProducersRef,
    setScreenShareStreams,
    removeScreenShare,
    setPinnedScreenShare,
    setIsScreenSharing,
  ]);

  const waitForScreenShareTeardown = useCallback(async (context: string) => {
    const timeoutMs = 5000;
    const intervalMs = 100;
    const startTime = Date.now();
    let attempts = 0;

    while (isStoppingScreenShareRef.current || webrtcManager.getScreenShareProducer()) {
      if (Date.now() - startTime > timeoutMs) {
        console.warn('Timeout waiting for screen share teardown', {
          context,
          isStopping: isStoppingScreenShareRef.current,
          hasProducer: !!webrtcManager.getScreenShareProducer(),
        });
        break;
      }

      if (attempts % 10 === 0) {
        console.log('Waiting for screen share teardown...', {
          context,
          attempt: attempts,
          isStopping: isStoppingScreenShareRef.current,
          hasProducer: !!webrtcManager.getScreenShareProducer(),
        });
      }

      attempts += 1;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    console.log('Screen share teardown wait complete', {
      context,
      elapsed: Date.now() - startTime,
      isStopping: isStoppingScreenShareRef.current,
      hasProducer: !!webrtcManager.getScreenShareProducer(),
    });
  }, [isStoppingScreenShareRef]);

  const handleStopScreenShare = useCallback(async () => {
    if (!user?.id) {
      return;
    }

    console.log('handleStopScreenShare called, current isScreenSharing:', isScreenSharing, 'isStopping:', isStoppingScreenShareRef.current);

    // Prevent double-calls (e.g., from track.onended + user click)
    if (isStoppingScreenShareRef.current) {
      console.log('Already stopping screen share, ignoring duplicate call');
      return;
    }

    const producer = webrtcManager.getScreenShareProducer();
    const fallbackProducerId = screenShareProducersRef.current.get(user.id);
    const producerId = producer?.id ?? fallbackProducerId ?? null;

    console.log('Stop screen share - producerId:', producerId, 'hasProducer:', !!producer);

    // If no producer and no state, already stopped
    if (!producer && !producerId && !isScreenSharing) {
      console.log('Already stopped, nothing to do');
      return;
    }

    // Set stopping flag to prevent duplicate calls
    isStoppingScreenShareRef.current = true;
    console.log('Set isStoppingScreenShareRef to true');

    try {
      // Set UI state immediately to prevent UI actions
      setIsScreenSharing(false);
      console.log('Set isScreenSharing to false immediately');

      // 1. Close producer if still active
      if (producer) {
        const { producerId: closedId } = await webrtcManager.closeScreenShareProducer();
        console.log('Closed producer:', closedId);
        if (closedId) {
          cleanupScreenShare(user.id, closedId);
          toast.success('Screen sharing stopped');
          return;
        }
      }

      // 2. Stop media
      mediaManager.stopScreenShare();

      // 3. Notify backend (best-effort)
      if (producerId) {
        try {
          await socketManager.stopScreenShare(producerId);
          console.log('Notified backend - screen share stopped');
        } catch (socketError) {
          console.warn('stopScreenShare emit failed, attempting closeProducer fallback', socketError);
          try {
            await socketManager.closeProducer(producerId);
          } catch (closeError) {
            console.warn('closeProducer fallback failed', closeError);
          }
        }
      }

      // 4. Update state
      cleanupScreenShare(user.id, producerId ?? undefined);

      console.log('Screen share stop complete, isScreenSharing should be false');
      toast.success('Screen sharing stopped');
    } catch (error) {
      console.error('Error stopping screen share:', error);
      setIsScreenSharing(false);
      toast.error('Failed to stop screen sharing');
    } finally {
      isStoppingScreenShareRef.current = false;
      console.log('Reset isStoppingScreenShareRef to false (finally)');
    }
  }, [
    user?.id,
    isScreenSharing,
    isStoppingScreenShareRef,
    screenShareProducersRef,
    setIsScreenSharing,
    cleanupScreenShare,
  ]);

  const handleStartScreenShare = useCallback(async () => {
    console.log('handleStartScreenShare called, current state:', {
      isScreenSharing,
      userId: user?.id,
      hasExistingProducer: !!webrtcManager.getScreenShareProducer(),
      isStopping: isStoppingScreenShareRef.current,
    });

    if (isStoppingScreenShareRef.current) {
      await waitForScreenShareTeardown('pre-start');
    }

    if (isScreenSharing) {
      console.log('Screen share already active, stopping first...');
      await handleStopScreenShare();
      await waitForScreenShareTeardown('after-handleStop');
    }

    const lingeringProducer = webrtcManager.getScreenShareProducer();
    if (lingeringProducer) {
      console.log('Lingering screen share producer detected before starting new share, forcing cleanup', {
        producerId: lingeringProducer.id,
      });
      const { producerId: forcedClosedId } = await webrtcManager.closeScreenShareProducer();
      if (forcedClosedId && user?.id) {
        cleanupScreenShare(user.id, forcedClosedId);
      }
      await waitForScreenShareTeardown('after-forced-close');
    }

    try {
      console.log('Starting screen share...');

      // 1. Get screen stream
      const screenStream = await mediaManager.startScreenShare();
      const screenTrack = screenStream.getVideoTracks()[0];

      if (!screenTrack) {
        throw new Error('Failed to get screen share track');
      }

      console.log('Screen share stream obtained, track:', {
        id: screenTrack.id,
        kind: screenTrack.kind,
        enabled: screenTrack.enabled,
        readyState: screenTrack.readyState
      });

      if (!user?.id) {
        throw new Error('User not found');
      }

      // 2. Create producer
      console.log('Creating screen share producer...');
      const producer = await webrtcManager.produceScreenShare(screenTrack);

      console.log('Screen share producer created:', producer.id);

      // 3. Notify backend
      console.log('Notifying backend of screen share start...');
      await socketManager.startScreenShare(producer.id);
      console.log('Backend notified');

      // 4. Update state
      setIsScreenSharing(true);
      console.log('Set isScreenSharing to true');
      
      // Store producer mapping FIRST (so consumeProducer can skip it)
      screenShareProducersRef.current.set(user.id, producer.id);
      producerMetadataRef.current.set(producer.id, {
        userId: user.id,
        source: 'screen',
        kind: 'video',
      });
      activeScreenShareProducersRef.current.add(producer.id);
      
      console.log('Producer metadata stored:', {
        userId: user.id,
        producerId: producer.id,
        totalActiveProducers: activeScreenShareProducersRef.current.size
      });
      
      // Add to screen shares (will be filtered out in UI for current user)
      addScreenShare({
        userId: user.id,
        producerId: producer.id,
        name: user.name,
        stream: screenStream,
      });

      console.log('Screen share state updated, isScreenSharing:', true);

      // Note: We don't auto-pin our own screen share (user won't see it anyway)

      toast.success('Screen sharing started');

      // 6. Handle track end (user stops via browser)
      screenTrack.onended = async () => {
        console.log('Screen track ended via browser');
        await handleStopScreenShare();
      };
    } catch (error: any) {
      console.error('Error starting screen share:', error);
      setIsScreenSharing(false);
      if (error.name === 'NotAllowedError') {
        toast.error('Screen sharing permission denied');
      } else if (error.name === 'NotReadableError') {
        toast.error('Screen is not available');
      } else {
        toast.error('Failed to start screen sharing');
      }
    }
  }, [
    isScreenSharing,
    user?.id,
    user?.name,
    isStoppingScreenShareRef,
    waitForScreenShareTeardown,
    cleanupScreenShare,
    setIsScreenSharing,
    screenShareProducersRef,
    producerMetadataRef,
    activeScreenShareProducersRef,
    addScreenShare,
    handleStopScreenShare,
  ]);

  const handlePinScreenShare = useCallback((userId: string) => {
    if (pinnedScreenShareUserId === userId) {
      // Unpin
      setPinnedScreenShare(null);
    } else {
      // Pin this share
      setPinnedScreenShare(userId);
    }
  }, [pinnedScreenShareUserId, setPinnedScreenShare]);

  return {
    handleStartScreenShare,
    handleStopScreenShare,
    handlePinScreenShare,
    cleanupScreenShare,
    waitForScreenShareTeardown,
  };
}

