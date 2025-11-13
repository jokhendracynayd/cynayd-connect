import { useEffect, useRef } from 'react';

type DeviceKind = 'audio' | 'video';

interface DeviceDropdownProps {
  kind: DeviceKind;
  devices: MediaDeviceInfo[];
  selectedDeviceId: string;
  onSelect: (deviceId: string) => void;
  onClose: () => void;
  position?: 'top' | 'bottom';
}

const buildDeviceLabel = (device: MediaDeviceInfo, index: number, kind: DeviceKind) => {
  const fallback = kind === 'audio' ? `Microphone ${index + 1}` : `Camera ${index + 1}`;
  return device.label || fallback;
};

export default function DeviceDropdown({
  kind,
  devices,
  selectedDeviceId,
  onSelect,
  onClose,
  position = 'top',
}: DeviceDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [onClose]);

  const positionClasses = position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2';

  return (
    <div
      ref={dropdownRef}
      className={`absolute ${positionClasses} left-0 z-50 min-w-[220px] max-w-xs rounded-xl border border-slate-200 bg-white/95 py-2 shadow-[0_20px_50px_-20px_rgba(14,165,233,0.4)] backdrop-blur`}
    >
      <div className="px-3 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {kind === 'audio' ? 'Select Microphone' : 'Select Camera'}
        </p>
      </div>
      <div className="max-h-60 overflow-y-auto">
        {devices.length === 0 ? (
          <div className="px-3 py-2 text-sm text-slate-400">
            No {kind === 'audio' ? 'microphones' : 'cameras'} found
          </div>
        ) : (
          devices.map((device, index) => {
            const isSelected = device.deviceId === selectedDeviceId;
            return (
              <button
                key={device.deviceId || `${kind}-${index}`}
                onClick={() => {
                  onSelect(device.deviceId);
                  onClose();
                }}
                className={`w-full px-3 py-2 text-left text-sm transition ${
                  isSelected
                    ? 'bg-cyan-50 font-semibold text-cyan-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="block truncate">{buildDeviceLabel(device, index, kind)}</span>
                {isSelected && (
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-cyan-500">
                    Current
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

