import DeviceDropdown from '../shared/DeviceDropdown';
import WarningBadge from '../shared/WarningBadge';
import { VideoMutedIcon } from './icons';

interface HostControls {
  videoForceAll: boolean;
}

interface DeviceStatus {
  issueType: string;
}

interface VideoControlGroupProps {
  isMuted: boolean;
  isForceActive: boolean;
  hostControls: HostControls;
  deviceStatus: DeviceStatus;
  showDropdown: boolean;
  availableDevices: MediaDeviceInfo[];
  selectedDeviceId: string | null;
  onToggle: () => void;
  onToggleDropdown: () => void;
  onDeviceSelect: (deviceId: string) => void;
  onShowDialog: () => void;
}

export default function VideoControlGroup({
  isMuted,
  isForceActive,
  hostControls,
  deviceStatus,
  showDropdown,
  availableDevices,
  selectedDeviceId,
  onToggle,
  onToggleDropdown,
  onDeviceSelect,
  onShowDialog,
}: VideoControlGroupProps) {
  return (
    <div className="relative flex items-center gap-1">
      <button
        onClick={onToggleDropdown}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-800/50 bg-gray-900/60 text-gray-400 transition-all duration-200 hover:border-cyan-500/60 hover:bg-gray-800/80 hover:text-cyan-400"
        title="Select camera"
        aria-expanded={showDropdown}
      >
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d={showDropdown ? 'M19 9l-7 7-7-7' : 'M5 15l7-7 7 7'}
          />
        </svg>
      </button>
      {showDropdown && (
        <DeviceDropdown
          kind="video"
          devices={availableDevices}
          selectedDeviceId={selectedDeviceId}
          onSelect={onDeviceSelect}
          onClose={onToggleDropdown}
          position="top"
        />
      )}
      <div className="relative">
        <button
          onClick={onToggle}
          disabled={isForceActive}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
            isForceActive
              ? 'bg-rose-600/70 cursor-not-allowed text-white opacity-60'
              : isMuted
              ? 'bg-rose-500 text-white shadow-sm hover:bg-rose-600'
              : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
          }`}
          title={
            isForceActive
              ? hostControls.videoForceAll
                ? 'Host disabled all cameras'
                : 'Host has disabled your camera'
              : isMuted
              ? 'Turn camera on'
              : 'Turn camera off'
          }
        >
          {isMuted ? (
            <VideoMutedIcon className="h-5 w-5" />
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )}
        </button>
        {deviceStatus.issueType !== 'none' && (
          <WarningBadge onClick={onShowDialog} />
        )}
      </div>
    </div>
  );
}

