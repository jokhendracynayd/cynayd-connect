import { useState, useEffect } from 'react';
import { mediaManager } from '../../lib/media';

export function useCallDevices() {
  const [availableDevices, setAvailableDevices] = useState<{
    audioInput: MediaDeviceInfo[];
    videoInput: MediaDeviceInfo[];
  }>({ audioInput: [], videoInput: [] });

  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await mediaManager.getDevices();
        setAvailableDevices({
          audioInput: devices.audioInput,
          videoInput: devices.videoInput,
        });
      } catch (error) {
        console.error('Failed to load devices:', error);
      }
    };

    loadDevices();

    const handleDeviceChange = () => {
      loadDevices();
    };

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    }

    return () => {
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
      }
    };
  }, []);

  return {
    availableDevices,
    setAvailableDevices,
  };
}

