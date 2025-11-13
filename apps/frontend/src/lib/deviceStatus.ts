export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

export type DeviceIssueType = 
  | 'permission-denied'
  | 'no-device'
  | 'system-muted'
  | 'device-busy'
  | 'none';

export interface DeviceStatus {
  hasDevice: boolean;
  permissionState: PermissionState;
  isSystemMuted: boolean;
  issueType: DeviceIssueType;
  errorReason: string;
  canRetry: boolean;
}

export interface DeviceStatusResult {
  audio: DeviceStatus;
  video: DeviceStatus;
}

// Detect user's operating system
export function detectOS(): 'windows' | 'mac' | 'linux' | 'unknown' {
  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();

  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'windows';
  } else if (platform.includes('mac') || userAgent.includes('mac')) {
    return 'mac';
  } else if (platform.includes('linux') || userAgent.includes('linux')) {
    return 'linux';
  }
  return 'unknown';
}

// Check if Permissions API is supported
function isPermissionsAPISupported(): boolean {
  return !!(navigator.permissions && navigator.permissions.query);
}

// Check permission state for a specific device type
async function checkPermissionState(
  name: 'microphone' | 'camera'
): Promise<PermissionState> {
  if (!isPermissionsAPISupported()) {
    // Safari and some browsers don't support Permissions API
    return 'unknown';
  }

  try {
    const result = await navigator.permissions.query({ name: name as PermissionName });
    return result.state as PermissionState;
  } catch (error) {
    console.warn(`Failed to query ${name} permission:`, error);
    return 'unknown';
  }
}

// Check if devices of a specific kind exist
async function checkDeviceExists(kind: 'audioinput' | 'videoinput'): Promise<boolean> {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return false;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(device => device.kind === kind);
  } catch (error) {
    console.error(`Failed to enumerate devices:`, error);
    return false;
  }
}

// Attempt to detect if a track is system-muted
// This is challenging because there's no direct API, but we can check various indicators
function isTrackSystemMuted(track: MediaStreamTrack | undefined): boolean {
  if (!track) return false;

  // Check if track is enabled but muted (system-level mute)
  if (track.muted && track.enabled) {
    return true;
  }

  // Check track settings for additional clues
  try {
    const settings = track.getSettings();
    // Some browsers expose volume or deviceId changes when system muted
    const { volume } = settings as Partial<{ volume?: number }>;
    if (volume !== undefined && volume === 0) {
      return true;
    }
  } catch (error) {
    // Settings not available
  }

  return false;
}

// Get detailed device status for audio
export async function getAudioDeviceStatus(
  currentTrack?: MediaStreamTrack,
  lastError?: Error
): Promise<DeviceStatus> {
  const hasDevice = await checkDeviceExists('audioinput');
  const permissionState = await checkPermissionState('microphone');
  const isSystemMuted = isTrackSystemMuted(currentTrack);

  let issueType: DeviceIssueType = 'none';
  let errorReason = '';
  let canRetry = false;

  // Prioritize issues: permission > device > system mute > error type
  if (permissionState === 'denied') {
    issueType = 'permission-denied';
    errorReason = 'Microphone access is blocked by browser settings';
    canRetry = true;
  } else if (!hasDevice) {
    issueType = 'no-device';
    errorReason = 'No microphone detected';
    canRetry = false;
  } else if (isSystemMuted) {
    issueType = 'system-muted';
    errorReason = 'Microphone is muted by system settings';
    canRetry = false;
  } else if (lastError) {
    // Analyze the error
    if (lastError.name === 'NotAllowedError' || lastError.name === 'SecurityError') {
      issueType = 'permission-denied';
      errorReason = 'Microphone access was denied';
      canRetry = true;
    } else if (lastError.name === 'NotFoundError') {
      issueType = 'no-device';
      errorReason = 'No microphone found';
      canRetry = false;
    } else if (lastError.name === 'NotReadableError' || lastError.name === 'TrackStartError') {
      issueType = 'device-busy';
      errorReason = 'Microphone is busy or unavailable';
      canRetry = true;
    }
  }

  return {
    hasDevice,
    permissionState,
    isSystemMuted,
    issueType,
    errorReason,
    canRetry,
  };
}

