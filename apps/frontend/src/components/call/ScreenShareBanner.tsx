interface ScreenShareBannerProps {
  isScreenSharing: boolean;
  onStopScreenShare: () => void;
}

export default function ScreenShareBanner({
  isScreenSharing,
  onStopScreenShare,
}: ScreenShareBannerProps) {
  if (!isScreenSharing) {
    return null;
  }

  return (
    <div className="flex items-center justify-between border-b border-amber-200 bg-amber-100/90 px-6 py-3 text-amber-700 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-medium">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
        <span>You are sharing your screen</span>
      </div>
      <button
        onClick={onStopScreenShare}
        className="text-sm font-semibold underline transition hover:text-amber-900"
      >
        Stop sharing
      </button>
    </div>
  );
}

