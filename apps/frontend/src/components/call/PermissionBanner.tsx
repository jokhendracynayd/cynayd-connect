interface PermissionBannerProps {
  hasPermissionIssue: boolean;
  permissionBannerDismissed: boolean;
  permissionErrors: {
    audio: boolean;
    video: boolean;
  };
  onDismiss: () => void;
  onRetryAudio: () => void;
  onRetryVideo: () => void;
}

export default function PermissionBanner({
  hasPermissionIssue,
  permissionBannerDismissed,
  permissionErrors,
  onDismiss,
  onRetryAudio,
  onRetryVideo,
}: PermissionBannerProps) {
  if (!hasPermissionIssue || permissionBannerDismissed) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex w-full max-w-3xl flex-col gap-3 rounded-[24px] border border-amber-200 bg-white/95 p-4 shadow-[0_18px_55px_-28px_rgba(251,191,36,0.55)] backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L4.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-800">You're in listen-only mode</p>
              <p className="mt-1 text-sm text-amber-700">
                Your browser blocked access to {permissionErrors.audio && permissionErrors.video ? 'the microphone and camera' : permissionErrors.audio ? 'the microphone' : 'the camera'}. Use the controls below to grant permission and re-enable them.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-transparent text-amber-600 transition hover:border-amber-200 hover:bg-amber-50"
            aria-label="Dismiss permission warning"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {permissionErrors.audio && (
            <button
              type="button"
              onClick={onRetryAudio}
              className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-slate-700"
            >
              Retry microphone
            </button>
          )}
          {permissionErrors.video && (
            <button
              type="button"
              onClick={onRetryVideo}
              className="inline-flex items-center gap-2 rounded-full border border-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-900 transition hover:bg-slate-900 hover:text-white"
            >
              Retry camera
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