// Get detailed device status for video
export async function getVideoDeviceStatus(
  currentTrack?: MediaStreamTrack,
  lastError?: Error
): Promise<DeviceStatus> {
  const hasDevice = await checkDeviceExists('videoinput');
  const permissionState = await checkPermissionState('camera');
  const isSystemMuted = false; // Video doesn't have system-mute concept typically
  const trackInactive =
    !!currentTrack &&
    (currentTrack.readyState === 'ended' ||
      (currentTrack.muted && currentTrack.enabled));

  let issueType: DeviceIssueType = 'none';
  let errorReason = '';
  let canRetry = false;

  // Prioritize issues: permission > device > error type
  if (permissionState === 'denied') {
    issueType = 'permission-denied';
    errorReason = 'Camera access is blocked by browser settings';
    canRetry = true;
  } else if (!hasDevice) {
    issueType = 'no-device';
    errorReason = 'No camera detected';
    canRetry = false;
  } else if (lastError) {
    // Analyze the error
    if (lastError.name === 'NotAllowedError' || lastError.name === 'SecurityError') {
      issueType = 'permission-denied';
      errorReason = 'Camera access was denied';
      canRetry = true;
    } else if (lastError.name === 'NotFoundError') {
      issueType = 'no-device';
      errorReason = 'No camera found';
      canRetry = false;
    } else if (lastError.name === 'NotReadableError' || lastError.name === 'TrackStartError') {
      issueType = 'device-busy';
      errorReason = 'Camera is busy or unavailable';
      canRetry = true;
    }
  } else if (trackInactive) {
    issueType = 'device-busy';
    errorReason = 'Camera feed is inactive';
    canRetry = true;
  }

  return {
    hasDevice,
    permissionState,
    isSystemMuted,
    issueType,
    errorReason,
    canRetry,
  };
}

// Get comprehensive device status for both audio and video
export async function getDeviceStatus(
  audioTrack?: MediaStreamTrack,
  videoTrack?: MediaStreamTrack,
  audioError?: Error,
  videoError?: Error
): Promise<DeviceStatusResult> {
  const [audio, video] = await Promise.all([
    getAudioDeviceStatus(audioTrack, audioError),
    getVideoDeviceStatus(videoTrack, videoError),
  ]);

  return { audio, video };
}

// Setup listener for permission changes
export function setupPermissionListener(
  deviceType: 'microphone' | 'camera',
  callback: (state: PermissionState) => void
): (() => void) | null {
  if (!isPermissionsAPISupported()) {
    return null;
  }

  let permissionStatus: PermissionStatus | null = null;

  navigator.permissions
    .query({ name: deviceType as PermissionName })
    .then(status => {
      permissionStatus = status;
      status.addEventListener('change', () => {
        callback(status.state as PermissionState);
      });
    })
    .catch(error => {
      console.warn(`Failed to setup permission listener for ${deviceType}:`, error);
    });

  // Return cleanup function
  return () => {
    if (permissionStatus) {
      permissionStatus.removeEventListener('change', () => {});
    }
  };
}

// Setup listener for device changes (plug/unplug)
export function setupDeviceChangeListener(
  callback: () => void
): () => void {
  if (!navigator.mediaDevices || !navigator.mediaDevices.addEventListener) {
    return () => {};
  }

  navigator.mediaDevices.addEventListener('devicechange', callback);

  // Return cleanup function
  return () => {
    navigator.mediaDevices.removeEventListener('devicechange', callback);
  };
}

// Get OS-specific instructions for fixing permission issues
export function getPermissionInstructions(
  deviceType: 'audio' | 'video',
  os: ReturnType<typeof detectOS>
): string {
  const device = deviceType === 'audio' ? 'Microphone' : 'Camera';

  switch (os) {
    case 'windows':
      return `Go to your computer's settings to unmute your ${device.toLowerCase()} and adjust its level:\n\n1. Open Windows Settings\n2. Go to Privacy & Security > ${device}\n3. Enable "${device} access" and allow apps to access your ${device.toLowerCase()}\n4. Reload this page`;
    
    case 'mac':
      return `Go to your computer's settings to allow ${device.toLowerCase()} access:\n\n1. Open System Settings\n2. Go to Privacy & Security > ${device}\n3. Enable access for your browser\n4. Reload this page`;
    
    case 'linux':
      return `Check your system settings to allow ${device.toLowerCase()} access:\n\n1. Open System Settings\n2. Go to Privacy > ${device}\n3. Enable access for your browser\n4. Reload this page`;
    
    default:
      return `Go to your computer's settings to allow ${device.toLowerCase()} access and adjust its level, then reload this page.`;
  }
}

// Get browser-specific instructions for fixing permission issues
export function getBrowserPermissionInstructions(deviceType: 'audio' | 'video'): string {
  const device = deviceType === 'audio' ? 'Microphone' : 'Camera';
  
  return `To allow ${device.toLowerCase()} access in your browser:\n\n1. Click the lock icon (🔒) in the address bar\n2. Find '${device}' and set it to 'Allow'\n3. Reload the page and try again`;
}

