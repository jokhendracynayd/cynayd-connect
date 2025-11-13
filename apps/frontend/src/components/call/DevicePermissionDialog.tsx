import { useEffect } from 'react';
import type { DeviceIssueType } from '../../lib/deviceStatus';
import { detectOS, getPermissionInstructions, getBrowserPermissionInstructions } from '../../lib/deviceStatus';

interface DevicePermissionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
  deviceType: 'audio' | 'video';
  issueType: DeviceIssueType;
  errorReason?: string;
  canRetry?: boolean;
}

export default function DevicePermissionDialog({
  isOpen,
  onClose,
  onRetry,
  deviceType,
  issueType,
  errorReason,
  canRetry = false,
}: DevicePermissionDialogProps) {
  const os = detectOS();
  const deviceName = deviceType === 'audio' ? 'microphone' : 'camera';
  const deviceDisplayName = deviceType === 'audio' ? 'Mic' : 'Camera';

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const getDialogContent = () => {
    switch (issueType) {
      case 'permission-denied':
        return {
          title: `Your ${deviceName} is blocked`,
          description: getBrowserPermissionInstructions(deviceType),
          systemInstructions: getPermissionInstructions(deviceType, os),
          icon: (
            <svg className="h-12 w-12 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ),
          showSettingsButton: true,
        };
      
      case 'no-device':
        return {
          title: `No ${deviceName} detected`,
          description: `We couldn't find a ${deviceName} connected to your computer.`,
          systemInstructions: `Please check:\n\n1. Your ${deviceName} is properly connected\n2. The ${deviceName} is not being used by another application\n3. Your system recognizes the ${deviceName}`,
          icon: (
            <svg className="h-12 w-12 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          ),
          showSettingsButton: false,
        };
      
      case 'system-muted':
        return {
          title: `Your ${deviceName} is muted by your system settings`,
          description: getPermissionInstructions(deviceType, os),
          systemInstructions: null,
          icon: (
            <svg className="h-12 w-12 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2a3 3 0 00-3 3v6a3 3 0 106 0V5a3 3 0 00-3-3zM10 5a2 2 0 114 0v6a2 2 0 11-4 0V5zm-5 6a1 1 0 011 1 6 6 0 0012 0 1 1 0 112 0 8 8 0 01-7 7.938V22h4a1 1 0 110 2H7a1 1 0 110-2h4v-2.062A8 8 0 014 12a1 1 0 011-1z" />
              <path d="M23 1L1 23" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
            </svg>
          ),
          showSettingsButton: true,
        };
      
      case 'device-busy':
        return {
          title: `${deviceDisplayName} is busy or unavailable`,
          description: `Your ${deviceName} might be in use by another application.`,
          systemInstructions: `Try these steps:\n\n1. Close other applications that might be using your ${deviceName}\n2. Restart your browser\n3. Check if your ${deviceName} is working in other applications`,
          icon: (
            <svg className="h-12 w-12 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          showSettingsButton: false,
        };
      
      default:
        return {
          title: `${deviceDisplayName} issue`,
          description: errorReason || `There was an issue accessing your ${deviceName}.`,
          systemInstructions: 'Please check your device settings and try again.',
          icon: (
            <svg className="h-12 w-12 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
          showSettingsButton: false,
        };
    }
  };

  const content = getDialogContent();

  const handleOpenSettings = () => {
    // Attempt to open system settings (works on some platforms)
    if (os === 'windows') {
      // Windows 10+ settings protocol
      if (deviceType === 'audio') {
        window.open('ms-settings:privacy-microphone', '_blank');
      } else {
        window.open('ms-settings:privacy-webcam', '_blank');
      }
    } else if (os === 'mac') {
      // macOS doesn't support direct deep links to specific settings panels from browser
      alert('Please open System Settings > Privacy & Security > ' + (deviceType === 'audio' ? 'Microphone' : 'Camera'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-2xl">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close dialog"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Icon */}
        <div className="mb-4 flex justify-center">
          {content.icon}
        </div>

        {/* Title */}
        <h2 className="mb-3 text-center text-xl font-bold text-slate-900">
          {content.title}
        </h2>

        {/* Description */}
        <p className="mb-4 whitespace-pre-line text-center text-sm text-slate-600">
          {content.description}
        </p>

        {/* System instructions */}
        {content.systemInstructions && (
          <div className="mb-6 rounded-lg bg-slate-50 p-4">
            <p className="whitespace-pre-line text-xs text-slate-700">
              {content.systemInstructions}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {content.showSettingsButton && (
            <button
              type="button"
              onClick={handleOpenSettings}
              className="w-full rounded-full bg-cyan-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-cyan-700"
            >
              Open {deviceType === 'audio' ? 'Sound' : 'Camera'} Settings
            </button>
          )}
          
          {canRetry && onRetry && (
            <button
              type="button"
              onClick={() => {
                onRetry();
                onClose();
              }}
              className="w-full rounded-full border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Try Again
            </button>
          )}
          
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full px-6 py-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
          >
            Dismiss
          </button>
        </div>

        {/* Learn more link */}
        <div className="mt-4 text-center">
          <a
            href="https://support.google.com/chrome/answer/2693767"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-cyan-600 transition hover:text-cyan-700 hover:underline"
          >
            Learn more
          </a>
        </div>
      </div>
    </div>
  );
}

